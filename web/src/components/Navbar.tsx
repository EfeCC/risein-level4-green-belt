"use client";
import Link from "next/link";
import { Sprout } from "lucide-react";
import { WalletButton } from "@/components/WalletButton";
import { GithubIcon } from "@/components/ui/icons";

export function Navbar({ variant = "app" }: { variant?: "app" | "landing" }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
            <Sprout className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">
            Harvest<span className="text-brand-600">Link</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-3">
          {variant === "landing" ? (
            <>
              <a href="#how" className="hidden rounded-lg px-3 py-2 text-sm font-medium hover:text-brand-600 sm:block">
                How it works
              </a>
              <a href="#why" className="hidden rounded-lg px-3 py-2 text-sm font-medium hover:text-brand-600 sm:block">
                Why Stellar
              </a>
              <Link
                href="/app"
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Launch app
              </Link>
            </>
          ) : (
            <>
              <a
                href="https://github.com/EfeCC/risein-level4-green-belt"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden rounded-lg p-2 hover:bg-black/5 sm:inline-flex dark:hover:bg-white/5"
                aria-label="GitHub repository"
              >
                <GithubIcon className="h-5 w-5" />
              </a>
              <WalletButton />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
