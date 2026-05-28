import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { safeFetch, downloadPdf } from "@/lib/agent/nodes/fetcher";

// safeFetch + downloadPdf hit global fetch; stub it per-test.
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.unstubAllGlobals());

const MB = 1024 * 1024;

describe("safeFetch — SSRF-safe manual redirect following (M111)", () => {
  it("returns the final response when there are no redirects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );
    const res = await safeFetch("https://arxiv.org/pdf/x", "GET");
    expect(res?.status).toBe(200);
  });

  it("follows a redirect to ANOTHER public URL + returns the final response", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://doi.org/10.1/x") {
        return new Response(null, { status: 302, headers: { location: "https://publisher.example/paper.pdf" } });
      }
      return new Response("pdf", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as never);
    const res = await safeFetch("https://doi.org/10.1/x", "GET");
    expect(res?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("REJECTS a redirect to an internal address (the SSRF bypass)", async () => {
    // A safe initial URL that 302s to the cloud metadata service — the
    // exact bypass native redirect:"follow" would have allowed.
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://publisher.example/paper.pdf") {
        return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
      }
      return new Response("should-never-reach-here", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as never);
    const res = await safeFetch("https://publisher.example/paper.pdf", "GET");
    expect(res).toBeNull();
    // It fetched the first URL + saw the redirect, but did NOT fetch the
    // internal target.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an internal target reached via a relative redirect resolved against a safe host... that stays safe", async () => {
    // Relative redirect resolves against the current (safe) origin → safe.
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://publisher.example/a") {
        return new Response(null, { status: 301, headers: { location: "/b/paper.pdf" } });
      }
      return new Response("pdf", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as never);
    const res = await safeFetch("https://publisher.example/a", "GET");
    expect(res?.status).toBe(200);
    // Second call should be the resolved absolute URL on the same host.
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://publisher.example/b/paper.pdf",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("gives up after too many redirects", async () => {
    // Infinite redirect loop → bail after MAX_REDIRECTS.
    const fetchMock = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: "https://public.example/loop" } }),
    );
    vi.stubGlobal("fetch", fetchMock as never);
    const res = await safeFetch("https://public.example/loop", "GET");
    expect(res).toBeNull();
    // 1 initial + MAX_REDIRECTS (5) hops = 6 fetch calls, then give up.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("returns null when a redirect has no Location header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 302 })) as never,
    );
    expect(await safeFetch("https://public.example/x", "GET")).toBeNull();
  });
});

describe("downloadPdf — streamed size cap (M111)", () => {
  function streamResponse(chunks: Uint8Array[], headers: Record<string, string> = {}): Response {
    const stream = new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers });
  }

  it("rejects a body that streams past MAX_PDF_BYTES even with no Content-Length", async () => {
    // HEAD says pdf, no content-length. GET streams 26 × 1MB = 26MB > 25MB cap.
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return new Response(null, { status: 200, headers: { "content-type": "application/pdf" } });
      }
      const chunks = Array.from({ length: 26 }, () => new Uint8Array(MB));
      return streamResponse(chunks, { "content-type": "application/pdf" });
    });
    vi.stubGlobal("fetch", fetchMock as never);
    const out = await downloadPdf("https://arxiv.org/pdf/huge");
    expect(out).toBeNull();
  });

  it("accepts a small streamed PDF body", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return new Response(null, { status: 200, headers: { "content-type": "application/pdf" } });
      }
      return streamResponse([pdf], { "content-type": "application/pdf" });
    });
    vi.stubGlobal("fetch", fetchMock as never);
    const out = await downloadPdf("https://arxiv.org/pdf/small");
    expect(out).not.toBeNull();
    expect(out!.length).toBe(5);
  });

  it("rejects when the HEAD content-length already exceeds the cap", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 200,
        headers: { "content-type": "application/pdf", "content-length": String(30 * MB) },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as never);
    expect(await downloadPdf("https://arxiv.org/pdf/big")).toBeNull();
  });

  it("rejects an internal URL outright (defense before any fetch)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as never);
    expect(await downloadPdf("http://169.254.169.254/x")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
