import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Meme Coin Likelihood & Entry/Exit Planner",
  description: "Paste a CA and get score, best entry, and a single chart-validated exit target.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900">{children}</body>
    </html>
  );
}
