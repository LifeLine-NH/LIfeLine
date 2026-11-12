import type { StatusTone } from "./format";
import type { Role, Verdict } from "./types";

// Scenario names and expected outcomes match agents/scenarios.
export const SCENARIOS = [
  { key: "S1", name: "Genuine report", expect: "Delivered", tone: "delivered" as StatusTone, about: "Verified, funded and delivered. Simulated NGOs bid; the proof checks out." },
  { key: "S2", name: "Keyword attack", expect: "Rejected", tone: "rejected" as StatusTone, about: 'Reports repeat "flood" with no outside evidence, and one hides an instruction to the verifiers.' },
  { key: "S3", name: "Flood of fakes", expect: "Rejected", tone: "rejected" as StatusTone, about: "Many reports from one sender in a few minutes." },
  { key: "S5", name: "Inflated proof", expect: "Payment withheld", tone: "review" as StatusTone, about: "The delivery claim doesn't add up: far more households than the plan." },
];

export type EventKind = "bid" | "pay" | "proof" | "ok" | "no" | "hold";

export interface RunScript {
  key: string;
  name: string;
  caseId: string;
  title: string;
  meta: string;
  reports: { text: string; meta: string }[];
  votes: { role: Role; verdict: Verdict; confidence: number; reason: string | null; tx: string | null; txUrl: string | null }[];
  decision: { word: string; tone: StatusTone; sub: string; line: string; funded: boolean };
  events: { kind: EventKind; title: string; detail: string; amount: string | null }[];
}
