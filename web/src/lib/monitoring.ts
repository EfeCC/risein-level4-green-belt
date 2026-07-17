"use client";
/**
 * Monitoring + product analytics.
 *
 * - Error tracking: Sentry (@sentry/browser), initialized only when a DSN is
 *   provided, so builds without one stay fully functional. `captureError` also
 *   logs to the console (visible in Vercel runtime logs) as a fallback.
 * - Usage analytics: Vercel Analytics custom events via `track`.
 */
import * as Sentry from "@sentry/browser";
import { track as vercelTrack } from "@vercel/analytics";

let sentryReady = false;

export function initMonitoring(): void {
  if (sentryReady || typeof window === "undefined") return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? "testnet",
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
  sentryReady = true;
}

export function setMonitoringUser(address: string | null): void {
  if (!sentryReady) return;
  Sentry.setUser(address ? { id: address } : null);
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (sentryReady) {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  }
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.error("[harvestlink]", err, context ?? "");
  }
}

export type AnalyticsEvent =
  | "wallet_connect"
  | "wallet_disconnect"
  | "demo_receipt"
  | "faucet_usdc"
  | "borrow"
  | "repay"
  | "supply"
  | "withdraw"
  | "withdraw_collateral"
  | "feedback_submit"
  | "tx_error";

export function track(
  event: AnalyticsEvent,
  props?: Record<string, string | number | boolean>,
): void {
  try {
    vercelTrack(event, props);
  } catch {
    /* analytics must never break the app */
  }
  if (process.env.NODE_ENV !== "production" && typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.debug("[track]", event, props ?? "");
  }
}
