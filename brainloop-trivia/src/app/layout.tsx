import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrainLoop Trivia Battle",
  description:
    "Challenge your friends in the ultimate trivia battle! Test your knowledge across Science, History, Geography, Entertainment, Sports, and Technology.",
  keywords: [
    "trivia",
    "quiz",
    "brain game",
    "multiplayer",
    "knowledge",
    "BrainLoop",
  ],
  authors: [{ name: "NorwegianSpark SA" }],
  metadataBase: new URL("https://trivia.brainloop.games"),
  openGraph: {
    title: "BrainLoop Trivia Battle",
    description:
      "Challenge your friends in the ultimate trivia battle! Test your knowledge across 6 categories.",
    url: "https://trivia.brainloop.games",
    siteName: "BrainLoop Trivia Battle",
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
      <body className="font-sans">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "#1a1a2e",
              border: "1px solid #2a2a3e",
              color: "#f5f5f5",
            },
          }}
        />
      </body>
    </html>
  );
}
