import type { CaseStatus } from "@/lib/types";

const stamps: Partial<Record<CaseStatus, { text: string; cls: string }>> = {
  Verified: { text: "Verified", cls: "text-verified" },
  Bidding: { text: "Verified", cls: "text-verified" },
  Awarded: { text: "Verified", cls: "text-verified" },
  ProofSubmitted: { text: "Verified", cls: "text-verified" },
  Delivered: { text: "Delivered", cls: "text-tarp" },
  Rejected: { text: "Rejected", cls: "text-stamp" },
  NeedsReview: { text: "Human review", cls: "text-review" },
  Expired: { text: "Expired", cls: "text-expired" },
};

export function Stamp({ status, size = "lg", land = false }: { status: CaseStatus; size?: "sm" | "lg"; land?: boolean }) {
  const stamp = stamps[status];
  if (!stamp) return null;
  const sizeCls = size === "lg" ? "text-4xl sm:text-5xl" : "text-xl";
  return (
    <span className={`stamp uppercase ${sizeCls} ${stamp.cls} ${land ? "stamp-land" : ""}`} role="img" aria-label={`Stamped ${stamp.text}`}>
      {stamp.text}
    </span>
  );
}
