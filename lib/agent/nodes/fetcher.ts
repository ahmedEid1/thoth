import { db } from "@/lib/db";
import { putObject } from "@/lib/object-store";
import { parsePdfWithMistral } from "@/lib/pdf-parse";
import { addStep, finishStep } from "@/lib/agent/runs";
import { assertWithinBudget } from "@/lib/agent/cost-cap";
import { randomUUID } from "node:crypto";
import type { AgentState, DiscoveredPaperRef } from "@/lib/agent/state";

/** Hard cap on a downloaded PDF — mirrors the upload route's 25 MB. */
const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** Bounded concurrent fetches (per V2 spec §5). */
const CONCURRENCY = 8;

/** Per-HEAD/GET request timeout. */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * V2 fetcher node — downloads PDFs for open-access discovered papers,
 * OCRs them via Mistral, and writes a CorpusItem row that downstream
 * nodes (screener, assessor) can read.
 *
 * Paywalled / unknown-access papers are skipped silently: the screener
 * falls back to abstract-only scoring for those, and the assessor can
 * still drop them if their abstract doesn't carry enough signal.
 *
 * Concurrency is bounded at 8 so one slow provider URL doesn't stall
 * the run. Cost-cap participates per discovered paper that hits OCR
 * (we don't get an exact token count from Mistral OCR, so we estimate
 * ~50 tokens per page — same heuristic the spec §7 budgets against).
 *
 * Idempotent across retries: if a DiscoveredPaper already has a
 * `corpusItemId`, the fetcher skips it (a Trigger.dev retry of the
 * task replays the node, and we don't want to double-create CorpusItems).
 */
export async function fetcherNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  if (state.discoveredPapers.length === 0) {
    // Nothing to fetch — the discoverer surfaced nothing, or every hit
    // is paywalled. The screener can still run on abstracts.
    return {};
  }

  await assertWithinBudget(state.runId);
  const outerStep = await addStep({ runId: state.runId, nodeName: "fetcher" });

  try {
    // V2 — honor the user's per-row drops from the discovery_gate. When
    // discoveryApproved.keptExternalIds is set, only papers in that list
    // pass to the fetcher (and downstream the screener). When unset, every
    // discovered paper is kept (the user approved-as-is).
    const keptIds = state.discoveryApproved?.keptExternalIds;
    const kept = keptIds
      ? state.discoveredPapers.filter((p) => keptIds.includes(p.externalId))
      : state.discoveredPapers;

    const fetchable = kept.filter(
      (p) =>
        p.accessStatus === "open" &&
        typeof p.oaUrl === "string" &&
        p.oaUrl.length > 0 &&
        p.corpusItemId === null,
    );

    const updatedRefs = await runBoundedConcurrent(
      fetchable,
      CONCURRENCY,
      (paper) => fetchOne(state, paper),
    );

    // Merge the updated refs back into the kept set (keep paywalled / failed
    // entries unchanged in state so the screener still sees them — but only
    // among papers the user kept). Papers the user dropped at discovery_gate
    // are pruned from state here so the screener never bills LLM calls on
    // them; the underlying DiscoveredPaper DB rows remain so the run-detail
    // page / MCP tools can still show "the discoverer surfaced N, you kept M".
    const updatedById = new Map(updatedRefs.map((u) => [u.id, u]));
    const merged: DiscoveredPaperRef[] = kept.map(
      (p) => updatedById.get(p.id) ?? p,
    );

    const fetchedCount = updatedRefs.filter(
      (u) => u.corpusItemId !== null,
    ).length;
    const skippedCount = updatedRefs.length - fetchedCount;
    await finishStep({
      stepId: outerStep.id,
      failureReason:
        skippedCount > 0
          ? `fetched=${fetchedCount} skipped=${skippedCount} (paywalled / download failures recorded per-row)`
          : undefined,
    });

    return { discoveredPapers: merged };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await finishStep({ stepId: outerStep.id, failureReason: reason.slice(0, 1000) });
    throw err;
  }
}

/**
 * Download, OCR, persist a single discovered paper. Returns the ref with
 * `corpusItemId` populated on success; with the original null on every
 * skippable failure (404 / 4xx / non-PDF / OCR error / timeout). Throws
 * only when something unexpected happens at the DB layer — a bad PDF URL
 * is NOT an exception.
 */
async function fetchOne(
  state: AgentState,
  paper: DiscoveredPaperRef,
): Promise<DiscoveredPaperRef> {
  if (!paper.oaUrl) return paper;
  const innerStep = await addStep({
    runId: state.runId,
    nodeName: "fetcher_paper",
  });

  try {
    const bytes = await downloadPdf(paper.oaUrl);
    if (bytes === null) {
      // Non-fatal download failure — log + skip.
      await finishStep({
        stepId: innerStep.id,
        failureReason: `download failed for ${paper.externalId}`,
      });
      return paper;
    }

    const key = `corpus/discovered/${state.projectId}/${randomUUID()}.pdf`;
    await putObject(key, bytes, "application/pdf");

    const { markdown, pageCount } = await parsePdfWithMistral(bytes);

    // Build the cross-reference columns. arXiv hits use the arxiv id,
    // OpenAlex uses DOI when present (already stripped of the doi.org
    // prefix by the OpenAlex adapter).
    let externalDoi: string | null = null;
    let externalArxivId: string | null = null;
    if (paper.provider === "arxiv" && paper.externalId.startsWith("arxiv:")) {
      externalArxivId = paper.externalId.slice("arxiv:".length);
    } else if (!paper.externalId.startsWith("openalex:")) {
      // Anything not provider-prefixed is a DOI in our normalization.
      externalDoi = paper.externalId;
    }

    const corpusItem = await db.corpusItem.create({
      data: {
        projectId: state.projectId,
        kind: "PDF",
        status: "PARSED",
        source: `${paper.provider}:${paper.externalId}`,
        parsedMarkdown: markdown,
        externalDoi,
        externalArxivId,
      },
      select: { id: true },
    });
    await db.discoveredPaper.update({
      where: { id: paper.id },
      data: { corpusItemId: corpusItem.id },
    });

    await finishStep({
      stepId: innerStep.id,
      // Use the page count as a proxy for token cost (Mistral OCR isn't
      // a token-billed API but we keep the bookkeeping consistent so the
      // cost-cap sums see the discovery phase's spend).
      inputTokens: 0,
      outputTokens: pageCount * 50,
      cacheReadInputTokens: 0,
    });

    return { ...paper, corpusItemId: corpusItem.id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await finishStep({
      stepId: innerStep.id,
      failureReason: reason.slice(0, 1000),
    });
    // Non-fatal: skip this paper. The discoverer's hits include paywalled
    // ones with abstract-only metadata, so the screener can still produce
    // a sensible decision without the full text.
    return paper;
  }
}

/**
 * Is a dotted-quad's leading octets in a private / loopback / metadata
 * / wildcard range? `a`/`b` are the first two octets.
 */
function isPrivateIPv4(a: number, b: number): boolean {
  if (a === 127) return true; // loopback 127/8
  if (a === 169 && b === 254) return true; // link-local + cloud metadata 169.254/16
  if (a === 10) return true; // RFC 1918 10/8
  if (a === 192 && b === 168) return true; // RFC 1918 192.168/16
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918 172.16-31/12
  if (a === 0) return true; // 0/8 wildcard
  return false;
}

/**
 * Extract the embedded IPv4 of an IPv4-mapped/compatible IPv6 host as
 * `[octet0, octet1]` (enough for `isPrivateIPv4`), or null. Handles BOTH:
 *   - dotted form `::ffff:a.b.c.d` (some runtimes preserve it), and
 *   - the hex-group form Node normalizes to: `::ffff:HHHH:HHHH`
 *     (e.g. `::ffff:169.254.169.254` → `::ffff:a9fe:a9fe`).
 */
function embeddedMappedIPv4(host: string): [number, number] | null {
  const dotted = host.match(/:(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (dotted) return [Number(dotted[1]), Number(dotted[2])];
  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/);
  if (hex) {
    const g = parseInt(hex[1]!, 16); // first 16 bits = octets 0 + 1
    return [(g >> 8) & 0xff, g & 0xff];
  }
  return null;
}

/**
 * SSRF defense — reject URLs whose host targets internal services.
 *
 * The fetcher pulls PDFs from URLs in `DiscoveredPaper.oaUrl`, which
 * originate in provider responses (OpenAlex / arXiv / Exa). A
 * compromised or malicious provider response could include URLs
 * pointing at:
 *   - localhost / 127.0.0.1 / ::1 — same-host internal services
 *   - 169.254.169.254 — AWS/GCP metadata service (would leak IAM creds)
 *   - 10.x / 172.16-31.x / 192.168.x — RFC 1918 private subnets
 *   - IPv6 loopback (::1), link-local (fe80::/10), unique-local (fc00::/7)
 *   - IPv4-mapped IPv6 to any of the above (`::ffff:169.254.169.254`)
 *   - Alternate IPv4 encodings — bare decimal (`2130706433`), hex
 *     (`0x7f000001`), octal octets (`0177.0.0.1`) — that `inet_aton`
 *     resolves to internal addresses but a naive dotted-quad check misses
 *   - Any non-HTTP(S) scheme — file://, ftp://, gopher:// are redirect-bait
 *
 * Reject all of these BEFORE hitting fetch(). Vercel's network isolation
 * already blocks the practical cases; Trigger.dev workers run in different
 * infrastructure where SSRF defense is still useful.
 *
 * Out of scope (would need resolution-time checks): DNS rebinding — a
 * public hostname that resolves to a private IP. Mitigated in practice by
 * the host infra's egress controls.
 */
export function isSafeExternalUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  let host = parsed.hostname.toLowerCase();
  // Some runtimes keep the brackets on an IPv6 literal hostname; strip them.
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);

  if (host === "localhost") return false;

  // --- IPv6 literals (contain a colon) ---
  if (host.includes(":")) {
    if (host === "::1" || host === "::") return false; // loopback / unspecified
    if (host.startsWith("fe80:")) return false; // link-local fe80::/10
    if (host.startsWith("fc") || host.startsWith("fd")) return false; // unique-local fc00::/7
    // IPv4-mapped (::ffff:a.b.c.d, normalized by Node to ::ffff:HHHH:HHHH):
    // re-check the embedded IPv4 against the private ranges.
    const embedded = embeddedMappedIPv4(host);
    if (embedded && isPrivateIPv4(embedded[0], embedded[1])) return false;
    return true; // other global-unicast IPv6 — allowed
  }

  // --- IPv4 in any encoding ---
  // A legitimate PDF host is a DNS name or a canonical dotted-quad. Any
  // host made entirely of numeric/hex labels is an IPv4 literal in some
  // encoding; only a canonical, public dotted-quad is allowed. Everything
  // else (bare decimal, hex, octal-octet, wrong label count) is rejected —
  // these resolve to addresses a plain decimal parse would misclassify.
  const labels = host.split(".");
  const allNumericLabels = labels.every((l) => /^(0x[0-9a-f]+|\d+)$/.test(l));
  if (allNumericLabels) {
    const canonicalQuad =
      labels.length === 4 &&
      labels.every((l) => /^(0|[1-9]\d{0,2})$/.test(l) && Number(l) <= 255);
    if (!canonicalQuad) return false; // bare int / hex / octal / malformed
    if (isPrivateIPv4(Number(labels[0]), Number(labels[1]))) return false;
    return true;
  }

  // --- DNS name — allowed (DNS-rebind out of scope, see doc above) ---
  return true;
}

/** Return the PDF bytes on success; null on any expected fetch failure. */
async function downloadPdf(url: string): Promise<Uint8Array | null> {
  // SSRF defense — reject internal-targeting URLs before the HEAD call.
  if (!isSafeExternalUrl(url)) return null;
  try {
    // HEAD first to bail out on non-PDF or oversized payloads before
    // streaming. Some servers don't expose Content-Length on HEAD; in that
    // case we accept and check the body length after the GET.
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!head.ok) return null;
    const headType = head.headers.get("content-type")?.toLowerCase() ?? "";
    if (headType && !headType.includes("pdf")) return null;
    const headLen = head.headers.get("content-length");
    if (headLen && Number(headLen) > MAX_PDF_BYTES) return null;

    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_PDF_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

/**
 * Run `fn` over `items` with at most `n` in flight. Order is preserved
 * (Promise.all on the worker pool semantics) and errors propagate.
 */
async function runBoundedConcurrent<T, U>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return results;
}
