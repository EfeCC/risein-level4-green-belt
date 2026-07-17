"use client";
import { ExternalLink, Activity, ShieldCheck } from "lucide-react";
import { CROPS, POOL_PARAMS, CONTRACTS, explorerContract } from "@/lib/config";
import { Card, Stat, Skeleton, Badge } from "@/components/ui/primitives";
import { usePoolStats, usePrices } from "@/hooks/useContractData";
import { fromUnits, formatUsd, formatRelativeTime, shortenAddress } from "@/lib/format";

export function MarketsPanel() {
  const { data: prices } = usePrices(CROPS.map((c) => c.symbol));
  const { data: stats } = usePoolStats();

  const contractRows = [
    ["Lending pool", CONTRACTS.pool],
    ["Warehouse receipt", CONTRACTS.receipt],
    ["Price oracle", CONTRACTS.oracle],
    ["USDC (test)", CONTRACTS.token],
  ] as const;

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide muted">
          <Activity className="h-4 w-4" /> Oracle prices
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {CROPS.map((c) => {
            const p = prices?.[c.symbol];
            const drift =
              p && p.twap > 0n ? (fromUnits(p.spot) / fromUnits(p.twap) - 1) * 100 : 0;
            return (
              <Card key={c.symbol}>
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{c.emoji}</span>
                  <Badge tone="neutral">{formatRelativeTime(Number(p?.last ?? 0n))}</Badge>
                </div>
                <div className="mt-2 font-semibold">{c.label}</div>
                {!p ? (
                  <Skeleton className="mt-2 h-6 w-20" />
                ) : (
                  <>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                      {formatUsd(p.twap)}
                      <span className="ml-1 text-sm font-normal muted">/kg TWAP</span>
                    </div>
                    <div className="mt-0.5 text-xs muted">
                      spot {formatUsd(p.spot)} · {drift >= 0 ? "+" : ""}
                      {drift.toFixed(2)}% vs TWAP
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide muted">Pool</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Liquidity" value={formatUsd(stats?.cash ?? 0n)} loading={!stats} />
          <Stat label="Outstanding" value={formatUsd(stats?.total_principal ?? 0n)} loading={!stats} />
          <Stat label="Total assets" value={formatUsd(stats?.total_assets ?? 0n)} loading={!stats} />
          <Stat
            label="Share price"
            value={stats ? fromUnits(stats.price_per_share).toFixed(4) : "—"}
            loading={!stats}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide muted">
          <ShieldCheck className="h-4 w-4" /> Risk parameters
        </h3>
        <Card>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Param label="Max LTV" value={`${POOL_PARAMS.ltvBps / 100}%`} />
            <Param label="Liquidation" value={`${POOL_PARAMS.liqThresholdBps / 100}%`} />
            <Param label="Borrow APR" value={`${POOL_PARAMS.aprBps / 100}%`} />
            <Param label="TWAP window" value={`${POOL_PARAMS.twapWindowSecs}s`} />
          </dl>
        </Card>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide muted">
          On-chain contracts (testnet)
        </h3>
        <Card className="p-0">
          <ul className="divide-y divide-[var(--border)]">
            {contractRows.map(([label, id]) => (
              <li key={id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-sm font-medium">{label}</div>
                  <div className="mono text-xs muted">{shortenAddress(id, 6)}</div>
                </div>
                <a
                  href={explorerContract(id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
                >
                  Explorer <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
