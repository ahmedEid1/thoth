import Link from "next/link";

/**
 * Branded 404 page. Rendered by Next.js whenever:
 *   - the request matches no route (typo'd URL)
 *   - a server component calls `notFound()` (e.g. ownership check fails on
 *     `/projects/:id` — see app/projects/[id]/page.tsx)
 *
 * Without this file, Next.js falls back to its unstyled default which clashes
 * hard with the rest of the editorial design language.
 */
export default function NotFound() {
  return (
    <main
      id="main"
      className="max-w-3xl mx-auto px-6 py-24 flex flex-col items-start gap-8"
    >
      <p className="eyebrow text-[var(--thoth-stone)]">404</p>
      <h1
        className="font-display text-[var(--thoth-blue-ink)] leading-[0.95] tracking-tight"
        style={{
          fontSize: "clamp(3.5rem, 9vw, 7rem)",
          fontWeight: 500,
        }}
      >
        Not found
      </h1>
      <p className="text-lg text-[var(--thoth-blue-ink)] leading-snug max-w-xl">
        The page you tried to open doesn&rsquo;t exist — or you don&rsquo;t
        have access to it. (Thoth reports &ldquo;not found&rdquo; for both
        on purpose, so existence-probing can&rsquo;t leak a real reviewer&rsquo;s
        IDs.)
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[var(--thoth-blue)] text-[var(--thoth-papyrus)] text-sm font-medium tracking-wide hover:bg-[var(--thoth-blue-ink)] transition-colors"
        >
          Back to home
          <span aria-hidden="true">→</span>
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex items-center px-5 py-3 rounded-md text-[var(--thoth-blue-ink)] border border-[var(--thoth-rule)] text-sm font-medium hover:border-[var(--thoth-blue)] hover:text-[var(--thoth-blue)] transition-colors"
        >
          Open dashboard
        </Link>
        <Link
          href="/showcase"
          className="inline-flex items-center px-5 py-3 text-sm text-[var(--thoth-stone)] hover:text-[var(--thoth-blue)] transition-colors"
        >
          See a sample review
        </Link>
      </div>
    </main>
  );
}
