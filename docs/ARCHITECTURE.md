# Architecture

How a disaster report becomes a funded, delivered and checked relief case, and where each piece of data lives.

- [System overview](#system-overview)
- [Parts](#parts)
- [The full lifecycle, step by step](#the-full-lifecycle-step-by-step)
- [Intake: from reports to an evidence bundle](#intake-from-reports-to-an-evidence-bundle)
- [The four verifiers](#the-four-verifiers)
- [Case states](#case-states)
- [Money flow](#money-flow)
- [What is on chain and what is not](#what-is-on-chain-and-what-is-not)
- [Evidence storage and the hash check](#evidence-storage-and-the-hash-check)
- [Website](#website)
- [Running modes](#running-modes)
- [Deployment topology](#deployment-topology)

## System overview

```mermaid
flowchart LR
  subgraph Offchain["Off chain"]
    R["Field reports<br/>SMS relay · partner relay · web form"]
    IN["Intake<br/>cluster · hash sender ids · scrub PII"]
    T["Outside data tools<br/>Open-Meteo · GDACS · ReliefWeb · USGS"]
    subgraph Swarm["Verifier swarm (4 NEAR accounts)"]
      G["Geo<br/>plain code, no AI"]
      F["Fact<br/>tools + model"]
      S["Severity<br/>model, proposes tier"]
      RT["Red team<br/>model, argues it is fake"]
    end
    NGO["NGO bidders<br/>3 simulated responders"]
    EV[("Evidence store<br/>JSON records keyed by SHA-256")]
  end
  subgraph Chain["NEAR testnet"]
    C["Relief contract<br/>lifeline-demo.testnet"]
    FT["Pool token<br/>usdc.lifeline-demo.testnet"]
  end
  subgraph Web["Website (Next.js on Vercel)"]
    UI["Cases · Donate · NGO · Ops"]
    HC["Check hash<br/>(in the browser)"]
  end
  D["Donors"]

  R --> IN
  IN -- "bundle" --> EV
  IN -- "submit_case(bundle_hash)" --> C
  T --> F
  T --> RT
  IN --> Swarm
  Swarm -- "vote(verdict, evidence_hash)" --> C
  Swarm -- "vote records" --> EV
  C -- "Bidding" --> NGO
  NGO -- "place_bid · submit_proof" --> C
  C -- "ft_transfer (tranche 1 and 2)" --> FT
  D -- "ft_transfer_call" --> FT
  FT -- "ft_on_transfer" --> C
  UI -- "view calls" --> C
  HC -- "download record" --> EV
  HC -. "compare with hash" .-> C
```

The agents never talk to each other. Each one reads the case, decides on its own and signs its own transaction. The contract counts the votes and moves the money. The website only reads; every write is a signed NEAR transaction.

## Parts

| Part | Where | What it does |
|---|---|---|
| Intake | `agents/src/intake/` | Groups reports by place (within 1 km) and time (within 1 hour) into a case. Hashes each sender id so no phone number or raw id leaves intake. Removes phone numbers and emails from report text. Builds the evidence bundle and its SHA-256. |
| Evidence tools | `agents/src/tools/` | Open-Meteo (rain and wind), GDACS (disaster alerts), ReliefWeb (situation reports), USGS (earthquakes). A tool that fails returns "unclear", never "yes". |
| Verifiers | `agents/src/verifiers/` | Four agents, each signing as its own NEAR account. Details below. |
| Orchestrator | `agents/src/orchestrator/` | Runs the four verifiers at the same time with timeouts. One verifier failing becomes an abstain and does not block the others. |
| NGO bidders | `agents/src/ngo/` | Three simulated responder bots that bid on funded cases and submit proof of delivery. |
| Delivery verifier | `agents/src/verifiers/delivery.ts` | After proof, each verifier votes again on whether the delivery is plausible. |
| Chain client | `agents/src/chain/client.ts` | Sends `submit_case`, `vote`, `place_bid` and the rest to the relief contract on testnet, or applies the same rules in memory when offline. |
| Relief contract | `contracts/lifeline` | Holds the pool, counts votes, sets the cap, runs bidding and both payments. See [CONTRACT.md](CONTRACT.md). |
| Pool token | `contracts/mock-ft` | A NEP-141 test token (`USDC`, 6 decimals) with a public `mint` for the testnet faucet. |
| Website | `web/` | Reads the contract, serves evidence, runs scenarios through the agents, quotes payouts through NEAR Intents, and lets donors give through their wallet. |
| Scripts | `scripts/` | Create the testnet accounts and restricted keys, deploy the contracts, and run `pnpm preflight`. |

## The full lifecycle, step by step

This is what happens when someone presses **Run S1** on `/ops`, or runs `pnpm swarm:run --scenario S1 --chain testnet`. Every arrow into the contract is a separate NEAR transaction signed by the account named on it.

```mermaid
sequenceDiagram
  autonumber
  participant Intake as intake.lifeline-demo
  participant Store as Evidence store
  participant C as Relief contract
  participant Geo as v-geo
  participant Fact as v-fact
  participant Sev as v-sev
  participant Red as v-red
  participant NGO as ngo-* (3 bidders)
  participant FT as Pool token

  Intake->>Store: save evidence bundle (sha256 = bundle_hash)
  Intake->>C: submit_case(case_id, geohash, bundle_hash, requested_tier)
  par each verifier decides on its own
    Geo->>Store: save vote record
    Geo->>C: vote(Yes, 9100 bps, evidence_hash)
    Fact->>Store: save vote record
    Fact->>C: vote(Yes, 9400 bps, evidence_hash)
    Sev->>Store: save vote record
    Sev->>C: vote(Yes, tier 3, evidence_hash)
    Red->>Store: save vote record
    Red->>C: vote(Yes, 8900 bps, evidence_hash)
  end
  Note over C: 3rd yes: case_verified, cap = min(tier cap, 20% of pool, daily left)
  NGO->>C: place_bid(ask, eta_hours, plan_hash) x3
  Intake->>C: close_bidding(case_id)
  C->>FT: ft_transfer(winner, 40% of award)
  Note over C: Awarded, proof deadline starts
  NGO->>Store: save proof package
  NGO->>C: submit_proof(proof_hash, proof_uri)
  par delivery check
    Geo->>C: vote_delivery(ok)
    Fact->>C: vote_delivery(ok)
    Sev->>C: vote_delivery(ok)
    Red->>C: vote_delivery(ok)
  end
  Note over C: 2nd ok: Delivered
  C->>FT: ft_transfer(winner, remaining 60%)
```

The recorded testnet runs, with a link for every one of these transactions, are in [DEMO.md](DEMO.md#transactions-from-the-recorded-testnet-run).

## Intake: from reports to an evidence bundle

```mermaid
flowchart TD
  A["Raw reports<br/>text, lat/lon, timestamp, sender id"] --> B{"Within 1 km and<br/>1 hour of a cluster?"}
  B -- yes --> C["Join that cluster"]
  B -- no --> D["Start a new cluster"]
  C --> E["Hash each sender id (SHA-256)"]
  D --> E
  E --> F["Scrub phone numbers and emails from text"]
  F --> G["Count distinct senders = source_diversity"]
  G --> H["Build bundle<br/>case_id = geohash-date-seq-scenario"]
  H --> I["Canonical JSON (sorted keys) then SHA-256"]
  I --> J["Bundle stored off chain"]
  I --> K["bundle_hash sent on chain with submit_case"]
```

The canonical JSON rules live in `agents/src/utils/hash.ts` and are copied byte for byte in `web/lib/hash.ts`, so the website computes exactly the same hash as the agents.

## The four verifiers

| Role | Account | How it decides | Model (demo configuration) |
|---|---|---|---|
| Geo | `v-geo` | Plain code: how many independent senders, how spread out in time and place, whether one sender or one message template dominates. | None |
| Fact | `v-fact` | Calls the outside data tools and asks a model to weigh them. A code guard refuses Yes unless at least two outside sources support the claim. | `openai/gpt-oss-120b` on Groq |
| Severity | `v-sev` | Proposes a tier from 1 to 4. Tier 1 means no funding. | `qwen/qwen3.8-27b` on Groq |
| Red team | `v-red` | Tries to prove the report is fake. A code check looks for instructions hidden in report text and votes No if it finds one. | `openai/gpt-oss-20b` on Groq, or a second provider when `SECONDARY_LLM_*` is set |

```mermaid
flowchart TD
  subgraph GeoBox["Geo (no AI)"]
    g1{"One sender is 80% or more<br/>of reports, or only 1 sender?"} -- yes --> gNo["No"]
    g1 -- no --> g2{"4+ reports and 75% or more<br/>share one template?"}
    g2 -- yes --> gNo
    g2 -- no --> g3{"3+ senders, none over 40%,<br/>spread 60 s to 1 h, radius 1 km or less?"}
    g3 -- yes --> gYes["Yes"]
    g3 -- no --> gAb["Abstain"]
  end
  subgraph FactBox["Fact"]
    f1["Run Open-Meteo, GDACS,<br/>ReliefWeb, USGS"] --> f2["Model weighs results"]
    f2 --> f3{"Model says Yes but<br/>fewer than 2 tools support?"}
    f3 -- yes --> f4{"2+ tools contradict?"}
    f4 -- yes --> fNo["No"]
    f4 -- no --> fAb["Abstain"]
    f3 -- no --> fOut["Model verdict stands"]
  end
  subgraph RedBox["Red team"]
    r1{"Report text contains an<br/>instruction to the verifiers?"} -- yes --> rNo["No, cannot be rebutted"]
    r1 -- no --> r2["Model argues the strongest<br/>reason the case is fake"]
    r2 --> rOut["Yes if the objection is rebutted,<br/>otherwise No"]
  end
```

Safety rules that apply to every model call (`agents/src/llm/client.ts`):

- Report text is always treated as data, never as instructions.
- Output must match a strict schema. Invalid output gets one retry; after that the verifier abstains. It never defaults to Yes.
- Low temperature (0.1), capped tokens (600), 25 second timeout.
- Every vote is saved as a vote record (verdict, confidence, reasoning, the tool results it used, the model id), and the SHA-256 of that record is sent with the vote.

The provider label in logs is derived from the base URL host. Any OpenAI compatible endpoint can be used, including NEAR AI Cloud, by setting `NEAR_AI_BASE_URL` and `NEAR_AI_API_KEY` (and the model id variables). In replay mode no model is called. More on model independence and its limits: [AGENTS_SECURITY.md](AGENTS_SECURITY.md).

## Case states

```mermaid
stateDiagram-v2
  [*] --> Open: submit_case (intake)
  Open --> Bidding: 3 Yes votes
  Open --> Rejected: 2 No votes
  Open --> NeedsReview: 4 votes, neither rule met
  NeedsReview --> Bidding: human_confirm (coordinator)
  NeedsReview --> Rejected: human_reject (coordinator)
  Bidding --> Awarded: close_bidding, tranche 1 paid
  Bidding --> Expired: no valid bids
  Awarded --> ProofSubmitted: submit_proof (winner)
  Awarded --> Expired: proof deadline passed (anyone calls expire)
  ProofSubmitted --> Delivered: 2 of 4 delivery ok, tranche 2 paid
  ProofSubmitted --> Awarded: 3 delivery No, first time (one retry)
  ProofSubmitted --> Expired: 3 delivery No, second time
  Rejected --> [*]
  Delivered --> [*]
  Expired --> [*]
```

- **3 yes votes:** the case is funded and opens for bids. **2 no votes:** rejected. Otherwise, once all four have voted, a registered coordinator decides.
- **Spending cap:** the lowest of the tier limit, a set share of the available pool (20%), and what is left of the daily limit.
- **Winner:** the lowest valid ask under the cap, with ties going to the faster delivery. Bids must also meet the minimum reputation and maximum delivery time.
- **Tranche 1** (40% in the demo settings) is paid when bidding closes. **Tranche 2** is paid only when at least 2 of 4 verifiers say the proof checks out.
- **Expired:** the held second payment goes back to the pool and the NGO loses 20 reputation. The case page shows a button to do this once the deadline has passed.

## Money flow

```mermaid
flowchart LR
  D["Donor wallet"] -- "ft_transfer_call" --> P["Pool balance"]
  P -- "case verified" --> AV{"Available<br/>= balance - reserved"}
  AV -- "close_bidding reserves<br/>full award" --> RS["Reserved for the case"]
  RS -- "tranche 1 (40%)<br/>at award" --> W["Winning NGO"]
  RS -- "tranche 2 (60%)<br/>after 2 of 4 delivery ok" --> W
  RS -- "proof rejected twice<br/>or deadline passed" --> AV
```

Worked example from the recorded S1 run (`s6177-2024-09-10-002-s1`, amounts in test USDC):

| Step | Amount | Why |
|---|---|---|
| Tier 3 cap | 5,000 | Lowest of tier cap (5,000), 20% of the available pool (20,000) and daily limit left (25,000) |
| Bids | 4,600 · 4,000 · 3,400 | Three simulated NGOs bid 92%, 80% and 68% of the cap |
| Award | 3,400 | Lowest ask wins (`ngo-frugal`) |
| Tranche 1 | 1,360 | 40% of 3,400, paid at award |
| Tranche 2 | 2,040 | 60% of 3,400, paid after four delivery ok votes |

In the S5 run the proof claims 50,000 households against a plan of 600 and a location 86 km away; all four delivery votes say no, so the 2,040 stays in the pool.

## What is on chain and what is not

```mermaid
flowchart LR
  subgraph On["On chain (relief contract)"]
    o1["Cases, status, cap, winner"]
    o2["Votes: role, verdict, confidence,<br/>tier, evidence_hash"]
    o3["Bids, award, tranche payments"]
    o4["Donations, pool balance"]
    o5["NEP-297 events for every step"]
  end
  subgraph Off["Off chain (evidence store)"]
    x1["Reports (hashed senders, scrubbed text)"]
    x2["Tool results and source URLs"]
    x3["Vote reasoning, model id"]
    x4["NGO profiles, bid plans,<br/>proof packages"]
  end
  Off -- "SHA-256 of each record" --> On
```

Reports stay off chain to protect the people who sent them. Anyone can download a record from the website (`/api/evidence/<sha256>`) and check that it still matches the hash on chain.

## Evidence storage and the hash check

```mermaid
flowchart TD
  Q["GET /api/evidence/&lt;sha256&gt;"] --> L1{"Runner folder<br/>AGENT_EVIDENCE_DIR"}
  L1 -- found --> OK["Return JSON"]
  L1 -- missing --> L2{"Bundled records<br/>web/storage/evidence"}
  L2 -- found --> OK
  L2 -- missing --> L3{"Vercel Blob<br/>evidence/&lt;sha256&gt;.json<br/>(when BLOB_READ_WRITE_TOKEN is set)"}
  L3 -- found --> OK
  L3 -- missing --> NF["404: not in evidence storage"]
  OK --> B["Browser: canonical JSON, SHA-256"]
  B --> CMP{"Equal to the hash<br/>stored on NEAR?"}
  CMP -- yes --> G["Matches. Nothing was edited after it was signed."]
  CMP -- no --> X["Does not match."]
```

- Records from the recorded testnet runs ship with the site in `web/storage/evidence/`, so they always load.
- A fresh hosted run writes to `/tmp` and, when a Vercel Blob store is connected, uploads each new record to Blob, keyed by its hash. The store needs no trust: a changed record would no longer match its on-chain hash.
- **Check hash** and **Check all hashes** run entirely in the browser (`web/lib/hash.ts`), so nobody has to trust the server that served the record.

## Website

| Route | Purpose |
|---|---|
| `/` | What it is, a replay of a funded and a rejected case, the pool, recent cases |
| `/cases`, `/cases/[id]` | Every case including rejected ones; verdict line, votes and reasons, timeline, bids, proof, evidence, payout quote, Copy link and Check all hashes |
| `/donate` | Donate the pool token through a NEAR wallet (NEAR Connect); testnet faucet button |
| `/ngo` | Register with a bond, bid on open cases, see your awards and submit proof, all as wallet transactions to the contract. Switched off on sample data. |
| `/ops`, `/ops/stage` | Run S1, S2, S3, S5 through the agent runner and watch each vote arrive; coordinator review queue |
| `/api/evidence/[hash]` | Serves an evidence or vote record by its hash |
| `/api/evidence` (POST) | Stores an NGO profile, bid plan or proof record and returns its SHA-256, which then goes on chain with the transaction |
| `/api/swarm/run` | Runs one scenario through `executeSwarmScenario` from the agents package, with run spacing and daily-limit guards |
| `/api/payout/quote` | Dry run quote from the NEAR Intents 1Click API |

The site reads from one interface (`web/lib/chain/index.ts`) with two sources behind it: sample data, and NEAR RPC view calls to the contract. The header always shows which one is in use (Data: Sample, Testnet or Mainnet) and whether agent answers are recorded or live.

Every amount on the site links to its transaction or the contract account. In sample mode it shows a "sample" tag instead, so a sample number can never look like a real one.

![Live testnet case detail page showing quorum ring, cap governor math, and hash verification](images/case-delivered.png)

### Donations

The wallet signs one `ft_transfer_call` on the pool token with the relief contract as receiver. Before signing, the site checks the network, the donor's balances, the token registration and the contract's accepted token. After signing, it reads the final transaction from the chain, not from the wallet, and reports exactly how much the contract kept and how much came back. Details and a sequence diagram: [DONATIONS.md](DONATIONS.md).

### Payout quotes

NEAR Intents can deliver a payment as another asset on another chain. The website asks the 1Click API (`POST /v0/quote` with `dry: true`) for the amount of one payment, from USDC on NEAR to USDC on Base, Arbitrum, Ethereum or Solana. A dry run creates no deposit address, so nothing can move. NEAR Intents runs on mainnet only, so on sample data or testnet the quote prices the same amount of real USDC.

## Running modes

| Setting | Values | Effect |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_MODE` (web) | `stub` (default), `testnet`, `mainnet` | Sample data, or the relief contract on that network. Baked in at build time. |
| `NEXT_PUBLIC_DATA_MODE` (web) | `replay` (default), `live` | Whether agents use recorded answers or call models and APIs |
| `CHAIN_MODE`, `SWARM_MODE` (agents and server) | as above | Same choices for `pnpm swarm:run` and the hosted Run button |

```mermaid
flowchart LR
  subgraph Inputs["Agent inputs (SWARM_MODE / NEXT_PUBLIC_DATA_MODE)"]
    I_R["replay: deterministic recorded fixtures<br/>(no API keys needed)"]
    I_L["live: Open-Meteo, GDACS, ReliefWeb, USGS<br/>+ Groq / NEAR AI models"]
  end
  subgraph Settlement["Chain execution (CHAIN_MODE / NEXT_PUBLIC_CHAIN_MODE)"]
    C_S["stub: in-memory state machine<br/>(instant local testing)"]
    C_T["testnet: signed NEAR transactions<br/>on lifeline-demo.testnet"]
  end
  I_R -->|"pnpm demo:replay"| C_S
  I_R -->|"Hosted demo default"| C_T
  I_L -->|"Live S1 smoke check"| C_S
  I_L -->|"Full live testnet run"| C_T
```

| Combination | Command / Where used | External APIs called? | NEAR Testnet txs signed? |
|---|---|---|---|
| `stub` + `replay` | `pnpm demo:replay` (local offline check) | No | No (in-memory) |
| `testnet` + `replay` | Hosted site (`lifeline-relief.vercel.app`) & recorded runs | No | Yes (14 txs per full S1 run) |
| `stub` + `live` | `pnpm --filter @lifeline/agents swarm:run --scenario S1 --mode live --chain stub` | Yes (Weather + LLM) | No (in-memory) |
| `testnet` + `live` | `pnpm swarm:run --scenario S1 --mode live --chain testnet` | Yes (Weather + LLM) | Yes (14 txs per full S1 run) |

All settings are listed with comments in `.env.example` and `web/.env.example`.

## Deployment topology

```mermaid
flowchart TB
  subgraph Vercel["Vercel (lifeline-relief.vercel.app)"]
    N["Next.js app<br/>pages + API routes"]
    AG["@lifeline/agents<br/>(runs inside /api/swarm/run)"]
    BL[("Vercel Blob<br/>evidence records")]
    BU[("Bundled records<br/>web/storage/evidence")]
  end
  subgraph Near["NEAR testnet"]
    RPC["RPC (test.rpc.fastnear.com)"]
    LC["lifeline-demo.testnet"]
    UT["usdc.lifeline-demo.testnet"]
  end
  subgraph Ext["Outside services"]
    LLM["Groq (OpenAI compatible)"]
    DATA["Open-Meteo · GDACS · ReliefWeb · USGS"]
    OC["NEAR Intents 1Click API (mainnet, dry quotes)"]
  end
  Browser["Browser + NEAR wallet"] --> N
  Browser -- "signed tx" --> RPC
  N --> RPC
  AG --> RPC
  RPC --> LC
  RPC --> UT
  AG --> LLM
  AG --> DATA
  N --> OC
  AG --> BL
  N --> BL
  N --> BU
```

The verifier, intake and NGO keys used by the hosted Run button are server-only environment variables. Verifier and intake keys are restricted `FunctionCall` keys (see [ACCOUNTS.md](ACCOUNTS.md)), so a leaked key cannot move pool funds.
