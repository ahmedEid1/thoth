type Step = {
  id: string;
  nodeName: string;
  startedAt: Date | string;
  endedAt: Date | string | null;
  traceUrl: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  failureReason: string | null;
};

export function RunStepList({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return <p className="text-muted-foreground text-sm">No steps yet.</p>;

  return (
    <ol className="space-y-2 text-sm">
      {steps.map((s) => (
        <li key={s.id} className="flex items-center justify-between rounded border bg-card px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground">
              {s.endedAt ? "✓" : "…"}
            </span>
            <span className="font-medium">{s.nodeName}</span>
            {s.failureReason && (
              <span className="text-destructive text-xs">{s.failureReason}</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>in {s.inputTokens} · out {s.outputTokens}</span>
            {s.traceUrl && (
              <a href={s.traceUrl} target="_blank" rel="noreferrer" className="underline">
                trace ↗
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
