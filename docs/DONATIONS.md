# How donations work

This is the agreement between the relief contract (developer A) and the web app (developer C). If the contract follows it, the donate page works without changes.

![Live donate page showing the shared relief pool balance, escrow breakdown, and wallet connection](images/donate.png)

## End-to-End Donation Flow

```mermaid
sequenceDiagram
  autonumber
  participant Donor as Donor Browser + Wallet
  participant Web as LifeLine Web App (Pre-flight & Outcome Parser)
  participant FT as Pool Token (usdc.lifeline-demo.testnet)
  participant Relief as Relief Contract (lifeline-demo.testnet)

  Donor->>Web: Enter donation amount & click Donate
  Web->>Relief: get_config() (verify pool_token matches)
  Web->>FT: storage_balance_of(relief), ft_balance_of(donor)
  Note over Web: Pre-flight passes: network, token,<br/>storage registration, and balance verified
  Web->>Donor: Request signature for ft_transfer_call(receiver_id, amount, msg)
  Donor->>FT: Sign & broadcast ft_transfer_call (1 yoctoNEAR, 150 TGas)
  FT->>Relief: ft_on_transfer(sender_id, amount, msg)
  alt Accepted in full
    Relief-->>FT: Return U128(0) (0 refunded -> 100% kept)
    Note over Relief: Credit pool_balance, record Donation,<br/>emit EVENT_JSON donation
  else Receiver panics or rejects token
    Relief-->>FT: Panic / return U128(amount)
  end
  FT->>FT: ft_resolve_transfer (settle used vs refunded amount)
  FT-->>Web: Final transaction hash
  Web->>FT: RPC tx(txHash, senderId) — inspect all receipt outcomes
  Note over Web: Verify receiver, signer, ft_resolve_transfer return value,<br/>and any failed receipt on Relief contract
  Web-->>Donor: Show exact accepted amount, any refund, and NearBlocks link
```

## The transaction

A donor's wallet signs one transaction to the pool token:

```
receiver: <pool token>
method:   ft_transfer_call
args:     { "receiver_id": "<relief contract>", "amount": "<base units>", "msg": "<NEXT_PUBLIC_DONATION_MSG, default empty>" }
deposit:  1 yoctoNEAR (required by NEP-141)
gas:      150 TGas (NEXT_PUBLIC_DONATE_GAS_TGAS)
```

The token then calls `ft_on_transfer(sender_id, amount, msg)` on the relief contract.

## What the relief contract must do

1. **Be registered with the token.** The deploy script calls `storage_deposit({ account_id: <relief> })` on the token. Without it the token refuses the transfer. The site checks this and pauses donations if it's missing.
2. **Accept only the pool token.** In `ft_on_transfer`, check `env::predecessor_account_id() == pool_token`. For any other token, return the full `amount` (or panic) so the sender gets everything back.
3. **Return the unused amount.** Return `"0"` (as `U128`) when the whole donation is kept. Return the part to give back if only some is kept. A panic refunds everything. The site reads the token's final answer and tells the donor exactly what was kept and what came back, including the panic message.
4. **Record the donation.** Add to the pool, store `Donation { donor: sender_id, amount, at }`, and emit the `donation` event (NEP-297).
5. **Expose `get_config`** with a `pool_token` field. The site compares it with its own setting and pauses donations if they differ.

## Test tokens on testnet

If `NEXT_PUBLIC_TEST_TOKEN_FAUCET=true`, the donate page shows "Get 100 test tokens". It sends one transaction to the token with:

1. `storage_deposit({ account_id: <donor>, registration_only: true })`, attaching `storage_balance_bounds().min`. This is only included if the donor isn't registered yet.
2. `mint({ to: <donor>, amount })`.

So the testnet `mock-ft` needs a public `mint(to, amount)`. Never set the faucet flag on a mainnet build. The site ignores it outside testnet anyway.

## How the result is checked

The site never trusts the wallet's report. It takes the transaction hash, asks the NEAR RPC for the final outcome, and checks four things:

- The transaction went to the expected token, from the expected signer, with the expected receiver and amount.
- The overall status.
- The used amount returned by `ft_resolve_transfer`.
- Any failed receipt on the relief contract.

The parser is tested on real mainnet outcomes (accepted, partial, refunded, receiver panicked) in `web/lib/near/outcome.test.ts`, and end to end on a local sandbox in `web/e2e/donate.e2e.test.ts`.
