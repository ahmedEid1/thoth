"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls `router.refresh()` every 2s while a Run is in a non-terminal state.
 * Pauses polling when the tab is hidden — agent runs take 5-15 minutes so
 * background-tab polling would otherwise waste a few hundred Vercel function
 * invocations per run, with no UI to update. Refreshes once immediately on
 * tab return so the user always sees current state.
 */
export function RefreshTick({ run }: { run: { status: string } }) {
  return <RefreshTickList runs={[run]} />;
}

/**
 * Polls `router.refresh()` every 2s while ANY run in the list is in a
 * non-terminal state. Used on the project page so the runs list's status
 * pills stay live without a manual reload while one or more runs are
 * still progressing (the single-run RefreshTick above wraps this for
 * the run-detail page).
 *
 * Pauses polling when the tab is hidden — agent runs take 5-15 minutes
 * so background-tab polling would otherwise waste a few hundred Vercel
 * function invocations per run, with no UI to update. Refreshes once
 * immediately on tab return so the user always sees current state.
 */
export function RefreshTickList({ runs }: { runs: { status: string }[] }) {
  const router = useRouter();
  // Compute a stable signature: "P,P,C" — so the effect re-evaluates on every
  // status change but doesn't re-fire just because the array reference flipped.
  const sig = runs.map((r) => r.status).join(",");
  useEffect(() => {
    const terminal = new Set(["COMPLETED", "REJECTED", "FAILED"]);
    const anyActive = sig.split(",").some((s) => s !== "" && !terminal.has(s));
    if (!anyActive) return;

    let intervalId: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (intervalId !== undefined) return;
      intervalId = setInterval(() => router.refresh(), 2000);
    };
    const stop = () => {
      if (intervalId === undefined) return;
      clearInterval(intervalId);
      intervalId = undefined;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [sig, router]);
  return null;
}
