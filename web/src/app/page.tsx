import Link from "next/link";
import {
  ArrowRight,
  Warehouse,
  Coins,
  HandCoins,
  RefreshCw,
  ShieldCheck,
  Landmark,
  Gauge,
  Boxes,
  TrendingUp,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { GithubIcon } from "@/components/ui/icons";
import { LiveStats } from "@/components/landing/LiveStats";
import { CONTRACTS, explorerContract, POOL_PARAMS } from "@/lib/config";

const STEPS = [
  {
    icon: Warehouse,
    title: "Deposit & attest",
    body: "A farmer delivers crop to a partner warehouse. The operator and an independent inspector co-sign the deposit on-chain.",
  },
  {
    icon: Coins,
    title: "Tokenize the receipt",
    body: "A fractional, redeemable warehouse-receipt token is minted to the farmer's wallet — a real-world asset on Stellar.",
  },
  {
    icon: HandCoins,
    title: "Borrow stablecoin",
    body: `Lock the receipt as collateral and draw up to ${POOL_PARAMS.ltvBps / 100}% of its oracle-priced value in USDC, instantly.`,
  },
  {
    icon: RefreshCw,
    title: "Repay & redeem",
    body: "When the crop sells, repay principal + interest. Collateral unlocks and the receipt can be redeemed for the physical crop.",
  },
];

const WHY_STELLAR = [
  {
    icon: Boxes,
    title: "Native tokenization",
    body: "Warehouse receipts are protocol-level assets — fractional and tradeable without a bespoke token standard.",
  },
  {
    icon: Landmark,
    title: "Anchors for fiat",
    body: "SEP-24 anchors give farmers a regulated on/off-ramp so they borrow USDC and cash out in local currency.",
  },
  {
    icon: ShieldCheck,
    title: "Oracle-safe lending",
    body: "Collateral is valued on a time-weighted average price with sanity bounds — hardened against spot-price manipulation.",
  },
  {
    icon: Gauge,
    title: "Cheap, ~5s finality",
    body: "Sub-cent fees make $200–$2,000 smallholder loans economical where L1 gas never could.",
  },
];

export default function Home() {
  return (
    <>
      <Navbar variant="landing" />

      {/* Hero */}
      <section className="hero-mesh">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Live on Stellar testnet
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-6xl">
              Turn stored crops into <span className="gradient-text">instant liquidity</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg muted">
              HarvestLink lets smallholder farmers and cooperatives tokenize warehouse receipts and
              borrow stablecoin against their harvest — instead of dumping crops to middlemen at
              20–40% below fair value.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 font-medium text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700"
              >
                Launch app <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-3 font-medium hover:border-brand-400"
              >
                How it works
              </a>
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-3xl">
            <LiveStats />
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              The value is real. The liquidity isn&apos;t.
            </h2>
            <p className="mt-4 muted">
              Prices are lowest right after harvest, yet formal buyers pay 30–90 days later. Farmers
              with no credit history and no traditional collateral are shut out of formal lending —
              so they sell cheap or borrow from informal lenders at punishing rates.
            </p>
            <p className="mt-4 muted">
              Stored commodities represent genuine value that is illiquid and unbankable until the
              crop is finally sold. HarvestLink unlocks that value the moment it&apos;s in the
              warehouse.
            </p>
          </div>
          <div className="card p-6">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide muted">
              <TrendingUp className="h-4 w-4" /> Worked example
            </div>
            <ul className="mt-4 space-y-3 text-sm">
              <ExampleRow k="1,000 kg wheat stored" v="collateral" />
              <ExampleRow k="Oracle value @ $0.30/kg" v="$300.00" />
              <ExampleRow k={`Borrowable @ ${POOL_PARAMS.ltvBps / 100}% LTV`} v="$195.00" accent />
              <ExampleRow k="Received in USDC" v="today, not in 90 days" />
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-[var(--border)] bg-[var(--bg-elevated)]/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
          <p className="mx-auto mt-3 max-w-xl text-center muted">
            Four on-chain steps, each a real Soroban contract call you can try on testnet right now.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="card p-6">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-white">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <span className="text-3xl font-bold text-[var(--border)]">{i + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Stellar */}
      <section id="why" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">Why Stellar</h2>
        <p className="mx-auto mt-3 max-w-xl text-center muted">
          This isn&apos;t &ldquo;any blockchain would do.&rdquo; It needs cheap fractional issuance,
          native fiat ramps and programmable collateral — Stellar&apos;s exact stack.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_STELLAR.map((f) => (
            <div key={f.title} className="card p-6">
              <f.icon className="h-6 w-6 text-brand-600" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="card hero-mesh flex flex-col items-center gap-4 p-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Try the full flow in two minutes
          </h2>
          <p className="max-w-xl muted">
            Connect a Stellar wallet on testnet, mint a demo receipt, borrow USDC, then repay — every
            step a real on-chain transaction.
          </p>
          <Link
            href="/app"
            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 font-medium text-white hover:bg-brand-700"
          >
            Launch app <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm sm:flex-row sm:px-6">
          <p className="muted">
            HarvestLink · a RiseIn Level 4 project on Stellar Soroban · testnet demo
          </p>
          <div className="flex items-center gap-4">
            <a
              href={explorerContract(CONTRACTS.pool)}
              target="_blank"
              rel="noopener noreferrer"
              className="muted hover:text-brand-600"
            >
              Contracts
            </a>
            <a
              href="https://github.com/EfeCC/risein-level4-green-belt"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 muted hover:text-brand-600"
            >
              <GithubIcon className="h-4 w-4" /> GitHub
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}

function ExampleRow({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <li className="flex items-center justify-between border-b border-[var(--border)] pb-2 last:border-0">
      <span className="muted">{k}</span>
      <span className={accent ? "font-semibold text-brand-600" : "font-medium"}>{v}</span>
    </li>
  );
}
