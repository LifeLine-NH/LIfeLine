# LifeLine

![LifeLine — Relief money that moves only when four checks agree](web/public/og.png)

A public disaster relief pool on NEAR where money moves only when four independent checks agree.

People and NGOs donate to one shared pool. Field reports about a disaster (SMS relays, partner relays, a web form) are grouped into a case. Four verifier agents check the case, each with its own NEAR account: one checks the spread of reports without AI, one checks outside data such as rainfall and disaster alerts, one proposes how severe it is, and one red team agent argues the report is fake. Three yes votes fund the case and two no votes reject it. A contract, not an AI, caps how much can be spent. NGOs bid to respond, the winner is paid in two parts, and the second part waits until the verifiers agree the delivery really happened. Anyone can check every vote and every evidence record from the website.

Built at NEAR HACKATHON 2026 for the **AI Swarms** and **Open Innovation** tracks.

> **60-second path for judges:**
> 1. **Hosted live demo (NEAR Testnet):** [https://lifeline-relief.vercel.app](https://lifeline-relief.vercel.app)
>    - [Delivered case (`S1`)](https://lifeline-relief.vercel.app/cases/s6177-2024-09-10-002-s1) · [Rejected keyword/injection attack (`S2`)](https://lifeline-relief.vercel.app/cases/s4nh7-2025-01-15-001-s2) · [Rejected sybil attack (`S3`)](https://lifeline-relief.vercel.app/cases/s1t7d-2025-02-01-001-s3) · [Withheld inflated proof (`S5`)](https://lifeline-relief.vercel.app/cases/s6177-2024-09-10-001-s5)
> 2. **Run offline locally (zero API keys):** `pnpm install && pnpm demo:replay && pnpm dev`

## Visual Tour (Live on NEAR Testnet)

| Verified & Delivered (`S1`) | Rejected Attack (`S2`) |
|---|---|
| ![Delivered case on NEAR Testnet](docs/images/case-delivered.png) | ![Rejected keyword & injection attack](docs/images/case-rejected.png) |
| **4 of 4 Yes votes** · Cap set to **5,000 USDC** · Lowest bid (**3,400 USDC**) paid in two tranches (`1,360` + `2,040 USDC`). | **3 of 4 No votes** · Red Team catches hidden `"SYSTEM INSTRUCTION"` prompt injection; external weather tools show dry conditions. |

| Vote Cards & Browser Hash Verification (`S1`) | Fraudulent Delivery Proof Withheld (`S5`) |
|---|---|
| ![Vote reasoning cards and timeline](docs/images/case-votes.png) | ![Withheld second payment on inflated proof](docs/images/case-withheld.png) |
| Every vote links to its NearBlocks transaction and includes client-side SHA-256 verification against the on-chain `evidence_hash`. | NGO claims **50,000 households** (83.3x plan) & GPS **86 km away** · **0 of 4 delivery ok** · **2,040 USDC (60%)** stays in the pool. |

## Documentation Map

| Guide | What it covers |
|---|---|
| [**Architecture (`docs/ARCHITECTURE.md`)**](docs/ARCHITECTURE.md) | System overview, full 14-step sequence diagram, intake clustering, 4-verifier decision trees, state machine, money flow, evidence storage, and deployment topology |
| [**Smart Contracts (`docs/CONTRACT.md`)**](docs/CONTRACT.md) | `contracts/lifeline` & `contracts/mock-ft` specification, access control matrix, Cap Governor math, payout rollback sequence, NEP-297 events |
| [**Accounts & Restricted Keys (`docs/ACCOUNTS.md`)**](docs/ACCOUNTS.md) | Live NEAR Testnet account inventory, public keys, and method-scoped `FunctionCall` key hierarchy (`0.25 NEAR` allowance, zero transfer capability) |
| [**Security & Threat Matrix (`docs/SECURITY.md`)**](docs/SECURITY.md) | Defense-in-depth diagram, threat model across intake, agents, web app, and contract, mapped to automated tests and known limits |
| [**Agent Security & Disclosure (`docs/AGENTS_SECURITY.md`)**](docs/AGENTS_SECURITY.md) | Detailed verifier threat mitigations and line-by-line *"What is Real vs. Simulated"* disclosure |
| [**Donations Protocol (`docs/DONATIONS.md`)**](docs/DONATIONS.md) | NEP-141 `ft_transfer_call` pre-flight checks, cross-contract callback rules, and RPC receipt outcome verification sequence |
| [**Demo Walkthrough & Testnet Tx Links (`docs/DEMO.md`)**](docs/DEMO.md) | 2.5-minute demo script, scenario comparison diagram, screenshots, and all **38 NearBlocks Testnet transaction links** |

## Status (14 Nov 2026)

| Part | State |
|---|---|
| Verifier swarm, intake, simulated NGO bidders (`agents/`) | Working. Runs all four demo scenarios offline with no keys. 35 tests. |
| Web app (`web/`) | Working on sample data and on the testnet contract (the hosted site). Donate and full relief lifecycle tested end to end on a local NEAR sandbox. 81 unit tests, 14 sandbox tests. |
| NEAR Intents payout quotes | Working. Live dry quotes from the 1Click API on mainnet. Sending the payout is not built. |
| NGO register, bid and proof forms, coordinator confirm and reject, closing an expired case | Working on the hosted site against `lifeline-demo.testnet`. Switched off on sample data. |
| Relief contract & mock FT (`contracts/`) | Deployed live on NEAR Testnet (`lifeline-demo.testnet` & `usdc.lifeline-demo.testnet`, `$100,000` pool seeded). 16 Rust unit tests + 6 contract sandbox E2E tests. |
| Hosted demo | Live at https://lifeline-relief.vercel.app. The header badge on every page says whether it is showing sample data or the testnet contract. |

The website reads **`NEXT_PUBLIC_CHAIN_MODE`**; the agent runner reads **`CHAIN_MODE`**. Until both are set to `testnet` (and the site is rebuilt, because `NEXT_PUBLIC_*` values are baked in at build time), the website runs on **sample data** and says so in the header on every page.

## Quick start for judges

**Fastest:** open the hosted demo at https://lifeline-relief.vercel.app. No wallet is needed to read cases, votes and evidence.

To run it yourself you need Node.js 20.9 or newer and pnpm 10. The first `pnpm install` also downloads the NEAR sandbox binary used by the end-to-end tests.

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
| S1 Illustrative replay | Modelled on the September 2024 Alau Dam flood in Maiduguri, Nigeria, with recorded inputs written for the scenario | Funded, delivered, both payments made |
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
- **Donate** (`/donate`) is switched off on sample data. Its full flow is covered by the sandbox tests below. On the hosted site it sends real testnet transactions.

On the hosted site, **Run** sends real NEAR testnet transactions signed by the team's verifier, intake and NGO accounts. To protect the shared keys and the contract's 25,000 USDC daily limit, a new run waits until the previous one has finished and funded runs (S1, S5) pause once that limit is nearly used for the day (it resets at 00:00 UTC). **Replay the recorded case** always works.

### 3. Run the tests

```bash
pnpm test            # agents (35) and web unit tests (81)
pnpm test:contracts  # Rust contract unit tests (13 lifeline + 3 mock-ft = 16)
pnpm test:e2e        # donate (8) and lifeline contract lifecycle (6) on a local NEAR sandbox (14)
```

The sandbox tests start a local NEAR node, deploy real `mock_ft.wasm` and `lifeline.wasm` contracts (plus the donate flow fixture), and verify restricted `FunctionCall` keys, donations/refunds, negative security checks, the cap governor, failed payout rollback, full agent scenarios S1–S5, and proof-deadline expiry. The first run downloads the sandbox binary.

### 4. Testnet and hosted demo

Live on NEAR Testnet:
- **Relief contract (`CONTRACT_ID`)**: [`lifeline-demo.testnet`](https://testnet.nearblocks.io/address/lifeline-demo.testnet) (seeded with `100,000` test USDC; intake, coordinator, 4 verifiers, and 3 NGOs registered)
- **Pool token (`NEXT_PUBLIC_POOL_TOKEN_ID`)**: [`usdc.lifeline-demo.testnet`](https://testnet.nearblocks.io/address/usdc.lifeline-demo.testnet)

See [docs/ACCOUNTS.md](docs/ACCOUNTS.md), [docs/CONTRACT.md](docs/CONTRACT.md), and [docs/DEMO.md](docs/DEMO.md).

## How it works

```mermaid
flowchart TB
  subgraph Offchain["Off-Chain Intake & Independent Verifier Swarm"]
    R["Field Reports<br/>(SMS · Partner · Web)"] --> I["Intake Clustering<br/>(<=1 km, <=1 hr, SHA-256 sender IDs,<br/>PII scrubbed, canonical bundle_hash)"]
    EXT["External Data Tools<br/>Open-Meteo · GDACS · ReliefWeb · USGS"]
    subgraph Swarm["4 Verifier Agents (4 Distinct NEAR Accounts + Restricted FunctionCall Keys)"]
      VG["v-geo.lifeline-demo.testnet<br/>Deterministic code (no AI):<br/>sender diversity, template & burst check"]
      VF["v-fact.lifeline-demo.testnet<br/>Tools + gpt-oss-120b:<br/>requires >=2 external tools supporting"]
      VS["v-sev.lifeline-demo.testnet<br/>qwen3.8-27b:<br/>proposes Severity Tier 1-4"]
      VR["v-red.lifeline-demo.testnet<br/>Regex guard + gpt-oss-20b:<br/>argues report is fake / detects injection"]
    end
    I --> VG & VF & VS & VR
    EXT --> VF & VR
  end

  subgraph Onchain["NEAR Testnet (lifeline-demo.testnet & usdc.lifeline-demo.testnet)"]
    Q{"On-Chain Quorum<br/>3 Yes = Fund<br/>2 No = Reject"}
    CAP["Cap Governor<br/>cap = min(tier_cap, 20% available pool, remaining daily limit)"]
    BID["Reverse Auction<br/>Bonded NGOs bid ask <= cap<br/>Lowest valid ask wins"]
    T1["Tranche 1 Released (40%)<br/>Remaining 60% locked in pool_reserved"]
    DEL{"Delivery Proof Check<br/>GPS <=5 km & households 25%-300%<br/>>=2 of 4 vote_delivery(ok=true)"}
    T2["Tranche 2 Released (60%)<br/>Status: Delivered (+10 reputation)"]
    HOLD["Tranche 2 Withheld / Returned to Pool<br/>(After 2 failed proofs or deadline expiry)"]
  end

  VG & VF & VS & VR -- "vote(verdict, confidence, tier, evidence_hash)" --> Q
  Q -- "3 Yes" --> CAP --> BID --> T1 --> DEL
  Q -- "2 No" --> REJ["Status: Rejected (0 USDC spent)"]
  DEL -- ">=2 ok" --> T2
  DEL -- ">=3 reject / expired" --> HOLD
```

### The Four Verifiers & On-Chain Rules at a Glance

| Verifier / Component | NEAR Account | Key Type | Decision Rule / Guardrail |
|---|---|---|---|
| **Intake Oracle** | `intake.lifeline-demo.testnet` | `FunctionCall` (`submit_case`, `close_bidding`) | Clusters reports within `1 km` and `1 hour`, hashes `source_id` with SHA-256, scrubs phone/email PII, and commits `bundle_hash`. |
| **Geo Verifier** | `v-geo.lifeline-demo.testnet` | `FunctionCall` (`vote`, `vote_delivery`) | **100% deterministic code (no LLM).** Votes `No` if `source_diversity <= 1`, any single sender $\ge 80\%$, or $\ge 75\%$ share a message template. Votes `Yes` if $\ge 3$ senders, max share $\le 40\%$, spread $60\text{–}3600\text{ s}$, radius $\le 1\text{ km}$. |
| **Fact Verifier** | `v-fact.lifeline-demo.testnet` | `FunctionCall` (`vote`, `vote_delivery`) | Queries Open-Meteo, GDACS, ReliefWeb, and USGS + LLM (`openai/gpt-oss-120b`). **Code guard:** overrides LLM `Yes` unless $\ge 2$ external tools return `supports === "yes"`. |
| **Severity Verifier** | `v-sev.lifeline-demo.testnet` | `FunctionCall` (`vote`, `vote_delivery`) | Classifies humanitarian impact into Tier 1–4 (`qwen/qwen3.8-27b`). Tier 1 = no funding; Tiers 1–3 on-chain caps: `2,000`, `5,000`, `10,000 USDC`. |
| **Red-Team Verifier** | `v-red.lifeline-demo.testnet` | `FunctionCall` (`vote`, `vote_delivery`) | Runs regex prompt-injection detection (`detectPromptInjection`) + adversarial LLM (`openai/gpt-oss-20b`). Unrebutted objections or injection attempts force `No`. |
| **Cap Governor** | `lifeline-demo.testnet` | Contract rule | $\text{cap} = \min(\text{tier\_cap}[\text{tier}],\; 20\% \times \text{available\_pool},\; \text{daily\_limit} - \text{disbursed\_today})$. |
| **Two-Tranche Escrow** | `lifeline-demo.testnet` | Contract rule | Pays **40%** (`tranche1_bps = 4000`) on `close_bidding` and holds **60%** until $\ge 2$ of 4 verifiers approve `submit_proof` (`vote_delivery(ok=true)`). |

More detail, including the case states and what is stored where: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Command Reference

| Command | Description |
|---|---|
| `pnpm demo:replay` | Run all 4 scenarios (`S1`, `S2`, `S3`, `S5`) offline against recorded fixtures and verify expected statuses |
| `pnpm swarm:run --scenario S1` | Run a single scenario (`S1`, `S2`, `S3`, `S5`) with full per-verifier output (`--mode replay\|live`, `--chain stub\|testnet`) |
| `pnpm dev` | Start the Next.js web application at `http://localhost:3000` |
| `pnpm test` | Run all TypeScript unit tests (`35` agent tests + `81` web tests = `116` tests) |
| `pnpm test:contracts` | Run Rust smart contract unit tests (`13` lifeline + `3` mock-ft = `16` tests) |
| `pnpm test:e2e` | Run NEAR Sandbox end-to-end tests (`8` donate + `6` full lifeline lifecycle = `14` tests) |
| `pnpm build:contracts` | Compile `lifeline.wasm` and `mock_ft.wasm` MVP WebAssembly binaries |
| `pnpm preflight` | Verify environment configuration, contract state, registered accounts, and evidence hashes |

## Track fit: AI Swarms

- **Independent agents with their own accounts.** Each verifier signs as its own NEAR account (`v-geo`, `v-fact`, `v-sev`, `v-red`). No agent can vote for another. See `agents/src/verifiers/` and `agents/src/chain/client.ts`.
- **Different kinds of agent on purpose.** Geo is plain code with no AI. Fact (`openai/gpt-oss-120b`) and Severity (`qwen/qwen3.8-27b`) use two different models. The red team uses a third model (`openai/gpt-oss-20b`) and is told to find the reason the report is fake. In our demo configuration all three models run on Groq, and Fact and Red are from the same model family (gpt-oss). What limits that shared-provider risk: Geo is a deterministic check with no model, the red team has an adversarial prompt, and a case needs 3 of 4 yes votes to fund. Setting `SECONDARY_LLM_*` moves the red team to a second provider. Each vote record names the exact model that produced it.
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
| Relief contract and its rules | Deployed live on NEAR Testnet (`lifeline-demo.testnet`, `usdc.lifeline-demo.testnet`), implemented in `contracts/lifeline` and `contracts/mock-ft`, verified with 16 Rust unit tests and 6 NEAR sandbox E2E tests (14 total with donate E2E). Offline runs use an in-memory version of the rules inside `agents/src/chain/client.ts`. |
| Cases, pool figures and donations on the website | Live testnet contract `lifeline-demo.testnet` is seeded (`100,000` test USDC); when the website is built without `NEXT_PUBLIC_CHAIN_MODE=testnet`, numbers show a "sample" tag in place of a transaction link. |
| NEAR Intents quotes | Real, live from the 1Click API on mainnet, as dry runs. Sending a payout this way is not built. |
| Donate flow | Real transactions, verified on NEAR Testnet during pool seeding (`ft_transfer_call` on `usdc.lifeline-demo.testnet` -> `lifeline-demo.testnet`) and covered by the 14 local NEAR sandbox tests. |

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
