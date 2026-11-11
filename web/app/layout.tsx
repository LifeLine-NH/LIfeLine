import type { Metadata } from "next";
import { Big_Shoulders_Stencil, Public_Sans } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { WalletProvider } from "@/lib/wallet/WalletProvider";
import "./globals.css";

const stencil = Big_Shoulders_Stencil({ variable: "--font-stencil", subsets: ["latin"] });
const publicSans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LifeLine",
  description:
    "A public relief pool on NEAR. Money moves only when four independent verifiers agree, and responders are paid against proof of delivery.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${stencil.variable} ${publicSans.variable} antialiased`}>
      <body className="flex min-h-screen flex-col">
        <WalletProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
          <footer className="border-t border-line">
            <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted sm:px-6">
              Built at NEAR HACKATHON 2026. Every amount on this site comes from the relief contract or links to
              the record it came from.
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
