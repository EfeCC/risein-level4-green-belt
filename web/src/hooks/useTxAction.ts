"use client";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ContractError, type TxStage } from "@/lib/stellar/client";
import { captureError, track, type AnalyticsEvent } from "@/lib/monitoring";
import { explorerTx } from "@/lib/config";

const STAGE_LABEL: Record<TxStage, string> = {
  building: "Preparing transaction…",
  funding: "Funding your testnet account…",
  signing: "Waiting for wallet signature…",
  sending: "Submitting to Stellar…",
  confirming: "Confirming on-chain…",
};

type RunOptions = {
  action: (onStage: (s: TxStage) => void) => Promise<string>;
  success: string;
  event?: AnalyticsEvent;
  eventProps?: Record<string, string | number | boolean>;
  onDone?: () => unknown | Promise<unknown>;
};

export function useTxAction() {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<TxStage | null>(null);

  const run = useCallback(async (opts: RunOptions): Promise<string | null> => {
    setBusy(true);
    setStage("building");
    const id = toast.loading(STAGE_LABEL.building);
    try {
      const hash = await opts.action((s) => {
        setStage(s);
        toast.loading(STAGE_LABEL[s], { id });
      });
      toast.success(opts.success, {
        id,
        description: "Transaction confirmed on the Stellar testnet.",
        action: {
          label: "Explorer",
          onClick: () => window.open(explorerTx(hash), "_blank", "noopener"),
        },
      });
      if (opts.event) track(opts.event, opts.eventProps);
      await opts.onDone?.();
      return hash;
    } catch (e) {
      const msg =
        e instanceof ContractError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Transaction failed";
      toast.error(msg, { id });
      captureError(e, { where: opts.event ?? "tx" });
      track("tx_error", { action: opts.event ?? "unknown" });
      return null;
    } finally {
      setBusy(false);
      setStage(null);
    }
  }, []);

  return { busy, stage, run };
}
