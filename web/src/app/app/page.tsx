"use client";
import { useState } from "react";
import { HandCoins, PiggyBank, BarChart3, FlaskConical } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { BorrowPanel } from "@/components/app/BorrowPanel";
import { SupplyPanel } from "@/components/app/SupplyPanel";
import { MarketsPanel } from "@/components/app/MarketsPanel";
import { cn } from "@/lib/cn";

const TABS = [
  { id: "borrow", label: "Borrow", icon: HandCoins, tagline: "Tokenize a receipt, borrow USDC" },
  { id: "supply", label: "Supply", icon: PiggyBank, tagline: "Provide liquidity, earn interest" },
  { id: "markets", label: "Markets", icon: BarChart3, tagline: "Prices, pool health, contracts" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AppPage() {
  const [tab, setTab] = useState<TabId>("borrow");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-900/30 dark:text-amber-300">
            <FlaskConical className="h-3.5 w-3.5" /> Stellar testnet · demo funds only
          </span>
        </div>

        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{active.label}</h1>
          <p className="mt-1 text-sm muted">{active.tagline}</p>
        </header>

        <div className="mb-6 inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4",
                tab === t.id
                  ? "bg-brand-600 text-white shadow-sm"
                  : "muted hover:text-[var(--text)]",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        <div key={tab} className="animate-in">
          {tab === "borrow" && <BorrowPanel />}
          {tab === "supply" && <SupplyPanel />}
          {tab === "markets" && <MarketsPanel />}
        </div>
      </main>
    </>
  );
}
