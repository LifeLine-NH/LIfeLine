# LifeLine web

The public site, NGO portal and ops console for LifeLine.

## Run it

From the repo root:

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. With no environment set, the app runs on sample data and says so in the header ("Sample data").

## Data sources

All pages read through one interface, `lib/chain/index.ts`:

- `stub`: invented sample cases in `lib/stub/data.ts`, for building the UI without a contract.
- `testnet` or `mainnet`: view calls to the relief contract over NEAR RPC (`lib/chain/near.ts`).

Copy `.env.example` to `.env.local` to switch. Evidence records (bundles, vote records, proofs) are served from `/api/evidence/<sha256>`, and the "Check hash" buttons recompute that hash in the browser.

## Donations and wallet

Wallet login uses NEAR Connect (`@hot-labs/near-connect`), which NEAR now recommends over the deprecated Wallet Selector. The donate flow is in `lib/donate/` and is described for the contract side in `docs/DONATIONS.md`.

To try it on testnet, set in `.env.local`:

```sh
NEXT_PUBLIC_CHAIN_MODE=testnet
NEXT_PUBLIC_CONTRACT_ID=<relief contract>
NEXT_PUBLIC_POOL_TOKEN_ID=<test token>
NEXT_PUBLIC_TEST_TOKEN_FAUCET=true
```

## Scenario runs (`/ops`)

`/api/swarm/run` calls `executeSwarmScenario` from the agents package. The agents code finds its prompts, scenarios and recordings relative to its own files, so it runs unbundled from `agents/dist` (`serverExternalPackages` in `next.config.ts`). `pnpm dev` and `pnpm build` compile it first through `pnpm build:agents`, which also copies `agents/src/prompts` into `agents/dist/prompts`. If the prompts are missing, the verifiers fall back to Abstain, and the route refuses to show that run as a result.

Runs use `NEXT_PUBLIC_CHAIN_MODE` and `NEXT_PUBLIC_DATA_MODE`: on `stub` the runner uses its own in memory chain, on `testnet` each step is a transaction signed with the keys in the agents' environment.

## Payout quotes

`/api/payout/quote` asks the NEAR Intents 1Click API for a dry run quote (`lib/intents/quote.ts`). No key is needed; `ONECLICK_API_KEY` removes the service fee. Intents runs on mainnet only.

## Where things are

```
app/                pages and API routes
components/layout   header, mode badges, wallet button, footer
components/ui       buttons, tags, links to records, hash check, countdown
components/case     quorum seal, vote card, timeline, bids, proof, evidence, payout quote
components/home     hero replay, how the money moves, pool figures
components/ops      scenario runner and the large screen view
lib/                chain readers, formatting, case view rules, donate flow, intents, swarm traces
app/lifeline.css    design tokens and component classes ("Quorum" design)
```

## Tests

```sh
pnpm --filter @lifeline/web test       # unit tests, includes real mainnet transfer outcomes
pnpm --filter @lifeline/web test:e2e   # local NEAR sandbox: real token + receiver contracts
```

The sandbox test needs the `near-sandbox` binary, which pnpm downloads in an install script. Allow it once with `pnpm approve-builds` (pick `near-sandbox` and `near-workspaces`), then `pnpm rebuild near-sandbox`.
