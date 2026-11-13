# Architecture

How a disaster report becomes a funded, delivered and checked relief case, and where each piece of data lives.

## Parts

| Part | Where | What it does |
|---|---|---|
| Intake | `agents/src/intake/` | Groups reports by place (within about 1 km) and time (within about 1 hour) into a case. Hashes each sender id so no phone number or raw id leaves intake. Removes phone numbers and emails from report text. Builds the evidence bundle and its SHA-256. |
| Evidence tools | `agents/src/tools/` | Open-Meteo (rain and wind), GDACS (disaster alerts), ReliefWeb (situation reports), USGS (earthquakes). A tool that fails returns "unclear", never "yes". |
| Verifiers | `agents/src/verifiers/` | Four agents, each signing as its own NEAR account. Details below. |
| Orchestrator | `agents/src/orchestrator/` | Runs the four verifiers at the same time with timeouts. One verifier failing becomes an abstain and does not block the others. |
| NGO bidders | `agents/src/ngo/` | Three simulated responder bots that bid on funded cases and submit proof of delivery. |
| Chain client | `agents/src/chain/client.ts` | Sends `submit_case`, `vote`, `place_bid` and the rest to the relief contract on testnet, or applies the same rules in memory when offline. |
| Relief contract | not in this repository yet | Holds the pool, counts votes, sets the cap, runs bidding and both payments. Owned by developer A. |
| Website | `web/` | Reads the contract, serves evidence, runs scenarios through the agents, quotes payouts through NEAR Intents, and lets donors give through their wallet. |

## The four verifiers

| Role | Account | How it decides | Model |
|---|---|---|---|
| Geo | `v-geo` | Plain code: how many independent senders, how spread out in time and place, whether one sender dominates. | None |
| Fact | `v-fact` | Calls the outside data tools and asks a model to weigh them. Cannot vote yes unless at least two outside sources support the claim. | Llama 3.3 70B (default provider: Groq) |
| Severity | `v-sev` | Proposes a tier from 1 to 4. Tier 1 means no funding. | Qwen QwQ 32B (default provider: Groq) |
| Red team | `v-red` | Tries to prove the report is fake. Looks for instructions hidden in report text and votes no if it finds one. | Gemini 2.5 Flash (Google AI Studio) |

Report text is always treated as data, never as instructions. Every vote is saved as a vote record (verdict, confidence, reasoning, the tool results it used), and the SHA-256 of that record is sent with the vote.

Model names above are the defaults in `agents/src/llm/client.ts`. Any OpenAI compatible endpoint can be used instead, including NEAR AI Cloud, by setting `NEAR_AI_BASE_URL` and `NEAR_AI_API_KEY` (or the model id variables). In replay mode no model is called.

## Case states

```
Open ──4 votes──► Verified ──► Bidding ──close──► Awarded ──proof──► ProofSubmitted ──2 of 4 ok──► Delivered
  │                                                  │
  ├──2 no──► Rejected                                └──deadline──► Expired (money returns to the pool)
  └──neither rule──► NeedsReview ──a coordinator decides──► Verified or Rejected
```

- 3 yes votes: the case is funded. 2 no votes: rejected. Otherwise, once all four have voted, a registered coordinator decides.
- Spending cap: the lowest of the tier limit, a set share of the available pool, and what is left of the daily limit.
- The winner is the lowest ask under the cap. The contract design also requires a minimum reputation and a maximum delivery time; the offline runs apply the lowest ask rule only, with ties going to the faster delivery. The winner is paid a first share at once (40% in the demo settings).
- The second share is paid only when at least 2 of 4 verifiers say the proof checks out.

## What is on chain and what is not

| Data | Where |
|---|---|
| Cases, votes, bids, payments, donations, the pool | Relief contract state and events |
| Reports, sender details, tool results, vote reasoning, proof packages | Off chain, as JSON records. Only their SHA-256 hashes are on chain. |

Reports stay off chain to protect the people who sent them. Anyone can download a record from the website (`/api/evidence/<sha256>`) and check that it still matches the hash on chain. The website does this in the browser with the **Check hash** button, so nobody has to trust our server.

## Website

| Route | Purpose |
|---|---|
| `/` | What it is, a replay of a funded and a rejected case, the pool, recent cases |
| `/cases`, `/cases/[id]` | Every case including rejected ones; votes, reasons, timeline, bids, proof, evidence, payout quote |
| `/donate` | Donate the pool token through a NEAR wallet (NEAR Connect) |
| `/ngo` | Cases open for bids and how responding works. Registering and bidding from the site wait for the contract. |
| `/ops`, `/ops/stage` | Run S1, S2, S3, S5 through the agent runner and watch each vote arrive |
| `/api/evidence/[hash]` | Serves an evidence or vote record by its hash |
| `/api/swarm/run` | Runs one scenario through `executeSwarmScenario` from the agents package |
| `/api/payout/quote` | Dry run quote from the NEAR Intents 1Click API |

The site reads from one interface (`web/lib/chain/index.ts`) with two sources behind it: sample data, and NEAR RPC view calls to the contract. The header always shows which one is in use (Data: Sample, Testnet or Mainnet) and whether agent answers are recorded or live.

Every amount on the site links to its transaction or the contract account. In sample mode it shows a "sample" tag instead, so a sample number can never look like a real one.

### Donations

The wallet signs one `ft_transfer_call` on the pool token with the relief contract as receiver. Before signing, the site checks the network, the donor's balances, the token registration and the contract's accepted token. After signing, it reads the final transaction from the chain, not from the wallet, and reports exactly how much the contract kept and how much came back. The interface the contract must follow is in [DONATIONS.md](DONATIONS.md).

### Payout quotes

NEAR Intents can deliver a payment as another asset on another chain. The website asks the 1Click API (`POST /v0/quote` with `dry: true`) for the amount of one payment, from USDC on NEAR to USDC on Base, Arbitrum, Ethereum or Solana. A dry run creates no deposit address, so nothing can move. NEAR Intents runs on mainnet only, so on sample data or testnet the quote prices the same amount of real USDC.

## Running modes

| Setting | Values | Effect |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_MODE` (web) | `stub` (default), `testnet`, `mainnet` | Sample data, or the relief contract on that network |
| `NEXT_PUBLIC_DATA_MODE` (web) | `replay` (default), `live` | Whether agents use recorded answers or call models and APIs |
| `CHAIN_MODE`, `SWARM_MODE` (agents CLI) | as above | Same choices for `pnpm swarm:run` |

All web settings are listed with comments in `web/.env.example`.
