"use client";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="font-display text-4xl font-extrabold">This page couldn&apos;t load</h1>
      <p>Reading from the relief contract failed. The contract may not be deployed yet, or the NEAR RPC may be down.</p>
      {error.digest && <p className="text-sm text-muted">Reference for the team: {error.digest}</p>}
      <button type="button" onClick={reset} className="rounded bg-tarp px-4 py-2 font-semibold text-white hover:bg-tarp-deep">
        Try again
      </button>
    </div>
  );
}
