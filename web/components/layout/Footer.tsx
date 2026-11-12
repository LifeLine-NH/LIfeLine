import { config } from "@/lib/config";
import { accountUrl } from "@/lib/explorer";
import { LogoMark } from "./Logo";

const REPO = "https://github.com/LifeLine-NH/LIfeLine";

export function Footer() {
  const contract = config.contractId ? accountUrl(config.contractId) : null;

  return (
    <footer className="ll" style={{ borderTop: "1px solid var(--line)", background: "var(--paper)" }}>
      <div className="wrap flex flex-wrap items-start justify-between gap-x-10 gap-y-5" style={{ paddingTop: 36, paddingBottom: 40 }}>
        <div className="flex items-center gap-2.5">
          <LogoMark size={22} />
          <span style={{ font: "700 17px/1 var(--font-display)", letterSpacing: "-0.03em" }}>LifeLine</span>
        </div>
        <p className="body-s muted" style={{ flex: "1 1 420px", maxWidth: 640 }}>
          Built at NEAR HACKATHON 2026. Every amount on this site comes from the relief contract or links to the record it came from.
        </p>
        <div className="flex flex-wrap gap-4">
          {contract ? (
            <a className="rec" href={contract} target="_blank" rel="noreferrer">
              Relief contract
            </a>
          ) : (
            <span className="rec-off" title="No relief contract is configured on this site.">
              Relief contract not deployed
            </span>
          )}
          <a className="rec" href={REPO} target="_blank" rel="noreferrer">
            Source code
          </a>
        </div>
      </div>
    </footer>
  );
}
