import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";

const manrope = Manrope({ subsets: ["latin", "latin-ext"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "FinPilot AI — Finansal karar destek paneli",
  description: "Portföyünü, yatırım bütçeni ve finansal hedeflerini tek yerde takip et.",
  applicationName: "FinPilot AI",
  manifest: "/manifest.webmanifest",
  icons: [{ rel: "icon", url: "/icon.svg" }],
};

export const viewport: Viewport = { themeColor: "#07110e", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" className={manrope.variable}>
      <body><StoreProvider>{children}</StoreProvider></body>
    </html>
  );
}
