import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { WalletProvider } from "@/lib/wallet/WalletProvider";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", axes: ["opsz"] });
const body = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbm" });

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://lifeline-relief.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "LifeLine",
  description:
    "A public relief pool on NEAR. Money moves only when four independent verifiers agree, and responders are paid against proof of delivery.",
  openGraph: {
    type: "website",
    siteName: "LifeLine",
    title: "LifeLine — Relief money that moves only when four checks agree",
    description:
      "A public disaster relief pool on NEAR. Four independent verifiers check every report, a contract sets the cap, and responders are paid against proof of delivery.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "LifeLine — Public disaster relief pool on NEAR" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LifeLine — Relief money that moves only when four checks agree",
    description:
      "A public disaster relief pool on NEAR. Four independent verifiers check every report, a contract sets the cap, and responders are paid against proof of delivery.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="ll flex min-h-screen flex-col">
        <WalletProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
