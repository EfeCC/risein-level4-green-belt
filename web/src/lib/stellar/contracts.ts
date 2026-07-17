/**
 * Typed wrappers over the HarvestLink contracts. Reads use simulation; writes
 * take the connected wallet address and an optional stage callback for UX.
 */
import { CONTRACTS } from "../config";
import {
  readContract,
  writeContract,
  scAddr,
  scSym,
  scI128,
  scU64,
  type TxStage,
} from "./client";

export type PoolStats = {
  total_shares: bigint;
  total_principal: bigint;
  cash: bigint;
  total_assets: bigint;
  price_per_share: bigint;
};

export type Loan = {
  borrower: string;
  crop: string;
  collateral: bigint;
  principal: bigint;
  interest_accrued: bigint;
  last_accrual: bigint;
  apr_bps: number;
};

export type PoolParams = {
  usdc: string;
  oracle: string;
  receipt: string;
  ltv_bps: number;
  liq_threshold_bps: number;
  apr_bps: number;
  twap_window: bigint;
};

export type PriceSample = { timestamp: bigint; price: bigint };

type Write = { address: string; onStage?: (s: TxStage) => void };

// ---------------------------------------------------------------- reads

export const getPoolStats = () => readContract<PoolStats>(CONTRACTS.pool, "pool_stats");

export const getPoolParams = () => readContract<PoolParams>(CONTRACTS.pool, "get_params");

export async function getLoan(borrower: string, crop: string): Promise<Loan | null> {
  const loan = await readContract<Loan | null>(CONTRACTS.pool, "get_loan", [
    scAddr(borrower),
    scSym(crop),
  ]);
  return loan ?? null;
}

export const getLoanDebt = (borrower: string, crop: string) =>
  readContract<bigint>(CONTRACTS.pool, "loan_debt", [scAddr(borrower), scSym(crop)]);

export const getHealthFactor = (borrower: string, crop: string) =>
  readContract<bigint>(CONTRACTS.pool, "health_factor", [scAddr(borrower), scSym(crop)]);

export const getAvailableToBorrow = (borrower: string, crop: string) =>
  readContract<bigint>(CONTRACTS.pool, "available_to_borrow", [scAddr(borrower), scSym(crop)]);

export const quoteBorrow = (crop: string, collateral: bigint) =>
  readContract<bigint>(CONTRACTS.pool, "quote_borrow", [scSym(crop), scI128(collateral)]);

export const getSharesOf = (lp: string) =>
  readContract<bigint>(CONTRACTS.pool, "shares_of", [scAddr(lp)]);

export const getLpValue = (lp: string) =>
  readContract<bigint>(CONTRACTS.pool, "lp_value", [scAddr(lp)]);

export const getReceiptBalance = (owner: string, crop: string) =>
  readContract<bigint>(CONTRACTS.receipt, "balance", [scAddr(owner), scSym(crop)]);

export const getReceiptSupply = (crop: string) =>
  readContract<bigint>(CONTRACTS.receipt, "total_supply", [scSym(crop)]);

export const getUsdcBalance = (addr: string) =>
  readContract<bigint>(CONTRACTS.token, "balance", [scAddr(addr)]);

export const getSpotPrice = (crop: string) =>
  readContract<bigint>(CONTRACTS.oracle, "get_price", [scSym(crop)]);

export const getTwap = (crop: string, windowSecs: number) =>
  readContract<bigint>(CONTRACTS.oracle, "get_twap", [scSym(crop), scU64(windowSecs)]);

export const getPriceSamples = (crop: string) =>
  readContract<PriceSample[]>(CONTRACTS.oracle, "get_samples", [scSym(crop)]);

export const getLastUpdated = (crop: string) =>
  readContract<bigint>(CONTRACTS.oracle, "last_updated", [scSym(crop)]);

// ---------------------------------------------------------------- writes

export const requestDemoReceipt = (crop: string, { address, onStage }: Write) =>
  writeContract(CONTRACTS.receipt, "request_demo_receipt", [scAddr(address), scSym(crop)], address, onStage);

export const faucetUsdc = (amount: bigint, { address, onStage }: Write) =>
  writeContract(CONTRACTS.token, "faucet", [scAddr(address), scI128(amount)], address, onStage);

export const supply = (amount: bigint, { address, onStage }: Write) =>
  writeContract(CONTRACTS.pool, "supply", [scAddr(address), scI128(amount)], address, onStage);

export const withdraw = (shares: bigint, { address, onStage }: Write) =>
  writeContract(CONTRACTS.pool, "withdraw", [scAddr(address), scI128(shares)], address, onStage);

export const borrow = (
  crop: string,
  collateral: bigint,
  borrowAmount: bigint,
  { address, onStage }: Write,
) =>
  writeContract(
    CONTRACTS.pool,
    "borrow",
    [scAddr(address), scSym(crop), scI128(collateral), scI128(borrowAmount)],
    address,
    onStage,
  );

export const repay = (crop: string, amount: bigint, { address, onStage }: Write) =>
  writeContract(CONTRACTS.pool, "repay", [scAddr(address), scSym(crop), scI128(amount)], address, onStage);

export const withdrawCollateral = (crop: string, amount: bigint, { address, onStage }: Write) =>
  writeContract(
    CONTRACTS.pool,
    "withdraw_collateral",
    [scAddr(address), scSym(crop), scI128(amount)],
    address,
    onStage,
  );

export const liquidate = (borrower: string, crop: string, { address, onStage }: Write) =>
  writeContract(
    CONTRACTS.pool,
    "liquidate",
    [scAddr(address), scAddr(borrower), scSym(crop)],
    address,
    onStage,
  );
