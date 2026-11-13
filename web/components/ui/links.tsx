import { config } from "@/lib/config";
import { accountUrl, txUrl } from "@/lib/explorer";

const SAMPLE = config.chainMode === "stub";

// Honesty rule 3: every number links to the record it came from.
// Sample mode shows a "sample" tag and no link; a missing record shows the plain number.
export function SourceAmount({
  children,
  tx,
  href,
  className = "",
  style,
}: {
  children: React.ReactNode;
  tx?: string;
  href?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (SAMPLE) {
    return (
      <span className={`src-sample ${className}`} style={style} title="Sample data: there is no record behind this number.">
        {children}
      </span>
    );
  }
  const url = href ?? txUrl(tx);
  if (!url) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  }
  return (
    <a className={`src ${className}`} style={style} href={url} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

// The relief contract account on the explorer. Pool figures link here.
export function contractUrl(): string | null {
  return config.contractId ? accountUrl(config.contractId) : null;
}

// Small "Vote transaction ↗" style link. Without a record it stays as quiet text.
export function RecLink({
  label,
  tx,
  href,
  external = true,
  style,
}: {
  label: React.ReactNode;
  tx?: string;
  href?: string | null;
  external?: boolean;
  style?: React.CSSProperties;
}) {
  const url = href ?? txUrl(tx);
  if (!url) {
    return (
      <span className="rec-off" style={style} title={SAMPLE ? "Sample data: no transaction behind this." : "No transaction recorded for this step yet."}>
        <span className={SAMPLE ? "src-sample" : ""}>{label}</span>
      </span>
    );
  }
  return (
    <a className="rec" style={style} href={url} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {label}
    </a>
  );
}

export function AccountText({ id, className = "", style }: { id: string; className?: string; style?: React.CSSProperties }) {
  const url = accountUrl(id);
  if (!url) {
    return (
      <span className={`acct ${className}`} style={style} title={id}>
        {id}
      </span>
    );
  }
  return (
    <a className={`acct ${className}`} style={{ color: "inherit", ...style }} href={url} target="_blank" rel="noreferrer" title={id}>
      {id}
    </a>
  );
}
