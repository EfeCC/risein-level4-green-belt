# Onboarding guide (pilot testers)

This is the guide handed to pilot users. Each person completes it in ~3 minutes
and produces **real testnet wallet interactions** (connect + at least one signed
transaction), which is exactly what the Level 4 "10 real users" requirement asks
for.

## What you need

- A Chromium/Firefox browser on desktop or Android.
- A Stellar wallet extension — **[Freighter](https://www.freighter.app/)** is the
  easiest. (xBull, Albedo, Lobstr, Rabet and Hana also work.)

## Step 1 — Switch your wallet to Testnet

In Freighter: open the extension → network dropdown (top) → **Test Net**. Your
account is funded automatically the first time; if not, use
[Friendbot](https://friendbot.stellar.org).

## Step 2 — Open the app & connect

1. Go to the live URL (see the README's "Live demo" link).
2. Click **Connect wallet** → choose your wallet → approve.
3. You should see your address (short form) in the top-right. ✅ *That's your
   first wallet interaction.*

## Step 3 — Mint a demo warehouse receipt

On the **Borrow** tab, click **Get 1,000 kg demo receipt** and approve the
transaction in your wallet.

> On mainnet this step is a real warehouse deposit co-signed by an operator and
> an inspector. On testnet the faucet lets you self-onboard.

## Step 4 — Borrow USDC against it

1. **Collateral:** click MAX (1,000 kg).
2. **Borrow:** enter e.g. `150` USDC (the max at 65% LTV is shown).
3. Click **Borrow USDC** → approve.

Your wallet now holds test USDC, and the **Loan debt / Health factor** update
live.

## Step 5 — Repay (optional)

On the **Repay** sub-tab, click MAX → **Repay** → approve. Your collateral
unlocks and the loan closes. (If interest made the debt exceed your USDC, grab
more from **Supply → Get 10,000 test USDC** first.)

## Step 6 — Provide liquidity (optional)

On the **Supply** tab: **Get 10,000 test USDC** → enter an amount → **Supply
liquidity**. You now earn the interest borrowers pay.

## Step 7 — Leave feedback ⭐️

Click the **Feedback** button (bottom-right), pick a rating and role, and tell us
what worked or confused you. This feeds directly into the product backlog.

---

## For the organizer: collecting proof

- **Wallet interactions:** every action emits an on-chain event. Look up each
  tester's account on
  [stellar.expert (testnet)](https://stellar.expert/explorer/testnet) to see
  their `borrow` / `demo_issued` / `supply` transactions, or filter events on the
  [pool contract](https://stellar.expert/explorer/testnet/contract/CBDLMMONZHBJVZVPUCC267KXSXJR6F3GT3Y56R3K6NYSBIKMZ2MQDSYM).
- **Feedback:** set `FEEDBACK_WEBHOOK_URL` (Discord/Slack/Formspree) before
  sharing the link so submissions arrive in real time; otherwise they're in the
  server logs (`[feedback] …`).
- **Analytics:** the Vercel Analytics dashboard shows connects, borrows, supplies
  and feedback events over time.
