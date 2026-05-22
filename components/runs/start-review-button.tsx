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
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Failed (${res.status})`);
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
