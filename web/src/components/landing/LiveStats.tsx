"use client";
import { usePoolStats, usePrices } from "@/hooks/useContractData";
import { POOL_PARAMS, DEFAULT_CROP } from "@/lib/config";
import { formatUsd } from "@/lib/format";
import { Skeleton } from "@/components/ui/primitives";

export function LiveStats() {
  const { data: stats } = usePoolStats();
  const { data: prices } = usePrices([DEFAULT_CROP.symbol]);
  const wheat = prices?.[DEFAULT_CROP.symbol];

  const items = [
    { label: "Pool liquidity", value: stats ? formatUsd(stats.cash) : null },
    { label: "Total assets", value: stats ? formatUsd(stats.total_assets) : null },
    { label: "Wheat price", value: wheat ? `${formatUsd(wheat.twap)}/kg` : null },
    { label: "Borrow APR", value: `${POOL_PARAMS.aprBps / 100}%` },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="card p-4 text-center">
          <div className="text-xs uppercase tracking-wide muted">{it.label}</div>
          {it.value === null ? (
            <Skeleton className="mx-auto mt-2 h-6 w-16" />
          ) : (
            <div className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">{it.value}</div>
          )}
        </div>
      ))}
    </div>
  );
}
