import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrainLoop Oracle | Mystical AI Divination",
  description:
    "Consult the ancient cosmic oracle. Ask your deepest questions and receive prophetic wisdom from beyond the veil of reality.",
  metadataBase: new URL("https://oracle.brainloop.games"),
  openGraph: {
    title: "BrainLoop Oracle | Mystical AI Divination",
    description:
      "Consult the ancient cosmic oracle. Ask your deepest questions and receive prophetic wisdom from beyond the veil.",
    url: "https://oracle.brainloop.games",
    siteName: "BrainLoop Oracle",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BrainLoop Oracle | Mystical AI Divination",
    description:
      "Consult the ancient cosmic oracle. Ask your deepest questions and receive prophetic wisdom from beyond the veil.",
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
              background: "#12122a",
              border: "1px solid rgba(123, 47, 247, 0.3)",
              color: "#e0e0e0",
            },
          }}
        />
      </body>
    </html>
  );
}
