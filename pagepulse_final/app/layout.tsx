import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: {
    default: "PagePulse — Web Analysis & SEO Audits",
    template: "%s | PagePulse",
  },
  description:
    "Analyze any webpage instantly. Get SEO audits, performance scores, accessibility reports, and actionable recommendations.",
  openGraph: {
    title: "PagePulse — Web Analysis & SEO Audits",
    description:
      "Analyze any webpage instantly. Get SEO audits, performance scores, accessibility reports, and actionable recommendations.",
    url: "https://pagepulse.app",
    siteName: "PagePulse",
    type: "website",
  },
  metadataBase: new URL("https://pagepulse.app"),
  verification: {
    google: process.env.NEXT_PUBLIC_GSC_VERIFICATION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="en">
      <body className="font-sans">
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>

        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}', { page_path: window.location.pathname });
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
