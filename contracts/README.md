# HarvestLink contracts

Soroban (Rust) workspace for the HarvestLink protocol. Four crates:

| Crate | What it does |
|---|---|
| `token` | Mock USDC (SEP-41 fungible token) with a testnet faucet. Replaced by anchor-issued USDC on mainnet. |
| `oracle` | Commodity/FX price feed exposing a **TWAP** with per-update **deviation bounds**. |
| `receipt` | Warehouse-receipt token — **attestation-gated** minting (warehouse + inspector), fractional, redeemable. |
| `lending-pool` | Collateralized lending: LP shares (vault model), LTV borrow, linear interest, liquidation. |

See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the data model,
math, and security rationale.

## Develop

```bash
# Prereqs
rustup target add wasm32v1-none
cargo install --locked stellar-cli      # or a prebuilt release binary

cargo test            # 25 unit + integration tests
stellar contract build   # -> target/wasm32v1-none/release/{token,oracle,receipt,lending_pool}.wasm
```

## Test coverage

- `token` — mint/transfer/faucet, limits, double-init guard.
- `oracle` — TWAP time-weighting, deviation bounds, single-sample fallback.
- `receipt` — attestation (incl. wrong-authority rejection), transfer, partial
  redemption, demo faucet cap.
- `lending-pool` — full borrow → 1-year interest → repay cycle with LP profit,
  over-LTV rejection, price-drop liquidation, healthy-loan protection, LP
  supply/withdraw, partial collateral withdrawal.

## Notes

- Built for `wasm32v1-none` with `soroban-sdk` 27.
- `Cargo.lock` pins `ed25519-dalek` to 2.x (3.0.0 breaks `soroban-env-host`'s
  test utilities); keep the pin when updating dependencies.
