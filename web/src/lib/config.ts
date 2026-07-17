/**
 * Network + deployment configuration.
 *
 * Contract IDs default to the live HarvestLink testnet deployment but can be
 * overridden with NEXT_PUBLIC_* env vars (see .env.local.example) so the same
 * build can point at a fresh deployment without code changes.
 */

export const NETWORK = "testnet" as const;

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

export const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";

export const EXPLORER_URL = "https://stellar.expert/explorer/testnet";

export const CONTRACTS = {
  token: process.env.NEXT_PUBLIC_TOKEN_ID ?? "CDCJOWQYCVCSAOPAYMD4U2S342TVDPKSSCMTY54NWBEXYNR57UNIDMTE",
  oracle: process.env.NEXT_PUBLIC_ORACLE_ID ?? "CB6WKVUSDSNYRTHE3IJRIMPIPPYDD32FSGSHW3VLUTLY2TCRYPNUQLAF",
  receipt: process.env.NEXT_PUBLIC_RECEIPT_ID ?? "CCVFARC3PQS7OW22TSRZNSTHTGXAIMNCSFY52WYWGSU72JBCYNXS6LNT",
  pool: process.env.NEXT_PUBLIC_POOL_ID ?? "CBDLMMONZHBJVZVPUCC267KXSXJR6F3GT3Y56R3K6NYSBIKMZ2MQDSYM",
} as const;

/** Fixed-point scale shared by USDC, receipt kilograms and oracle prices. */
export const DECIMALS = 7;
export const SCALE = 10_000_000n;

export type Crop = {
  symbol: string;
  label: string;
  emoji: string;
  /** Human blurb for the market card. */
  blurb: string;
};

export const CROPS: Crop[] = [
  { symbol: "WHEAT", label: "Wheat", emoji: "🌾", blurb: "Stored grain, the pilot's primary crop." },
  { symbol: "RICE", label: "Rice", emoji: "🍚", blurb: "Milled and bagged, warehouse-graded." },
  { symbol: "COFFEE", label: "Coffee", emoji: "☕", blurb: "Green beans, higher value per kg." },
];

export const DEFAULT_CROP = CROPS[0];

/**
 * Protocol parameters shown in the UI. The authoritative values live on-chain
 * (pool.get_params) and are fetched at runtime; these mirror the deployment for
 * instant first paint and copy.
 */
export const POOL_PARAMS = {
  ltvBps: 6500,
  liqThresholdBps: 8000,
  aprBps: 1200,
  twapWindowSecs: 300,
} as const;

export function explorerTx(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function explorerContract(id: string): string {
  return `${EXPLORER_URL}/contract/${id}`;
}

export function explorerAccount(addr: string): string {
  return `${EXPLORER_URL}/account/${addr}`;
}
