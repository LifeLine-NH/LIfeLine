import { config } from "@/lib/config";

const chainBadge = {
  stub: { text: "Sample data", title: "Not connected to a contract. Everything shown is invented for building the UI.", cls: "bg-review text-white" },
  testnet: { text: "Testnet", title: "Reading the relief contract on NEAR testnet. No real money.", cls: "bg-paper text-tarp-deep" },
  mainnet: { text: "Mainnet", title: "Reading the relief contract on NEAR mainnet. Real money, capped.", cls: "bg-stamp text-white" },
};

export function ModeBadges() {
  const chain = chainBadge[config.chainMode];
  return (
    <div className="flex items-center gap-2 text-xs font-semibold">
      <span className={`rounded px-2 py-1 ${chain.cls}`} title={chain.title}>
        {chain.text}
      </span>
      <span
        className="rounded border border-white/40 px-2 py-1 text-white"
        title={
          config.dataMode === "replay"
            ? "Agent votes come from recorded runs, not live model calls."
            : "Agents call live data sources and models."
        }
      >
        {config.dataMode === "replay" ? "Replay" : "Live"}
      </span>
    </div>
  );
}

export function SimulatedTag() {
  return (
    <span className="rounded bg-chalk px-1.5 py-0.5 text-xs font-semibold text-muted ring-1 ring-line" title="A bot run by the LifeLine team for the demo, not a real NGO.">
      Simulated
    </span>
  );
}
