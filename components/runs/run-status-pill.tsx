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
  | "FAILED";

const VARIANT: Record<RunStatus, "default" | "secondary" | "outline" | "destructive"> = {
  PENDING: "outline",
  PLANNING: "secondary",
  AWAITING_PLAN_APPROVAL: "default",
  RETRIEVING: "secondary",
  AWAITING_PAPERS_APPROVAL: "default",
  ASSESSING: "secondary",
  DRAFTING: "secondary",
  COMPLETED: "default",
  REJECTED: "destructive",
  FAILED: "destructive",
};

export function RunStatusPill({ status }: { status: RunStatus }) {
  return <Badge variant={VARIANT[status]}>{status.toLowerCase().replace(/_/g, " ")}</Badge>;
}
