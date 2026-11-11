import { statusLabel } from "@/lib/format";
import type { CaseStatus } from "@/lib/types";

const dot: Record<CaseStatus, string> = {
  Open: "bg-line",
  Verified: "bg-verified",
  Bidding: "bg-verified",
  Awarded: "bg-verified",
  ProofSubmitted: "bg-verified",
  Delivered: "bg-tarp",
  Rejected: "bg-stamp",
  NeedsReview: "bg-review",
  Expired: "bg-expired",
};

export function StatusTag({ status }: { status: CaseStatus }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium">
      <span className={`h-2.5 w-2.5 rounded-full ${dot[status]}`} aria-hidden />
      {statusLabel[status]}
    </span>
  );
}
