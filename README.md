# LifeLine

A public disaster relief pool on NEAR where money moves only when four independent checks agree.

People and NGOs donate to one shared pool. Field reports about a disaster (SMS relays, partner relays, a web form) are grouped into a case. Four verifier agents check the case, each with its own NEAR account: one checks the spread of reports without AI, one checks outside data such as rainfall and disaster alerts, one proposes how severe it is, and one red team agent argues the report is fake. Three yes votes fund the case and two no votes reject it. A contract, not an AI, caps how much can be spent. NGOs bid to respond, the winner is paid in two parts, and the second part waits until the verifiers agree the delivery really happened. Anyone can check every vote and every evidence record from the website.

Built at NEAR HACKATHON 2026 for the **AI Swarms** and **Open Innovation** tracks.

## Status (12 Nov 2026)

| Part | State |
|---|---|
| Verifier swarm, intake, simulated NGO bidders (`agents/`) | Working. Runs all four demo scenarios offline with no keys. 34 tests. |
| Web app (`web/`) | Working on sample data and on B's runner. Donate flow tested end to end on a local NEAR sandbox. 74 unit tests, 8 sandbox tests. |
| NEAR Intents payout quotes | Working. Live dry quotes from the 1Click API on mainnet. Sending the payout is not built. |
| NGO register, bid and proof forms, coordinator confirm and reject | Built. Switched off until the site points at a deployed relief contract. |
| Relief contract | Not in this repository yet. Not deployed to testnet. |
| Hosted demo | Not deployed yet. |

Until the contract is deployed to testnet, the website runs on **sample data** and says so in the header on every page.

## Quick start for judges

You need Node.js 20.9 or newer and pnpm 10.

```bash
git clone https://github.com/LifeLine-NH/LIfeLine.git
cd LIfeLine
pnpm install
```

### 1. Watch the swarm decide four cases, offline, in seconds

```bash
pnpm demo:replay
```

No API keys. The four verifiers vote on four scenarios using recorded inputs, against an in memory copy of the contract rules. Expected output:

```
┌─────────┬──────────┬───────────────┬─────────────┬─────────────┬───────────────────────────────────────┬──────┐
│ (index) │ scenario │ name          │ expected    │ actual      │ votes                                 │ pass │
├─────────┼──────────┼───────────────┼─────────────┼─────────────┼───────────────────────────────────────┼──────┤
│ 0       │ 'S1'     │ 'Maiduguri …' │ 'Delivered' │ 'Delivered' │ 'geo:Yes, fact:Yes, sev:Yes, red:Yes' │ true │
│ 1       │ 'S2'     │ 'Keyword …'   │ 'Rejected'  │ 'Rejected'  │ 'geo:Yes, fact:No, sev:No, red:No'    │ true │
│ 2       │ 'S3'     │ 'Flood-of-…'  │ 'Rejected'  │ 'Rejected'  │ 'geo:No, fact:No, sev:No, red:No'     │ true │
│ 3       │ 'S5'     │ 'Inflated …'  │ 'Awarded'   │ 'Awarded'   │ 'geo:Yes, fact:Yes, sev:Yes, red:Yes' │ true │
└─────────┴──────────┴───────────────┴─────────────┴─────────────┴───────────────────────────────────────┴──────┘

[PASS] All 4 scenarios matched expected on-chain status with 4 distinct verifier accounts.
```

(Some columns are shortened here.) To see one case in detail, with each verifier's account, verdict and confidence:

```bash
pnpm swarm:run --scenario S2
```

| Scenario | What it tests | Outcome |
|---|---|---|
| S1 Genuine report | Modelled on the September 2024 Alau Dam flood in Maiduguri, Nigeria | Funded, delivered, both payments made |
| S2 Keyword attack | Reports repeat "flood" with no outside evidence, and one hides an instruction to the verifiers | Rejected |
| S3 Flood of fakes | Thirty reports from one sender in a few minutes | Rejected |
| S5 Inflated proof | The winning NGO claims 50,000 households against a plan of 600 | Funded, but the second payment is withheld |

### 2. Open the website

```bash
pnpm dev
```

Then open http://localhost:3000. The first start compiles the agents package and takes a few seconds.

- **Ops** (`/ops`): press **Run S2**. The reports go through the real agent runner, and the four votes arrive one by one. The red team flags the hidden instruction and the contract rejects the case. **Run S1** goes all the way through bids, award, proof and both payments.
- **Large screen view** (`/ops/stage`): the same runs, made for a recording.
- **Cases** (`/cases`): every case, rejected ones included. Open any case for the votes, the reasons, the timeline, bids, proof and evidence.
- **Check hash** on a case page downloads the evidence record and computes its SHA-256 in your browser, then compares it with the stored hash.
- **Payout quote** on an awarded case asks NEAR Intents, live, what the responder would receive as USDC on Base, Arbitrum, Ethereum or Solana. It is a dry run, so nothing moves.
- **Donate** (`/donate`) is switched off on sample data. Its full flow is covered by the sandbox tests below.

### 3. Run the tests

```bash
pnpm test        # agents (34) and web unit tests (74)
pnpm test:e2e    # donate flow on a local NEAR sandbox (8)
```

The sandbox tests start a local NEAR node, deploy real `mock_ft.wasm` and `lifeline.wasm` contracts (plus the donate flow fixture), and verify restricted `FunctionCall` keys, donations/refunds, negative security checks, the cap governor, failed payout rollback, full agent scenarios S1–S5, and proof-deadline expiry. The first run downloads the sandbox binary.

### 4. Testnet and hosted demo

Account provisioning (`scripts/create-accounts.ts`) and testnet deployment (`scripts/deploy-testnet.ts`) are implemented, with the public account hierarchy documented in [docs/ACCOUNTS.md](docs/ACCOUNTS.md). Broadcasting to NEAR testnet requires supplying a funded `NEAR_OWNER_PRIVATE_KEY` in `.env` and running those scripts. See [docs/CONTRACT.md](docs/CONTRACT.md) and [docs/DEMO.md](docs/DEMO.md).

## How it works

```
 field reports ──► intake: cluster by place and time, hash sender ids, build the evidence bundle
                        │  bundle stored off chain, its SHA-256 goes on chain
                        ▼
              four verifiers, four NEAR accounts
              Geo (no AI) · Fact (outside data + model) · Severity (model) · Red team (model)
                        │  each signs its own vote
                        ▼
              relief contract: 3 yes funds, 2 no rejects, otherwise a person decides
              cap = lowest of tier limit, share of pool, daily limit left
                        │
                        ▼
              NGOs bid ──► winner gets the first payment ──► proof of delivery
                        │
                        ▼
              verifiers check the proof (2 of 4) ──► second payment
                        │
                        ▼
              optional: payout as another asset on another chain through NEAR Intents
```

More detail, including the case states and what is stored where: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Track fit: AI Swarms

- **Independent agents with their own accounts.** Each verifier signs as its own NEAR account (`v-geo`, `v-fact`, `v-sev`, `v-red`). No agent can vote for another. See `agents/src/verifiers/` and `agents/src/chain/client.ts`.
- **Different kinds of agent on purpose.** Geo is plain code with no AI. Fact and Severity use two different models. The red team uses a third model from another provider and is told to find the reason the report is fake.
- **Coordination through shared state, not messages.** Agents never talk to each other. They each read the case and vote; the contract counts the votes and decides. See `agents/src/orchestrator/`.
- **A market of responder agents.** Simulated NGO agents bid on verified cases, and the lowest ask under the cap wins. See `agents/src/ngo/bidders.ts`.
- **Agents check the outcome, not only the request.** After delivery the swarm votes again on the proof, and the second payment depends on that vote (S5).
- **Intent based settlement.** A payment can be quoted as another asset on another chain through NEAR Intents. See `web/lib/intents/quote.ts`.

## Track fit: Open Innovation

Most aid systems ask donors to trust the operator. LifeLine replaces that trust with checks anyone can repeat: money moves only when independent agents agree, a contract sets the limit, responders compete to deliver, and they are paid in parts against verified delivery. Rejections are shown with the same care as funded cases, because a rejected fake is the system working.

## What is real and what is simulated

| | Status |
|---|---|
| The four verifiers and their logic | Real code. In the demo our team runs all four accounts. The design lets four separate organisations run them, but we have not tested that. |
| Outside data in replay mode (`agents/fixtures/`) | Recorded inputs written for the scenarios. **They are not exact copies of the real data sources.** For example, the S1 rainfall figures do not match the Open-Meteo archive for those dates; the Alau Dam flood was caused by the dam failing, not by rain. Live mode calls the real APIs. |
| Model answers in replay mode (`agents/recordings/`) | Fixed answers written for the demo, so the replay runs with no keys. Live mode calls the models. |
| NGO bidders | Simulated. Three bots, labelled "Simulated" everywhere they appear on the website. |
| Relief contract and its rules | Implemented in `contracts/lifeline` and `contracts/mock-ft`, verified with 16 Rust unit tests and 6 NEAR sandbox E2E tests (14 total with donate E2E). Offline runs use an in-memory version of the rules inside `agents/src/chain/client.ts`. |
| Cases, pool figures and donations on the website | Sample data until the contract is deployed to testnet. Every number then shows a "sample" tag in place of a transaction link. |
| NEAR Intents quotes | Real, live from the 1Click API on mainnet, as dry runs. Sending a payout this way is not built. |
| Donate flow | Real transactions, tested on a local NEAR sandbox (including against `lifeline.wasm` in `web/e2e/lifeline.e2e.test.ts`). Not yet broadcast to public testnet. |

## Repository layout

```
contracts/ Rust smart contracts (`lifeline`, `mock-ft`) and compiled MVP `res/*.wasm` binaries
scripts/   NEAR testnet account/restricted-key provisioning and contract deployment scripts
agents/    intake, evidence tools, the four verifiers, NGO bidder bots, the scenario runner
web/       Next.js website: cases, donate, NGO view, ops console, evidence, quote APIs, sandbox E2E tests
docs/      contract spec, account key map, architecture, security, demo script, design brief
```

## Security

Threats, how each is handled and which test covers it: [docs/SECURITY.md](docs/SECURITY.md).

The main known limit: in the demo our team holds all four verifier keys, so the separation between verifiers is shown in the design and the code, not yet in who operates them.

## Baseline disclosure

Code written before the hackathon window is listed in [BASELINE.md](BASELINE.md). The website was started fresh during the window. The agents reuse one clustering rule idea from an earlier project, described there.

## Team and license

Team LifeLine-NH: developer A (relief contract), developer B (agents, [@therealjhay](https://github.com/therealjhay)), developer C (website, [@Omoboi-dev](https://github.com/Omoboi-dev)).

MIT license. See [LICENSE](LICENSE).
