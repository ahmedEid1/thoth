"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Plan = {
  picoc: { population: string; intervention: string; comparison: string; outcome: string; context: string };
  subQuestions: string[];
  inclusionCriteria: string[];
  exclusionCriteria: string[];
};

export function PlanApprovalCard({
  runId,
  checkpointId,
  plan,
}: {
  runId: string;
  checkpointId: string;
  plan: Plan;
}) {
  const [isPending, startTransition] = useTransition();
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const router = useRouter();

  function approve() {
    startTransition(async () => {
      await fetch(`/api/runs/${runId}/checkpoints/${checkpointId}/approve`, { method: "POST" });
      router.refresh();
    });
  }

  function reject() {
    startTransition(async () => {
      await fetch(`/api/runs/${runId}/checkpoints/${checkpointId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      router.refresh();
    });
  }

  return (
    <Card className="p-5 space-y-4 border-primary">
      <div>
        <h3 className="text-lg font-semibold">Review proposed plan</h3>
        <p className="text-sm text-muted-foreground">
          The planner produced this plan. Approve to start retrieving papers, or reject and the run ends.
        </p>
      </div>

      <section className="text-sm">
        <h4 className="font-medium mb-2">PICOC</h4>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(plan.picoc).map(([k, v]) => (
            <div key={k} className="rounded border p-2">
              <dt className="text-xs uppercase text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="text-sm">
        <h4 className="font-medium mb-1">Sub-questions</h4>
        <ul className="list-disc pl-5 space-y-1">{plan.subQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
      </section>

      <section className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <h4 className="font-medium mb-1">Inclusion criteria</h4>
          <ul className="list-disc pl-5 space-y-1">{plan.inclusionCriteria.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
        <div>
          <h4 className="font-medium mb-1">Exclusion criteria</h4>
          <ul className="list-disc pl-5 space-y-1">{plan.exclusionCriteria.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      </section>

      {showReject ? (
        <div className="space-y-2">
          <Textarea
            placeholder="Why are you rejecting this plan?"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowReject(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reject} disabled={isPending || !rejectReason}>
              {isPending ? "Rejecting…" : "Confirm reject"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setShowReject(true)} disabled={isPending}>
            Reject
          </Button>
          <Button onClick={approve} disabled={isPending}>
            {isPending ? "Approving…" : "Approve plan"}
          </Button>
        </div>
      )}
    </Card>
  );
}
