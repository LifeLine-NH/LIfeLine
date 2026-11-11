# Test contracts

Prebuilt wasm files used only by the local sandbox test in `e2e/donate.e2e.test.ts`. They are not deployed anywhere and are not part of the LifeLine product.

| File | Source | SHA-256 |
| --- | --- | --- |
| `fungible_token.wasm` | near/near-workspaces-rs at commit d2e8efc8785d12562db5a58a8ba142e1e559a921, `examples/res/fungible_token.wasm` (the near-sdk-rs NEP-141 example) | afdb62b051a7b7222e0fc1b7e119d6921a9addd159fe531ce0801218db74d735 |
| `defi.wasm` | near/near-workspaces-js at commit d0eba4afcd17aebbb8a71db57eef898866901dbf, `__tests__/build/debug/defi.wasm` (the near-sdk-rs `defi` example, an `ft_on_transfer` receiver) | 503639ba0f69c6bfd4870b9bd79fec959aeaeacdfcee650bb3c4467e736153b0 |

Check them with `sha256sum web/e2e/contracts/*.wasm`.
