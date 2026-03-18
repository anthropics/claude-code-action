import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrainLoop AI Advisor",
  description:
    "Get personalized guidance from AI-powered advisors. Choose from five unique personas tailored to your needs.",
  keywords: [
    "AI advisor",
    "life coach",
    "career strategist",
    "relationship guide",
    "creative muse",
    "stoic philosopher",
    "BrainLoop",
  ],
  authors: [{ name: "NorwegianSpark SA" }],
  openGraph: {
    title: "BrainLoop AI Advisor",
    description:
      "Get personalized guidance from AI-powered advisors. Choose from five unique personas.",
    url: "https://advisor.brainloop.games",
    siteName: "BrainLoop AI Advisor",
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
              background: "#232344",
              color: "#f0f0f8",
              border: "1px solid #2d2d52",
            },
          }}
        />
      </body>
    </html>
  );
}
