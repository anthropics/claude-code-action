import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrainLoop Finance",
  description:
    "Personal finance tracker by BrainLoop - Track your spending, manage budgets, and take control of your finances.",
  keywords: ["finance", "budget", "tracker", "personal finance", "BrainLoop"],
  authors: [{ name: "NorwegianSpark SA" }],
  metadataBase: new URL("https://finance.brainloop.games"),
  openGraph: {
    title: "BrainLoop Finance",
    description: "Personal finance tracker by BrainLoop",
    url: "https://finance.brainloop.games",
    siteName: "BrainLoop Finance",
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
      <body>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#12122a",
              border: "1px solid #1e1e3a",
              color: "#f1f5f9",
            },
          }}
        />
      </body>
    </html>
  );
}
