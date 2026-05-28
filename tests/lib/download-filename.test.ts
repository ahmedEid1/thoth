import { describe, it, expect } from "vitest";
import { buildRunFilename } from "@/lib/download-filename";

const startedAt = new Date("2026-05-28T14:00:00Z");

describe("buildRunFilename", () => {
  it("slugifies the project title + appends the run date + suffix", () => {
    expect(
      buildRunFilename({
        projectTitle: "Archaeal Hibernation: A Systematic Review",
        runId: "cm123abc",
        startedAt,
        suffix: "md",
      }),
    ).toBe("thoth-archaeal-hibernation-a-systematic-review-2026-05-28.md");
  });

  it("uses a single dot before the suffix so the OS detects the file type", () => {
    const out = buildRunFilename({
      projectTitle: "x",
      runId: "r",
      startedAt,
      suffix: "md",
    });
    expect(out).toBe("thoth-x-2026-05-28.md");
    expect(out.endsWith(".md")).toBe(true);
  });

  it("works for the multi-extension suffixes used by the download routes", () => {
    expect(
      buildRunFilename({
        projectTitle: "GAT Review",
        runId: "cm1",
        startedAt,
        suffix: "audit.json",
      }),
    ).toBe("thoth-gat-review-2026-05-28.audit.json");
    expect(
      buildRunFilename({
        projectTitle: "GAT Review",
        runId: "cm1",
        startedAt,
        suffix: "citations.bib",
      }),
    ).toBe("thoth-gat-review-2026-05-28.citations.bib");
  });

  it("collapses non-alphanumeric runs to single dashes + lowercases", () => {
    expect(
      buildRunFilename({
        projectTitle: "Foo!! BAR --- baz",
        runId: "r",
        startedAt,
        suffix: "md",
      }),
    ).toBe("thoth-foo-bar-baz-2026-05-28.md");
  });

  it("trims leading + trailing dashes from the slug", () => {
    expect(
      buildRunFilename({
        projectTitle: "  --foo--  ",
        runId: "r",
        startedAt,
        suffix: "md",
      }),
    ).toBe("thoth-foo-2026-05-28.md");
  });

  it("truncates a long title at a word boundary near 60 chars", () => {
    const long =
      "a very long title that goes on and on about archaeal hibernation in deep extremophile populations across multiple sea floors";
    const out = buildRunFilename({
      projectTitle: long,
      runId: "r",
      startedAt,
      suffix: "md",
    });
    // Slug portion (between "thoth-" and "-2026") should be <= 60 chars
    // AND should not have a trailing partial word.
    const slug = out.slice("thoth-".length, out.indexOf("-2026"));
    expect(slug.length).toBeLessThanOrEqual(60);
    // Truncation honors a dash boundary, so the last token is complete.
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back to the run id when the title slugifies to empty", () => {
    expect(
      buildRunFilename({
        projectTitle: "!!!",
        runId: "cmAbc123",
        startedAt,
        suffix: "md",
      }),
    ).toBe("thoth-cmAbc123-2026-05-28.md");
  });

  it("renders 'unknown-date' when startedAt is invalid", () => {
    expect(
      buildRunFilename({
        projectTitle: "x",
        runId: "r",
        startedAt: new Date("not-a-date"),
        suffix: "md",
      }),
    ).toBe("thoth-x-unknown-date.md");
  });

  it("uses UTC date components so a server in any TZ produces the same name", () => {
    // 2026-05-28T23:30:00Z is May 29 in PDT (UTC-7). We want UTC's May 28.
    expect(
      buildRunFilename({
        projectTitle: "x",
        runId: "r",
        startedAt: new Date("2026-05-28T23:30:00Z"),
        suffix: "md",
      }),
    ).toBe("thoth-x-2026-05-28.md");
  });
});
