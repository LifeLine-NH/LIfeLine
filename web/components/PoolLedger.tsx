import { chain } from "@/lib/chain";
import { formatAmount } from "@/lib/format";

export async function PoolLedger() {
  const pool = await chain.getPool();
  const rows = [
    { label: "Available for new cases", value: formatAmount(pool.available), strong: true },
    { label: "Held for awarded cases", value: formatAmount(pool.reserved) },
    { label: "Paid out today", value: formatAmount(pool.disbursed_today) },
    { label: "Donors", value: pool.donors_count.toLocaleString("en-US") },
  ];
  return (
    <dl className="divide-y divide-line">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-sm text-muted">{r.label}</dt>
          <dd className={r.strong ? "text-2xl font-bold" : "font-semibold"}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
