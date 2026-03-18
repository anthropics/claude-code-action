import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BrainLoop Daily Journal",
  description:
    "Your personal daily journal for reflection, gratitude, and growth. By BrainLoop from NorwegianSpark SA.",
  keywords: ["journal", "daily journal", "mindfulness", "brainloop", "reflection"],
  authors: [{ name: "NorwegianSpark SA" }],
  openGraph: {
    title: "BrainLoop Daily Journal",
    description: "Your personal daily journal for reflection, gratitude, and growth.",
    url: "https://journal.brainloop.games",
    siteName: "BrainLoop Daily Journal",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "rgba(15, 15, 35, 0.95)",
              border: "1px solid rgba(20, 184, 166, 0.3)",
              color: "#e2e8f0",
            },
          }}
        />
      </body>
    </html>
  );
}
