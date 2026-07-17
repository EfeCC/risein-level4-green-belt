# HarvestLink web

Next.js 16 (App Router) dApp for HarvestLink. Connects a Stellar wallet on
testnet and drives the on-chain borrow / supply / liquidation flows.

## Develop

```bash
cp .env.local.example .env.local   # defaults point at the live testnet deployment
npm install
npm run dev                        # http://localhost:3000
npm run build && npm run start     # production build
```

## Structure

- `src/app` — routes: `/` (landing), `/app` (dashboard), `/api/feedback`.
- `src/lib/stellar` — wallet kit wrapper, RPC client (read via simulation, write
  via sign+send), typed contract wrappers, config.
- `src/lib/monitoring.ts` — Vercel Analytics events + Sentry (DSN-guarded).
- `src/components` — UI primitives, borrow/supply/markets panels, wallet button,
  feedback widget.
- `src/hooks` — SWR data hooks + a transaction-action hook (stages, toasts,
  error mapping).

## Deploy (Vercel)

1. Import the repo, set **Root Directory** to `web/`.
2. (Optional) set env vars from `.env.local.example` — `NEXT_PUBLIC_SENTRY_DSN`
   to enable error tracking, `FEEDBACK_WEBHOOK_URL` to receive feedback. The
   contract IDs already default to the live testnet deployment.
3. Deploy. Vercel Analytics is enabled automatically for the project.

## Environment variables

See [`.env.local.example`](.env.local.example). All contract IDs have working
defaults, so the app runs with zero configuration.
