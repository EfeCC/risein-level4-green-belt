"use client";
import useSWR from "swr";
import * as C from "@/lib/stellar/contracts";
import { POOL_PARAMS } from "@/lib/config";

const REFRESH = 15_000;

export function usePoolStats() {
  return useSWR("pool-stats", () => C.getPoolStats(), { refreshInterval: REFRESH });
}

export type PriceInfo = { spot: bigint; twap: bigint; last: bigint };

export function usePrices(crops: string[]) {
  return useSWR(
    ["prices", crops.join(",")],
    async () => {
      const entries = await Promise.all(
        crops.map(async (crop) => {
          const [spot, twap, last] = await Promise.all([
            C.getSpotPrice(crop).catch(() => 0n),
            C.getTwap(crop, POOL_PARAMS.twapWindowSecs).catch(() => 0n),
            C.getLastUpdated(crop).catch(() => 0n),
          ]);
          return [crop, { spot, twap, last } as PriceInfo] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, PriceInfo>;
    },
    { refreshInterval: REFRESH },
  );
}

export function useUserPosition(address: string | null, crop: string) {
  return useSWR(
    address ? ["position", address, crop] : null,
    async () => {
      const [loan, debt, hf, avail, receiptBal, usdc] = await Promise.all([
        C.getLoan(address as string, crop),
        C.getLoanDebt(address as string, crop).catch(() => 0n),
        C.getHealthFactor(address as string, crop).catch(() => 0n),
        C.getAvailableToBorrow(address as string, crop).catch(() => 0n),
        C.getReceiptBalance(address as string, crop).catch(() => 0n),
        C.getUsdcBalance(address as string).catch(() => 0n),
      ]);
      return { loan, debt, hf, avail, receiptBal, usdc };
    },
    { refreshInterval: REFRESH },
  );
}

export function useLpPosition(address: string | null) {
  return useSWR(
    address ? ["lp", address] : null,
    async () => {
      const [shares, value, usdc] = await Promise.all([
        C.getSharesOf(address as string).catch(() => 0n),
        C.getLpValue(address as string).catch(() => 0n),
        C.getUsdcBalance(address as string).catch(() => 0n),
      ]);
      return { shares, value, usdc };
    },
    { refreshInterval: REFRESH },
  );
}
