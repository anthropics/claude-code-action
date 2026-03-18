import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrainLoop Productivity",
  description:
    "Stay focused and productive with BrainLoop Focus - a Pomodoro timer and task management app by NorwegianSpark SA.",
  keywords: ["pomodoro", "timer", "productivity", "tasks", "focus", "brainloop"],
  authors: [{ name: "NorwegianSpark SA" }],
  metadataBase: new URL("https://focus.brainloop.games"),
  openGraph: {
    title: "BrainLoop Productivity",
    description:
      "Stay focused and productive with BrainLoop Focus - a Pomodoro timer and task management app.",
    url: "https://focus.brainloop.games",
    siteName: "BrainLoop Focus",
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
          position="top-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "rgba(15, 15, 42, 0.9)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#e2e8f0",
              backdropFilter: "blur(12px)",
            },
          }}
        />
      </body>
    </html>
  );
}
