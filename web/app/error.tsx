"use client";

import { PageError } from "@/components/ui/PageError";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      reference={error.digest}
      retry={
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
      }
    />
  );
}
