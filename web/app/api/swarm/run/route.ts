import { config } from "@/lib/config";
import { getEvidence } from "@/lib/evidence";
import { SCENARIOS } from "@/lib/scenarios";
import { brokenVerifiers, type ProofSummary, type SwarmTrace, traceToScript } from "@/lib/swarm/trace";

// Runs one demo scenario through B's agent runner: intake, four verifiers, contract decision,
// simulated NGO bids, proof and delivery check. On testnet every step is a real transaction.
export const maxDuration = 60;

// One run at a time, with a short pause between runs, so the public button can't flood the chain.
let busyUntil = 0;
let running = false;
const COOLDOWN_MS = 3_000;

export async function POST(req: Request) {
  let body: { scenarioId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Send JSON with a scenarioId." }, { status: 400 });
  }
  const scenario = SCENARIOS.find((s) => s.key === body.scenarioId);
  if (!scenario) return Response.json({ error: `Pick one of ${SCENARIOS.map((s) => s.key).join(", ")}.` }, { status: 400 });
  if (config.chainMode === "mainnet") return Response.json({ error: "Scenario runs are off on mainnet." }, { status: 403 });

  if (running || Date.now() < busyUntil) {
    return Response.json({ error: "Another run just started. Try again in a few seconds." }, { status: 429 });
  }
  running = true;
  try {
    const { executeSwarmScenario } = await import("@lifeline/agents");
    const trace = (await executeSwarmScenario({
      scenarioId: scenario.key,
      mode: config.dataMode,
      chainMode: config.chainMode,
      includeFullLifecycle: true,
    })) as unknown as SwarmTrace;

    const broken = brokenVerifiers(trace);
    if (broken.length > 0) {
      return Response.json(
        { error: `The ${broken.join(", ")} verifier failed and fell back to Abstain, so this run isn't a real result. Check the agent runner's prompts and keys.` },
        { status: 500 },
      );
    }

    const proof = trace.delivery_trace ? ((await getEvidence(trace.delivery_trace.proof_hash).catch(() => null)) as ProofSummary | null) : null;
    return Response.json({
      script: traceToScript(trace, scenario.name, proof),
      run: { mode: trace.mode, chainMode: trace.chain_mode, caseId: trace.case_id, finalStatus: trace.final_status, onChain: trace.chain_mode !== "stub" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `The agent runner failed: ${message}` }, { status: 502 });
  } finally {
    running = false;
    busyUntil = Date.now() + COOLDOWN_MS;
  }
}
