import Link from "next/link";

// Whole page failure: the page's main read failed.
export function PageError({ message, reference, retry }: { message?: string; reference?: string; retry?: React.ReactNode }) {
  return (
    <div className="wrap section">
      <div className="card dotgrid flex flex-col items-start gap-4" style={{ padding: "56px 40px" }}>
        <svg width="72" height="72" viewBox="0 0 120 120" aria-hidden>
          <circle cx="60" cy="60" r="46" fill="none" stroke="#BE321A" strokeWidth="10" strokeDasharray="67.4 4.86" opacity=".9" />
          <path d="M46 46l28 28M74 46L46 74" stroke="#BE321A" strokeWidth="8" strokeLinecap="round" />
        </svg>
        <h1 className="h2">This page couldn&apos;t load</h1>
        <p className="muted" style={{ maxWidth: 520 }}>
          Reading from the relief contract failed. The contract may not be deployed yet, or the NEAR RPC may be down.
        </p>
        {message && (
          <p className="cap" style={{ maxWidth: 620, overflowWrap: "anywhere" }}>
            {message}
          </p>
        )}
        {reference && (
          <p className="cap">
            Reference{" "}
            <span className="mono" style={{ color: "var(--ink)" }}>
              {reference}
            </span>
          </p>
        )}
        <div className="flex gap-2.5">
          {retry}
          <Link className="btn btn-ghost" href="/">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

// One section failed; the rest of the page keeps loading.
export function SectionError({ what, message }: { what: string; message: string }) {
  return (
    <div className="notice n-block" role="alert">
      <span>
        <b>Couldn&apos;t read {what} from the relief contract.</b> {message}
      </span>
    </div>
  );
}
