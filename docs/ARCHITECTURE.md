# HarvestLink — Architecture

This document covers the contract data model, the financial math, the numeric
conventions, and the security decisions behind the MVP.

## Numeric conventions

Everything uses **7 fixed-point decimals** (`SCALE = 10_000_000`), matching
Stellar's native precision:

| Quantity | Unit | Example |
|---|---|---|
| USDC amounts | USD, 7dp | `1_500000000` = $150.00 |
| Receipt balances | kilograms, 7dp | `10_000000000` = 1,000.0 kg |
| Oracle prices | USD per kg, 7dp | `3_000000` = $0.30/kg |
| Basis points | 1/10000 | `6500` = 65% |
| Health factor | ratio, 7dp | `16_000000` = 1.60 |

## Contracts

### `oracle` — price feed

Stands in for the **Reflector** oracle network on testnet. An authorized updater
pushes prices; consumers read a **time-weighted average price (TWAP)**.

- `set_price(asset, price)` — appends a `(timestamp, price)` sample, capped to a
  ring buffer. Rejected if it deviates from the last price by more than
  `max_deviation_bps` (default 50%).
- `get_twap(asset, window_seconds)` — integrates price over time within the
  window: `Σ(price_i · dt_i) / Σ(dt_i)`. Falls back to the latest price when the
  window contains no elapsed time.

**Why TWAP + bounds?** Two independent defenses against oracle manipulation:
a single anomalous update is (1) rejected outright if it's too large, and
(2) diluted across the averaging window even if accepted. This is a deliberate
response to the February 2026 Stellar lending exploit that stemmed from naive
spot-price usage.

### `receipt` — warehouse receipt token

Fungible **per crop symbol**, so a receipt is fractional and partially
redeemable. Units are kilograms (7dp).

- `attest_deposit(warehouse, inspector, farmer, crop, quantity, unit_value)` —
  mints a receipt to the farmer. Requires **both** the warehouse operator and an
  independent inspector to authorize (multi-sig-lite anti-fraud). Records an
  on-chain `Deposit` for provenance.
- `request_demo_receipt(caller, crop)` — testnet-only faucet (capped per
  address) so pilot users can self-onboard. Removed on mainnet.
- `transfer`, `redeem` — move receipts / burn on physical withdrawal (owner +
  warehouse co-authorize redemption).

### `lending-pool` — the protocol core

Liquidity providers deposit USDC and receive **shares**; farmers lock receipts
and borrow USDC.

**LP accounting (vault model).**
```
total_assets     = pool_usdc_cash + total_outstanding_principal
price_per_share  = total_assets / total_shares         (7dp, starts at 1.0)
shares_minted    = amount * total_shares / total_assets_before
```
Accrued-but-unpaid interest is **excluded** from `total_assets` (conservative);
it is realized into cash on repayment, which lifts `price_per_share` for LPs.

**Borrowing.** Collateral is valued on the oracle TWAP:
```
collateral_value = collateral_kg * twap_price / SCALE
max_borrow       = collateral_value * ltv_bps / 10000      (LTV = 65%)
```
A borrow is allowed while `principal + interest ≤ max_borrow`.

**Interest.** Linear, per second, fixed at borrow time:
```
interest += principal * apr_bps/10000 * Δt / SECONDS_PER_YEAR   (APR = 12%)
```
Repayments apply to interest first, then principal. Fully repaying returns all
collateral and closes the loan.

**Liquidation.** A loan is unhealthy when
```
debt > collateral_value * liq_threshold_bps / 10000        (threshold = 80%)
```
i.e. `health_factor = collateral_value * threshold / debt < 1.0`. Any account may
call `liquidate`, repaying the full debt and seizing the collateral. Because LTV
(65%) sits safely below the liquidation threshold (80%), the collateral is still
worth more than the debt at liquidation, making it economically rational.

## Cross-contract design

The pool calls the oracle, receipt, and token contracts through lightweight
`#[contractclient]` interfaces declared locally in the pool crate — **not** by
depending on those crates. Depending on them would link their exported wasm
symbols (`initialize`, …) into the pool binary and cause duplicate-symbol errors.
The real contracts are pulled in only as `dev-dependencies` to drive the
cross-contract integration tests.

## Authorization model

- Farmers/LPs sign their own actions (`require_auth`).
- When the pool moves **its own** USDC/receipts it is auto-authorized as the
  calling contract.
- When the pool pulls a farmer's collateral or a repayment, the farmer's
  signature covers the nested `require_auth` via Soroban's auth-entry tree
  (assembled during `prepareTransaction`, signed by the wallet).

## Frontend data flow

- **Reads** are `simulateTransaction` calls against a throwaway source account —
  no signing, no fees — decoded with `scValToNative`. Wrapped in SWR hooks that
  auto-revalidate every 15s.
- **Writes** follow build → `prepareTransaction` (simulate + assemble auth +
  set resource fee) → wallet sign → `sendTransaction` → poll `getTransaction`.
  Contract error codes are mapped to human-readable messages.

## Parameters (testnet deployment)

| Parameter | Value |
|---|---|
| Max LTV | 65% |
| Liquidation threshold | 80% |
| Borrow APR | 12% |
| TWAP window | 300s |
| Oracle max deviation | 50% per update |
| Seeded prices | wheat $0.30, rice $0.42, coffee $5.20 /kg |
| Seed liquidity | 100,000 test USDC |
