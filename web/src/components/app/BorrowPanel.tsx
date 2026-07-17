"use client";
import { useMemo, useState } from "react";
import { Wheat, Sparkles, ArrowDownToLine, HandCoins, Undo2 } from "lucide-react";
import { CROPS, POOL_PARAMS, SCALE } from "@/lib/config";
import { Button } from "@/components/ui/Button";
import { Badge, Card, Field, Skeleton, Stat } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { useWallet } from "@/components/providers/WalletProvider";
import { usePrices, useUserPosition } from "@/hooks/useContractData";
import { useTxAction } from "@/hooks/useTxAction";
import * as C from "@/lib/stellar/contracts";
import {
  fromUnits,
  toUnits,
  formatUsd,
  formatKg,
  formatHealthFactor,
  healthTone,
} from "@/lib/format";

type Tab = "borrow" | "repay" | "collateral";

export function BorrowPanel() {
  const { address } = useWallet();
  const [crop, setCrop] = useState(CROPS[0].symbol);
  const [tab, setTab] = useState<Tab>("borrow");

  const { data: prices } = usePrices(CROPS.map((c) => c.symbol));
  const { data: pos, isLoading, mutate } = useUserPosition(address, crop);
  const tx = useTxAction();

  const twap = prices?.[crop]?.twap ?? 0n;
  const priceOk = twap > 0n;

  const [collateralInput, setCollateralInput] = useState("");
  const [borrowInput, setBorrowInput] = useState("");
  const [repayInput, setRepayInput] = useState("");
  const [wdInput, setWdInput] = useState("");

  const estMaxBorrow = useMemo(() => {
    const collUnits = toUnits(collateralInput || "0");
    if (collUnits <= 0n || !priceOk) return 0n;
    return (((collUnits * twap) / SCALE) * BigInt(POOL_PARAMS.ltvBps)) / 10000n;
  }, [collateralInput, twap, priceOk]);

  if (!address) {
    return (
      <Card className="text-center">
        <Wheat className="mx-auto h-10 w-10 text-brand-500" />
        <h3 className="mt-3 text-lg font-semibold">Connect a wallet to borrow</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm muted">
          Tokenize a warehouse receipt and borrow USDC against your stored crop — all on the Stellar
          testnet.
        </p>
      </Card>
    );
  }

  const receiptBal = pos?.receiptBal ?? 0n;
  const loan = pos?.loan ?? null;
  const debt = pos?.debt ?? 0n;
  const hf = pos?.hf ?? 0n;
  const usdc = pos?.usdc ?? 0n;

  async function getDemoReceipt() {
    await tx.run({
      action: (onStage) => C.requestDemoReceipt(crop, { address: address as string, onStage }),
      success: "1,000 kg demo receipt minted to your wallet.",
      event: "demo_receipt",
      eventProps: { crop },
      onDone: () => mutate(),
    });
  }

  async function doBorrow() {
    await tx.run({
      action: (onStage) =>
        C.borrow(crop, toUnits(collateralInput), toUnits(borrowInput), {
          address: address as string,
          onStage,
        }),
      success: `Borrowed ${formatUsd(toUnits(borrowInput))} against ${formatKg(toUnits(collateralInput))}.`,
      event: "borrow",
      eventProps: { crop, amount: Number(borrowInput) },
      onDone: () => {
        setCollateralInput("");
        setBorrowInput("");
        return mutate();
      },
    });
  }

  async function doRepay() {
    await tx.run({
      action: (onStage) =>
        C.repay(crop, toUnits(repayInput), { address: address as string, onStage }),
      success: `Repaid ${formatUsd(toUnits(repayInput))}.`,
      event: "repay",
      eventProps: { crop, amount: Number(repayInput) },
      onDone: () => {
        setRepayInput("");
        return mutate();
      },
    });
  }

  async function doWithdrawCollateral() {
    await tx.run({
      action: (onStage) =>
        C.withdrawCollateral(crop, toUnits(wdInput), { address: address as string, onStage }),
      success: `Released ${formatKg(toUnits(wdInput))} of collateral.`,
      event: "withdraw_collateral",
      eventProps: { crop },
      onDone: () => {
        setWdInput("");
        return mutate();
      },
    });
  }

  const borrowValid =
    toUnits(collateralInput) > 0n &&
    toUnits(collateralInput) <= receiptBal &&
    toUnits(borrowInput) > 0n &&
    toUnits(borrowInput) <= estMaxBorrow;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      {/* Position summary */}
      <div className="space-y-4">
        <CropPicker crop={crop} onChange={setCrop} />
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Your receipts" value={formatKg(receiptBal)} loading={isLoading} />
          <Stat label="Wallet USDC" value={formatUsd(usdc)} loading={isLoading} />
          <Stat
            label={`${crop} price (TWAP)`}
            value={priceOk ? `${formatUsd(twap)}/kg` : "—"}
            loading={!prices}
          />
          <Stat
            label="Loan debt"
            value={formatUsd(debt)}
            loading={isLoading}
            hint={loan ? `${formatKg(loan.collateral)} collateral` : "no active loan"}
          />
        </div>

        {loan && debt > 0n && (
          <Card className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide muted">Health factor</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{formatHealthFactor(hf)}</div>
            </div>
            <Badge tone={healthTone(hf)}>
              {healthTone(hf) === "safe" ? "Healthy" : healthTone(hf) === "warn" ? "Watch" : "At risk"}
            </Badge>
          </Card>
        )}

        {receiptBal === 0n && !isLoading && (
          <Card className="bg-brand-50/60 dark:bg-brand-900/20">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
              <div>
                <p className="text-sm font-medium">No receipts yet</p>
                <p className="mt-0.5 text-sm muted">
                  On mainnet a warehouse operator + inspector co-sign your deposit. For the testnet
                  pilot, mint a demo receipt to try the full flow.
                </p>
                <Button className="mt-3" size="sm" variant="grain" onClick={getDemoReceipt} loading={tx.busy}>
                  <Sparkles className="h-4 w-4" /> Get 1,000 kg demo receipt
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Actions */}
      <Card className="p-0">
        <div className="flex border-b border-[var(--border)]">
          {(
            [
              ["borrow", "Borrow", HandCoins],
              ["repay", "Repay", Undo2],
              ["collateral", "Collateral", ArrowDownToLine],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors",
                tab === id
                  ? "border-b-2 border-brand-600 text-brand-700 dark:text-brand-300"
                  : "muted hover:text-[var(--text)]",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-6">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : tab === "borrow" ? (
            <div className="space-y-4">
              <Field
                label="Collateral"
                value={collateralInput}
                onChange={setCollateralInput}
                onMax={() => setCollateralInput(fromUnits(receiptBal).toString())}
                suffix="kg"
                hint={`have ${formatKg(receiptBal)}`}
              />
              <Field
                label="Borrow"
                value={borrowInput}
                onChange={setBorrowInput}
                onMax={() => setBorrowInput(fromUnits(estMaxBorrow).toFixed(2))}
                suffix="USDC"
                hint={`max ~${formatUsd(estMaxBorrow)} @ ${POOL_PARAMS.ltvBps / 100}% LTV`}
              />
              <Button className="w-full" onClick={doBorrow} loading={tx.busy} disabled={!borrowValid}>
                {toUnits(borrowInput) > estMaxBorrow ? "Exceeds LTV limit" : "Borrow USDC"}
              </Button>
            </div>
          ) : tab === "repay" ? (
            <div className="space-y-4">
              <Field
                label="Repay amount"
                value={repayInput}
                onChange={setRepayInput}
                onMax={() => setRepayInput(fromUnits(debt).toFixed(2))}
                suffix="USDC"
                hint={`owe ${formatUsd(debt)}`}
              />
              <p className="text-xs muted">
                Interest first, then principal. Fully repaying returns all collateral and closes the
                loan.
              </p>
              <Button
                className="w-full"
                onClick={doRepay}
                loading={tx.busy}
                disabled={toUnits(repayInput) <= 0n || debt <= 0n}
              >
                Repay
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Field
                label="Release collateral"
                value={wdInput}
                onChange={setWdInput}
                onMax={() => loan && setWdInput(fromUnits(loan.collateral).toString())}
                suffix="kg"
                hint={loan ? `${formatKg(loan.collateral)} locked` : "no collateral"}
              />
              <p className="text-xs muted">
                You can withdraw collateral as long as the loan stays above the liquidation
                threshold.
              </p>
              <Button
                className="w-full"
                variant="secondary"
                onClick={doWithdrawCollateral}
                loading={tx.busy}
                disabled={toUnits(wdInput) <= 0n || !loan}
              >
                Withdraw collateral
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function CropPicker({ crop, onChange }: { crop: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-2">
      {CROPS.map((c) => (
        <button
          key={c.symbol}
          onClick={() => onChange(c.symbol)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium transition-colors",
            crop === c.symbol
              ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
              : "border-[var(--border)] muted hover:border-brand-400",
          )}
        >
          <span>{c.emoji}</span> {c.label}
        </button>
      ))}
    </div>
  );
}
