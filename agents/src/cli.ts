import "dotenv/config";
import { LifelineChainClient } from "./chain/client.js";
import { executeSwarmScenario, loadScenarioById } from "./api.js";
import type { ExecutionMode } from "./schemas/index.js";

function parseArgFlag(args: string[], flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return fallback;
}

async function runSingleScenarioCli(args: string[]): Promise<void> {
  const scenarioId = parseArgFlag(args, "--scenario", "S1").toUpperCase();
  const mode = parseArgFlag(args, "--mode", process.env.SWARM_MODE ?? "replay") as ExecutionMode;
  const chainMode = parseArgFlag(
    args,
    "--chain",
    process.env.CHAIN_MODE ?? "stub"
  ) as "stub" | "testnet" | "mainnet";

  console.log(`\n===============================================================================`);
  console.log(
    `LIFELINE SWARM RUNNER — Scenario: ${scenarioId} | Mode: ${mode.toUpperCase()} | Chain: ${chainMode.toUpperCase()}`
  );
  console.log(`===============================================================================`);

  const trace = await executeSwarmScenario({
    scenarioId,
    mode,
    chainMode,
    includeFullLifecycle: true
  });

  console.log(`Case ID        : ${trace.case_id}`);
  console.log(`Bundle SHA-256 : ${trace.bundle_hash}`);
  console.log(`Submit Tx      : ${trace.submit_tx_hash}`);
  console.log(`\n--- Verifier Swarm Votes (4 Independent Accounts) ---`);
  for (const step of trace.verifier_steps) {
    const tierNote = step.role === "sev" ? ` (tier=${step.vote_record.tier})` : "";
    console.log(
      `  [${step.role.toUpperCase().padEnd(4)}] ${step.signer_account.padEnd(32)} -> ${step.vote_record.verdict.padEnd(
        7
      )}${tierNote} | conf=${step.vote_record.confidence_bps}bps | tx=${step.tx_hash}`
    );
  }
  console.log(`\nPost-Vote Status : ${trace.post_vote_status} (Cap: ${trace.cap_amount ?? "0"})`);

  if (trace.bidding_trace) {
    console.log(
      `Winning NGO      : ${trace.bidding_trace.winner} (Award: ${trace.bidding_trace.award_amount}, Tranche 1 Paid: ${trace.bidding_trace.tranche1_paid})`
    );
  }
  if (trace.delivery_trace) {
    const okCount = trace.delivery_trace.votes.filter((v) => v.ok).length;
    console.log(
      `Delivery Votes   : ${okCount}/${trace.delivery_trace.votes.length} OK | Tranche 2 Paid: ${trace.delivery_trace.tranche2_paid ?? "0"}`
    );
  }
  console.log(`Final Status     : ${trace.final_status}\n`);
}

/**
 * Offline replay runner required for screening (Section B.4.8):
 * Runs S1, S2, S3 (plus S5 bad-proof rejection) in `replay` mode with zero API keys or network calls,
 * prints a readable verification table, and asserts expected == actual status.
 */
async function runReplayDemoAll(): Promise<void> {
  const scenarioIds = ["S1", "S2", "S3", "S5"];
  const chain = new LifelineChainClient({ mode: "stub" });

  console.log(
    `\n=========================================================================================================`
  );
  console.log(
    `LIFELINE OFFLINE REPLAY DEMO (MODE: REPLAY | CHAIN: SANDBOX STUB | ZERO API KEYS REQUIRED)`
  );
  console.log(
    `=========================================================================================================`
  );

  const summaryRows: Array<{
    scenario: string;
    name: string;
    expected: string;
    actual: string;
    votes: string;
    tx_sample: string;
    pass: boolean;
  }> = [];

  for (const id of scenarioIds) {
    const spec = loadScenarioById(id);
    const trace = await executeSwarmScenario(
      {
        scenarioId: id,
        mode: "replay",
        chainMode: "stub",
        includeFullLifecycle: true
      },
      chain
    );

    const voteSummary = trace.verifier_steps
      .map((s) => `${s.role}:${s.vote_record.verdict}`)
      .join(", ");
    const pass = trace.final_status === spec.expected_final_status;

    summaryRows.push({
      scenario: id,
      name: spec.name.slice(0, 36),
      expected: spec.expected_final_status,
      actual: trace.final_status,
      votes: voteSummary,
      tx_sample: trace.submit_tx_hash.slice(0, 18) + "...",
      pass
    });
  }

  console.table(summaryRows);

  const failed = summaryRows.filter((r) => !r.pass);
  if (failed.length > 0) {
    console.error(
      `\n[FAIL] ${failed.length} scenario(s) did not match expected final on-chain status!`
    );
    process.exit(1);
  }

  console.log(
    `\n[PASS] All ${summaryRows.length} scenarios matched expected on-chain status with 4 distinct verifier accounts.\n`
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subcommand = args[0] ?? "replay-all";

  if (subcommand === "replay-all") {
    await runReplayDemoAll();
  } else {
    await runSingleScenarioCli(args);
  }
}

main().catch((err) => {
  console.error("Fatal CLI error:", err);
  process.exit(1);
});
