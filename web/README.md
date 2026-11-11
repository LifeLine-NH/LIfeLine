# LifeLine web

The public site, NGO portal and ops console for LifeLine.

## Run it

From the repo root:

```sh
pnpm install
pnpm --filter @lifeline/web dev
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

## Tests

```sh
pnpm --filter @lifeline/web test       # unit tests, includes real mainnet transfer outcomes
pnpm --filter @lifeline/web test:e2e   # local NEAR sandbox: real token + receiver contracts
```

The sandbox test needs the `near-sandbox` binary, which pnpm downloads in an install script. Allow it once with `pnpm approve-builds` (pick `near-sandbox` and `near-workspaces`), then `pnpm rebuild near-sandbox`.
