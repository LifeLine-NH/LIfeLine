import Link from "next/link";

export default function CaseNotFound() {
  return (
    <div className="wrap section">
      <div className="card dotgrid flex flex-col items-start gap-4" style={{ padding: "56px 40px" }}>
        <svg width="72" height="72" viewBox="0 0 120 120" aria-hidden>
          <circle cx="60" cy="60" r="46" fill="none" stroke="#CDCAC0" strokeWidth="10" strokeDasharray="6 5" />
          <text x="60" y="68" textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontWeight="700" fontSize="26" fill="#62677A">
            ?
          </text>
        </svg>
        <h1 className="h2">No case with this id</h1>
        <p className="muted" style={{ maxWidth: 460 }}>
          We looked for this case in the relief contract and didn&apos;t find it. Check the id, or browse every case, including rejected ones.
        </p>
        <Link className="btn btn-primary" href="/cases">
          See all cases
        </Link>
      </div>
    </div>
  );
}
