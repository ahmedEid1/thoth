"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Root error boundary. Catches uncaught errors from any server / client
 * component below the root layout and renders a branded recovery page
 * instead of Next.js's unstyled default.
 *
 * Per Next.js's conventions this file MUST be a client component (the
 * framework needs `reset()` to be callable to retry the failed segment)
 * and lives at the route-segment root so it covers every nested page.
 *
 * The `error.digest` is the only piece of the error object we render —
 * Next.js redacts the message in production, replacing it with an opaque
 * digest that ops can correlate with Vercel function logs. Showing the raw
 * stack to the user would leak Prisma error text and internal paths.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the function log so the digest in the UI lines up with
    // something searchable in Vercel.
    console.error("[app/error] uncaught render error:", error);
  }, [error]);

  return (
    <main
      id="main"
      className="max-w-3xl mx-auto px-6 py-24 flex flex-col items-start gap-8"
    >
      <p className="eyebrow text-[var(--thoth-warn)]">Something went wrong</p>
      <h1
        className="font-display text-[var(--thoth-blue-ink)] leading-[0.95] tracking-tight"
        style={{
          fontSize: "clamp(3rem, 8vw, 6rem)",
          fontWeight: 500,
        }}
      >
        Hit an error
      </h1>
      <p className="text-lg text-[var(--thoth-blue-ink)] leading-snug max-w-xl">
        Thoth couldn&rsquo;t render this page. Try the action below to retry
        the segment — if it keeps happening, the digest is what to share with
        the maintainer so they can find it in the function logs.
      </p>
      {error.digest && (
        <p className="text-xs text-[var(--thoth-stone)] font-mono">
          digest: <span className="text-[var(--thoth-blue-ink)]">{error.digest}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[var(--thoth-blue)] text-[var(--thoth-papyrus)] text-sm font-medium tracking-wide hover:bg-[var(--thoth-blue-ink)] transition-colors"
        >
          Try again
          <span aria-hidden="true">↻</span>
        </button>
        <Link
          href="/"
          className="inline-flex items-center px-5 py-3 rounded-md text-[var(--thoth-blue-ink)] border border-[var(--thoth-rule)] text-sm font-medium hover:border-[var(--thoth-blue)] hover:text-[var(--thoth-blue)] transition-colors"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
