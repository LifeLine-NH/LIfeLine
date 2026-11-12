import type { Metadata } from "next";
import { Suspense } from "react";
import { RunStage } from "@/components/ops/RunStage";
import { attempt } from "@/lib/attempt";
import { config } from "@/lib/config";
import { loadRunScripts } from "@/lib/runScript";

export const metadata: Metadata = { title: "LifeLine ops · large screen" };

const DATA = { stub: ["Sample data", "m-sample"], testnet: ["Testnet", "m-testnet"], mainnet: ["Mainnet", "m-mainnet"] } as const;

async function Stage() {
  const res = await attempt(() => loadRunScripts());
  if (!res.ok) {
    return (
      <div className="stage fixed inset-0 z-50 grid place-items-center p-8 text-center">
        <p style={{ fontSize: 18 }}>Couldn&apos;t read the scenario runs from the relief contract. {res.message}</p>
      </div>
    );
  }
  const [dataLabel, dataCls] = DATA[config.chainMode];
  return <RunStage scripts={res.value.scripts} dataLabel={dataLabel} dataCls={dataCls} agentsLabel={config.dataMode === "live" ? "Live" : "Replay"} />;
}

export default function StagePage() {
  return (
    <Suspense fallback={<div className="stage fixed inset-0 z-50" />}>
      <Stage />
    </Suspense>
  );
}
