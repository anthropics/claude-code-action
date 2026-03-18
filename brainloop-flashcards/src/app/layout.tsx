import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BrainLoop Flashcards",
  description:
    "A flashcard study app by BrainLoop. Study smarter with interactive 3D flashcards across science, history, geography, language, and math.",
  keywords: ["flashcards", "study", "learning", "BrainLoop", "education"],
  authors: [{ name: "NorwegianSpark SA" }],
  metadataBase: new URL("https://flashcards.brainloop.games"),
  openGraph: {
    title: "BrainLoop Flashcards",
    description: "Study smarter with interactive 3D flashcards",
    url: "https://flashcards.brainloop.games",
    siteName: "BrainLoop Flashcards",
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
              background: "#1a1a3e",
              border: "1px solid rgba(168, 85, 247, 0.3)",
              color: "#e2e8f0",
            },
          }}
        />
      </body>
    </html>
  );
}
