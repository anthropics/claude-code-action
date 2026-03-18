import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BrainLoop Tarot",
  description:
    "Discover your path with mystical tarot readings. Draw cards, explore the Major Arcana, and receive AI-powered interpretive readings.",
  keywords: [
    "tarot",
    "tarot reading",
    "major arcana",
    "divination",
    "brainloop",
    "mystical",
  ],
  authors: [{ name: "NorwegianSpark SA" }],
  openGraph: {
    title: "BrainLoop Tarot",
    description:
      "Discover your path with mystical tarot readings powered by BrainLoop.",
    type: "website",
    url: "https://tarot.brainloop.games",
  },
  metadataBase: new URL("https://tarot.brainloop.games"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "#1a1a3e",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              color: "#e2e8f0",
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}
