import { accountUrl, txUrl } from "@/lib/explorer";
import { shortHash } from "@/lib/format";

export function TxLink({ hash, label = "Transaction" }: { hash?: string; label?: string }) {
  const url = txUrl(hash);
  if (!url) {
    return (
      <span className="text-muted" title="Sample data: there is no real transaction behind this.">
        {label}: sample
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-tarp underline underline-offset-2">
      {label} {shortHash(hash!, 6)}
    </a>
  );
}

export function AccountLink({ id }: { id: string }) {
  const url = accountUrl(id);
  if (!url) return <span className="break-all">{id}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="break-all text-tarp underline underline-offset-2">
      {id}
    </a>
  );
}
