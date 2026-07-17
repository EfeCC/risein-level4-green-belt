"use client";
/**
 * Thin wrapper around Stellar Wallets Kit (multi-wallet: Freighter, xBull,
 * Albedo, Lobstr, Rabet, Hana). The kit exposes a static API in v2.5.
 */
import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule, FREIGHTER_ID } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { RabetModule } from "@creit.tech/stellar-wallets-kit/modules/rabet";
import { HanaModule } from "@creit.tech/stellar-wallets-kit/modules/hana";
import { NETWORK_PASSPHRASE } from "../config";

let initialized = false;

export function initWalletKit(): void {
  if (initialized || typeof window === "undefined") return;
  StellarWalletsKit.init({
    network: Networks.TESTNET,
    selectedWalletId: FREIGHTER_ID,
    modules: [
      new FreighterModule(),
      new xBullModule(),
      new AlbedoModule(),
      new LobstrModule(),
      new RabetModule(),
      new HanaModule(),
    ],
  });
  initialized = true;
}

/** Open the wallet-selection modal and return the chosen public key. */
export async function connectWallet(): Promise<string> {
  initWalletKit();
  const { address } = await StellarWalletsKit.authModal();
  return address;
}

/** Return the address already in the kit's memory, or null if not connected. */
export async function getWalletAddress(): Promise<string | null> {
  initWalletKit();
  try {
    const { address } = await StellarWalletsKit.getAddress();
    return address || null;
  } catch {
    return null;
  }
}

export async function signTx(xdr: string, address: string): Promise<string> {
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
    address,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  return signedTxXdr;
}

export async function disconnectWallet(): Promise<void> {
  try {
    await StellarWalletsKit.disconnect();
  } catch {
    /* ignore */
  }
}
