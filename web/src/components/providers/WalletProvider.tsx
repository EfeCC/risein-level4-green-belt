"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  connectWallet,
  disconnectWallet,
  getWalletAddress,
  initWalletKit,
} from "@/lib/stellar/wallet";
import { captureError, initMonitoring, setMonitoringUser, track } from "@/lib/monitoring";

type WalletContextValue = {
  address: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    initMonitoring();
    initWalletKit();
    getWalletAddress()
      .then((a) => {
        if (a) {
          setAddress(a);
          setMonitoringUser(a);
        }
      })
      .catch(() => {
        /* not connected yet */
      });
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const a = await connectWallet();
      setAddress(a);
      setMonitoringUser(a);
      track("wallet_connect");
    } catch (e) {
      captureError(e, { where: "connect" });
      throw e;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectWallet();
    setAddress(null);
    setMonitoringUser(null);
    track("wallet_disconnect");
  }, []);

  return (
    <WalletContext.Provider value={{ address, connecting, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
