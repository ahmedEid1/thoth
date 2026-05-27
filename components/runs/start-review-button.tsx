"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function StartReviewButton({ projectId, disabled }: { projectId: string; disabled?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function start() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}/runs`, { method: "POST" });
      if (!res.ok) {
        // The route returns several shapes (see /api/projects/[id]/runs/route.ts):
        //   - 409 `run_already_active` and 502 `run_enqueue_failed` both ship a
        //     friendly `message` in addition to the stable `error` code.
        //   - 409 "no PARSED corpus items" ships only `error` (the message).
        // Prefer `message` so the user sees "Run X is already retrieving — wait
        // for it to finish…" instead of the raw `run_already_active` token.
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setError(body.message ?? body.error ?? `Failed (${res.status})`);
        return;
      }
      const { runId } = (await res.json()) as { runId: string };
      router.push(`/projects/${projectId}/runs/${runId}`);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={start} disabled={isPending || disabled}>
        {isPending ? "Starting…" : "Start review"}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
