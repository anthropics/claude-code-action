import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BrainLoop Word Game",
  description:
    "A Wordle-style word puzzle game by BrainLoop. Guess the 5-letter word in 6 tries!",
  keywords: ["wordle", "word game", "puzzle", "brainloop", "brain game"],
  authors: [{ name: "NorwegianSpark SA" }],
  openGraph: {
    title: "BrainLoop Word Game",
    description: "Guess the 5-letter word in 6 tries!",
    url: "https://words.brainloop.games",
    siteName: "BrainLoop Word Game",
    type: "website",
  },
  metadataBase: new URL("https://words.brainloop.games"),
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
          position="top-center"
          toastOptions={{
            style: {
              background: "#111128",
              border: "1px solid #1e1e3a",
              color: "#f0f0f0",
            },
          }}
        />
      </body>
    </html>
  );
}
