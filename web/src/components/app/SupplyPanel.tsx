"use client";
import { useState } from "react";
import { Droplets, PiggyBank, Coins } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Field, Stat } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { POOL_PARAMS } from "@/lib/config";
import { useWallet } from "@/components/providers/WalletProvider";
import { useLpPosition, usePoolStats } from "@/hooks/useContractData";
import { useTxAction } from "@/hooks/useTxAction";
import * as C from "@/lib/stellar/contracts";
import { fromUnits, toUnits, formatUsd, formatAmount } from "@/lib/format";

const FAUCET_AMOUNT = 10_000n * 10_000_000n; // 10,000 test USDC (7dp)

export function SupplyPanel() {
  const { address } = useWallet();
  const { data: stats, mutate: mutateStats } = usePoolStats();
  const { data: lp, isLoading, mutate: mutateLp } = useLpPosition(address);
  const tx = useTxAction();

  const [tab, setTab] = useState<"supply" | "withdraw">("supply");
  const [supplyInput, setSupplyInput] = useState("");
  const [withdrawInput, setWithdrawInput] = useState("");

  if (!address) {
    return (
      <Card className="text-center">
        <PiggyBank className="mx-auto h-10 w-10 text-brand-500" />
        <h3 className="mt-3 text-lg font-semibold">Connect a wallet to provide liquidity</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm muted">
          Deposit USDC, earn interest paid by farmers, and withdraw anytime there&apos;s available
          liquidity.
        </p>
      </Card>
    );
  }

  const shares = lp?.shares ?? 0n;
  const value = lp?.value ?? 0n;
  const usdc = lp?.usdc ?? 0n;

  const utilization =
    stats && stats.total_assets > 0n
      ? Number((stats.total_principal * 10000n) / stats.total_assets) / 100
      : 0;

  async function getUsdc() {
    await tx.run({
      action: (onStage) => C.faucetUsdc(FAUCET_AMOUNT, { address: address as string, onStage }),
      success: "10,000 test USDC sent to your wallet.",
      event: "faucet_usdc",
      onDone: () => mutateLp(),
    });
  }

  async function doSupply() {
    await tx.run({
      action: (onStage) => C.supply(toUnits(supplyInput), { address: address as string, onStage }),
      success: `Supplied ${formatUsd(toUnits(supplyInput))} to the pool.`,
      event: "supply",
      eventProps: { amount: Number(supplyInput) },
      onDone: () => {
        setSupplyInput("");
        return Promise.all([mutateLp(), mutateStats()]);
      },
    });
  }

  async function doWithdraw() {
    await tx.run({
      action: (onStage) => C.withdraw(toUnits(withdrawInput), { address: address as string, onStage }),
      success: `Withdrew ${formatAmount(toUnits(withdrawInput))} shares.`,
      event: "withdraw",
      onDone: () => {
        setWithdrawInput("");
        return Promise.all([mutateLp(), mutateStats()]);
      },
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Pool liquidity" value={formatUsd(stats?.cash ?? 0n)} loading={!stats} />
          <Stat label="Total assets" value={formatUsd(stats?.total_assets ?? 0n)} loading={!stats} />
          <Stat label="Utilization" value={`${utilization.toFixed(1)}%`} loading={!stats} />
          <Stat label="Borrow APR" value={`${POOL_PARAMS.aprBps / 100}%`} hint="paid to LPs" />
        </div>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide muted">Your position</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{formatUsd(value)}</div>
              <div className="mt-0.5 text-xs muted">{formatAmount(shares)} shares</div>
            </div>
            <Coins className="h-8 w-8 text-brand-500" />
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-[var(--bg)] p-3">
            <span className="text-sm muted">Wallet USDC</span>
            <span className="text-sm font-semibold tabular-nums">{formatUsd(usdc)}</span>
          </div>
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={getUsdc} loading={tx.busy}>
            <Droplets className="h-4 w-4" /> Get 10,000 test USDC
          </Button>
        </Card>
      </div>

      <Card className="p-0">
        <div className="flex border-b border-[var(--border)]">
          {(["supply", "withdraw"] as const).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex-1 py-3 text-sm font-medium capitalize transition-colors",
                tab === id
                  ? "border-b-2 border-brand-600 text-brand-700 dark:text-brand-300"
                  : "muted hover:text-[var(--text)]",
              )}
            >
              {id}
            </button>
          ))}
        </div>
        <div className="p-5 sm:p-6">
          {isLoading ? (
            <div className="space-y-3">
              <div className="skeleton h-12" />
              <div className="skeleton h-11" />
            </div>
          ) : tab === "supply" ? (
            <div className="space-y-4">
              <Field
                label="Supply amount"
                value={supplyInput}
                onChange={setSupplyInput}
                onMax={() => setSupplyInput(fromUnits(usdc).toFixed(2))}
                suffix="USDC"
                hint={`balance ${formatUsd(usdc)}`}
              />
              <Button
                className="w-full"
                onClick={doSupply}
                loading={tx.busy}
                disabled={toUnits(supplyInput) <= 0n || toUnits(supplyInput) > usdc}
              >
                Supply liquidity
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Field
                label="Withdraw shares"
                value={withdrawInput}
                onChange={setWithdrawInput}
                onMax={() => setWithdrawInput(fromUnits(shares).toFixed(2))}
                suffix="shares"
                hint={`have ${formatAmount(shares)}`}
              />
              <p className="text-xs muted">
                Shares redeem for USDC at the current share price. Withdrawal needs enough idle
                liquidity in the pool.
              </p>
              <Button
                className="w-full"
                variant="secondary"
                onClick={doWithdraw}
                loading={tx.busy}
                disabled={toUnits(withdrawInput) <= 0n || toUnits(withdrawInput) > shares}
              >
                Withdraw
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
