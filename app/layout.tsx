import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: {
    default: "PagePulse — AI-Powered Web Analysis",
    template: "%s | PagePulse",
  },
  description:
    "Analyze any webpage with AI. Get instant SEO audits, performance scores, accessibility reports, and actionable recommendations.",
  openGraph: {
    title: "PagePulse — AI-Powered Web Analysis",
    description:
      "Analyze any webpage with AI. Get instant SEO audits, performance scores, accessibility reports, and actionable recommendations.",
    url: "https://pagepulse.app",
    siteName: "PagePulse",
    type: "website",
  },
  metadataBase: new URL("https://pagepulse.app"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
