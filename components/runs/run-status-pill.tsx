import { Badge } from "@/components/ui/badge";

export type RunStatus =
  | "PENDING"
  | "PLANNING"
  | "AWAITING_PLAN_APPROVAL"
  | "RETRIEVING"
  | "AWAITING_PAPERS_APPROVAL"
  | "ASSESSING"
  | "DRAFTING"
  | "COMPLETED"
  | "REJECTED"
  | "FAILED"
  // V2 outbound-search states. Kept in the same union so existing
  // call sites typecheck without changes.
  | "DISCOVERING"
  | "AWAITING_DISCOVERY_APPROVAL"
  | "FETCHING"
  | "SCREENING";

const VARIANT: Record<RunStatus, "default" | "secondary" | "outline" | "destructive"> = {
  PENDING: "outline",
  PLANNING: "secondary",
  AWAITING_PLAN_APPROVAL: "default",
  RETRIEVING: "secondary",
  AWAITING_PAPERS_APPROVAL: "default",
  ASSESSING: "secondary",
  DRAFTING: "secondary",
  COMPLETED: "default",
  // M87: REJECTED is the user's deliberate choice at an HITL gate, not
  // an agent error. Style it as outline (neutral) to match the M86
  // run-detail panel treatment — saving the destructive red for FAILED
  // (true agent crash). The distinction matters when scanning a runs
  // list with mixed terminal states.
  REJECTED: "outline",
  FAILED: "destructive",
  // V2 — match the visual semantics of the V1 equivalents: processing
  // states are "secondary" (subtle), HITL gates are "default" (prominent).
  DISCOVERING: "secondary",
  AWAITING_DISCOVERY_APPROVAL: "default",
  FETCHING: "secondary",
  SCREENING: "secondary",
};

/**
 * Human-readable status label. V2 has more states than V1 so the raw
 * underscore-replace approach reads worse for some labels — explicitly
 * map a handful to friendlier copy and fall through to the generic
 * underscore-replace for the rest.
 */
const LABEL: Partial<Record<RunStatus, string>> = {
  AWAITING_PLAN_APPROVAL: "awaiting plan review",
  AWAITING_PAPERS_APPROVAL: "awaiting paper review",
  AWAITING_DISCOVERY_APPROVAL: "awaiting discovery review",
};

export function statusLabel(status: RunStatus): string {
  return LABEL[status] ?? status.toLowerCase().replace(/_/g, " ");
}

export function RunStatusPill({ status }: { status: RunStatus }) {
  return <Badge variant={VARIANT[status] ?? "outline"}>{statusLabel(status)}</Badge>;
}
