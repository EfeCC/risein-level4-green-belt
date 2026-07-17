import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";
import "./globals.css";
import { WalletProvider } from "@/components/providers/WalletProvider";
import { FeedbackWidget } from "@/components/FeedbackWidget";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "HarvestLink — Warehouse receipt financing on Stellar",
    template: "%s · HarvestLink",
  },
  description:
    "Farmers tokenize stored crops as warehouse receipts and borrow stablecoin against them — an oracle-priced, over-collateralized lending pool on Stellar Soroban.",
  keywords: [
    "Stellar",
    "Soroban",
    "DeFi",
    "warehouse receipt financing",
    "agri-finance",
    "RWA",
    "USDC",
  ],
  openGraph: {
    title: "HarvestLink — Warehouse receipt financing on Stellar",
    description:
      "Tokenize stored crops, borrow stablecoin against them, repay and redeem. Built on Stellar Soroban.",
    type: "website",
  },
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <WalletProvider>
          {children}
          <FeedbackWidget />
        </WalletProvider>
        <Toaster position="top-center" richColors closeButton />
        <Analytics />
      </body>
    </html>
  );
}
