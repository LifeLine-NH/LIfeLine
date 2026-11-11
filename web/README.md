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
