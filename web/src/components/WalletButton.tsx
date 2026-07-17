"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Wallet, LogOut, Copy, ExternalLink, ChevronDown } from "lucide-react";
import { useWallet } from "@/components/providers/WalletProvider";
import { Button } from "@/components/ui/Button";
import { shortenAddress } from "@/lib/format";
import { explorerAccount } from "@/lib/config";

export function WalletButton() {
  const { address, connecting, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function handleConnect() {
    try {
      await connect();
    } catch {
      toast.error("Could not connect wallet. Is your wallet extension installed and on testnet?");
    }
  }

  if (!address) {
    return (
      <Button onClick={handleConnect} loading={connecting} size="sm">
        <Wallet className="h-4 w-4" /> Connect wallet
      </Button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        <span className="h-2 w-2 rounded-full bg-brand-500" />
        <span className="mono">{shortenAddress(address)}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="card absolute right-0 z-50 mt-2 w-56 overflow-hidden p-1 shadow-xl">
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
            onClick={() => {
              navigator.clipboard.writeText(address);
              toast.success("Address copied");
              setOpen(false);
            }}
          >
            <Copy className="h-4 w-4" /> Copy address
          </button>
          <a
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
            href={explorerAccount(address)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <ExternalLink className="h-4 w-4" /> View on explorer
          </a>
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
          >
            <LogOut className="h-4 w-4" /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
