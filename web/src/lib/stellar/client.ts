/**
 * Soroban RPC client: read-only calls via simulation, and signed write calls
 * (build → prepare/simulate+auth → wallet sign → send → poll).
 */
import "./polyfills";
import {
  rpc,
  Contract,
  TransactionBuilder,
  Account,
  Keypair,
  nativeToScVal,
  scValToNative,
  BASE_FEE,
  xdr,
} from "@stellar/stellar-sdk";
import { RPC_URL, NETWORK_PASSPHRASE } from "../config";
import { signTx } from "./wallet";

export const server = new rpc.Server(RPC_URL, {
  allowHttp: RPC_URL.startsWith("http://"),
});

// Ephemeral source account used only to simulate read-only calls. Simulation
// never verifies or submits, so this key is never funded and never signs.
const SIM_SOURCE = Keypair.random().publicKey();

// ---- ScVal helpers ----
export const scAddr = (a: string): xdr.ScVal => nativeToScVal(a, { type: "address" });
export const scSym = (s: string): xdr.ScVal => nativeToScVal(s, { type: "symbol" });
export const scI128 = (v: bigint): xdr.ScVal => nativeToScVal(v, { type: "i128" });
export const scU32 = (v: number): xdr.ScVal => nativeToScVal(v, { type: "u32" });
export const scU64 = (v: bigint | number): xdr.ScVal =>
  nativeToScVal(typeof v === "bigint" ? v : BigInt(v), { type: "u64" });
export const scString = (s: string): xdr.ScVal => nativeToScVal(s, { type: "string" });

/** Read-only call via simulation. Returns the native-decoded result. */
export async function readContract<T = unknown>(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<T> {
  const contract = new Contract(contractId);
  const source = new Account(SIM_SOURCE, "0");
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new ContractError(sim.error, method);
  }
  const retval = sim.result?.retval;
  if (!retval) return undefined as T;
  return scValToNative(retval) as T;
}

export type TxStage = "building" | "signing" | "sending" | "confirming";

/** Signed write call. Returns the confirmed transaction hash. */
export async function writeContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  walletAddress: string,
  onStage?: (stage: TxStage) => void,
): Promise<string> {
  onStage?.("building");
  const contract = new Contract(contractId);
  const account = await server.getAccount(walletAddress);
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(120)
    .build();

  // Simulates, assembles auth entries and sets the Soroban resource fee.
  let prepared;
  try {
    prepared = await server.prepareTransaction(built);
  } catch (e) {
    throw new ContractError(errString(e), method);
  }

  onStage?.("signing");
  const signedXdr = await signTx(prepared.toXDR(), walletAddress);

  onStage?.("sending");
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const sent = await server.sendTransaction(signedTx);
  if (sent.status === "ERROR") {
    throw new ContractError(JSON.stringify(sent.errorResult ?? "send error"), method);
  }

  onStage?.("confirming");
  let getResp = await server.getTransaction(sent.hash);
  let attempts = 0;
  while (getResp.status === "NOT_FOUND" && attempts < 40) {
    await new Promise((r) => setTimeout(r, 900));
    getResp = await server.getTransaction(sent.hash);
    attempts += 1;
  }
  if (getResp.status !== "SUCCESS") {
    throw new ContractError(`transaction ${sent.hash} status ${getResp.status}`, method);
  }
  return sent.hash;
}

/** Maps raw Soroban contract error codes to friendly, human-readable messages. */
const ERROR_MESSAGES: Record<string, string> = {
  "5": "Not enough collateral for this loan amount. Lower the amount or add collateral.",
  "6": "The pool doesn't have enough available liquidity right now. Try a smaller amount.",
  "7": "No active loan found for this crop.",
  "8": "This loan is still healthy and cannot be liquidated.",
  "9": "You don't have that many pool shares to withdraw.",
};

export class ContractError extends Error {
  method: string;
  code?: string;
  constructor(raw: string, method: string) {
    const match = /Error\(Contract, #(\d+)\)/.exec(raw);
    const code = match?.[1];
    const friendly = code && ERROR_MESSAGES[code] ? ERROR_MESSAGES[code] : cleanRaw(raw);
    super(friendly);
    this.name = "ContractError";
    this.method = method;
    this.code = code;
  }
}

function cleanRaw(raw: string): string {
  if (!raw) return "Transaction failed.";
  if (raw.includes("insufficient balance") || raw.includes("#3")) {
    return "Insufficient balance for this action.";
  }
  // Keep it short for the toast; full detail is logged to monitoring.
  return raw.length > 160 ? `${raw.slice(0, 157)}…` : raw;
}

function errString(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : JSON.stringify(e);
}
