import { DECIMALS, SCALE } from "./config";

/** Convert a fixed-point on-chain amount (7dp) to a JS number for display. */
export function fromUnits(value: bigint | string | number, decimals = DECIMALS): number {
  const v = typeof value === "bigint" ? value : BigInt(Math.trunc(Number(value)));
  const scale = 10 ** decimals;
  // Split to preserve fractional precision without float overflow on the integer part.
  const whole = v / BigInt(scale);
  const frac = v % BigInt(scale);
  return Number(whole) + Number(frac) / scale;
}

/** Convert a human amount to a fixed-point on-chain bigint (7dp), truncating extra precision. */
export function toUnits(value: string | number, decimals = DECIMALS): bigint {
  const s = typeof value === "number" ? value.toString() : value.trim();
  if (s === "" || isNaN(Number(s))) return 0n;
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const paddedFrac = (frac + "0".repeat(decimals)).slice(0, decimals);
  const combined = BigInt(whole || "0") * BigInt(10 ** decimals) + BigInt(paddedFrac || "0");
  return neg ? -combined : combined;
}

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const numFmt = (max = 2) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: max, minimumFractionDigits: 0 });

export function formatUsd(value: bigint | number): string {
  const n = typeof value === "bigint" ? fromUnits(value) : value;
  return usdFmt.format(n);
}

export function formatAmount(value: bigint | number, max = 2): string {
  const n = typeof value === "bigint" ? fromUnits(value) : value;
  return numFmt(max).format(n);
}

export function formatKg(value: bigint | number): string {
  const n = typeof value === "bigint" ? fromUnits(value) : value;
  return `${numFmt(2).format(n)} kg`;
}

export function formatPriceUsd(value: bigint | number): string {
  const n = typeof value === "bigint" ? fromUnits(value) : value;
  return usdFmt.format(n);
}

/** Basis points (e.g. 6500) → "65%". */
export function formatBps(bps: number): string {
  return `${bps / 100}%`;
}

/** Health factor is scaled by 1e7 on-chain; MAX means "no debt". */
export function formatHealthFactor(hf: bigint): string {
  // i128::MAX sentinel used by the contract when there is no debt.
  if (hf > 10n ** 30n) return "∞";
  return fromUnits(hf).toFixed(2);
}

export function healthTone(hf: bigint): "safe" | "warn" | "danger" {
  if (hf > 10n ** 30n) return "safe";
  const n = fromUnits(hf);
  if (n >= 1.5) return "safe";
  if (n >= 1.1) return "warn";
  return "danger";
}

export function shortenAddress(addr: string, chars = 4): string {
  if (!addr) return "";
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export function formatRelativeTime(unixSeconds: number): string {
  if (!unixSeconds) return "never";
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export { SCALE };
