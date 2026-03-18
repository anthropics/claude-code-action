import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BrainLoop Habit Tracker",
  description:
    "Track your daily habits, build streaks, and achieve your goals with BrainLoop Habit Tracker by NorwegianSpark SA.",
  metadataBase: new URL("https://habits.brainloop.games"),
  openGraph: {
    title: "BrainLoop Habit Tracker",
    description:
      "Track your daily habits, build streaks, and achieve your goals.",
    url: "https://habits.brainloop.games",
    siteName: "BrainLoop Habit Tracker",
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
        <div className="min-h-screen flex flex-col">
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "rgba(17, 17, 40, 0.95)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#e2e8f0",
            },
          }}
        />
      </body>
    </html>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 mt-auto">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <span className="font-semibold text-gray-300">
              NorwegianSpark SA
            </span>
            <span className="hidden sm:inline text-gray-600">|</span>
            <span>Org. 834 984 172</span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <a
              href="mailto:norwegianspark@gmail.com"
              className="hover:text-green-400 transition-colors"
            >
              norwegianspark@gmail.com
            </a>
            <span className="hidden sm:inline text-gray-600">|</span>
            <a
              href="tel:+4799737467"
              className="hover:text-green-400 transition-colors"
            >
              +47 99 73 74 67
            </a>
          </div>
        </div>
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
          <a
            href="/privacy"
            className="hover:text-green-400 transition-colors"
          >
            Privacy Policy
          </a>
          <span className="text-gray-600">|</span>
          <a href="/terms" className="hover:text-green-400 transition-colors">
            Terms of Service
          </a>
        </div>
      </div>
    </footer>
  );
}
