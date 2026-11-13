import { percent, shortHash, statusLabel, statusTone, verdictClass, verdictWord } from "@/lib/format";
import type { CaseStatus, Verdict } from "@/lib/types";

export function StatusLabel({ status, large = false, children }: { status: CaseStatus; large?: boolean; children?: React.ReactNode }) {
  return <span className={`status s-${statusTone[status]}${large ? " status-lg" : ""}`}>{children ?? statusLabel[status]}</span>;
}

// Free text label in a status color, e.g. "4 of 4 agree · needs 2".
export function ToneLabel({ tone, children }: { tone: "progress" | "funded" | "delivered" | "review" | "rejected" | "expired"; children: React.ReactNode }) {
  return <span className={`status s-${tone}`}>{children}</span>;
}

export function VerdictMark({ verdict, children, className = "", style }: { verdict: Verdict | null; children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const cls = verdict ? verdictClass[verdict] : "v-wait";
  return (
    <span className={`verdict ${cls} ${className}`} style={style}>
      {children ?? (verdict ? verdictWord[verdict] : "Hasn't voted yet")}
    </span>
  );
}

export function TierChip({ tier, label }: { tier: number; label?: string }) {
  return (
    <span className="tier">
      {label ?? (tier > 0 ? `Tier ${tier}` : "Not set")}
      <span className="tier-bars" aria-hidden>
        {[1, 2, 3, 4].map((n) => (
          <i key={n} className={n <= tier ? "on" : ""} />
        ))}
      </span>
    </span>
  );
}

export function SimulatedTag() {
  return (
    <span className="tag-sim" title="A bot run by the LifeLine team for the demo, not a real NGO.">
      Simulated
    </span>
  );
}

export function ComingNextTag() {
  return <span className="tag-soon">Coming next</span>;
}

export type NoticeTone = "info" | "warn" | "block" | "ok" | "plain";

export function Notice({ tone, title, children, role }: { tone: NoticeTone; title?: string; children?: React.ReactNode; role?: string }) {
  return (
    <div className={`notice n-${tone}`} role={role}>
      <span>
        {title && <b>{title}</b>} {children}
      </span>
    </div>
  );
}

export function Hash({ value }: { value: string }) {
  return (
    <span className="hash" title={value}>
      {shortHash(value)}
    </span>
  );
}

export function Skel({ w = "100%", h = 14, r, className = "" }: { w?: number | string; h?: number | string; r?: number | string; className?: string }) {
  return <span className={`skel block ${className}`} style={{ width: w, height: h, borderRadius: r }} />;
}

export function ConfidenceMeter({ bps }: { bps: number }) {
  const on = Math.round(bps / 1000);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <span className="meter" aria-hidden>
        {Array.from({ length: 10 }, (_, k) => (
          <i key={k} className={k < on ? "on" : ""} />
        ))}
      </span>
      <span className="num body-s" style={{ color: "var(--ink)", fontWeight: 600 }}>
        {percent(bps)} confident
      </span>
    </div>
  );
}

// Empty state: dashed box, plain sentence.
export function Empty({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center" style={{ borderStyle: "dashed", boxShadow: "none", background: "transparent" }}>
      <svg width="56" height="56" viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r="46" fill="none" stroke="#CDCAC0" strokeWidth="10" strokeDasharray="67.4 4.86" />
      </svg>
      <p style={{ fontWeight: 650 }}>{children}</p>
      {action}
    </div>
  );
}
