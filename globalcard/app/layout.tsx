import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://globalcard.io"),
  title: {
    default: "GlobalCard — Premium Card Issuing Infrastructure",
    template: "%s | GlobalCard",
  },
  description:
    "Issue virtual and physical cards across 25+ countries. From startup to enterprise — launch your card program in days, not months.",
  keywords: [
    "card issuing",
    "virtual cards",
    "physical cards",
    "fintech",
    "payment cards",
    "card program",
    "BIN sponsor",
  ],
  authors: [{ name: "NorwegianSpark SA" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://globalcard.io",
    siteName: "GlobalCard",
    title: "GlobalCard — Premium Card Issuing Infrastructure",
    description:
      "Issue virtual and physical cards across 25+ countries. Launch your card program in days.",
    images: [
      { url: "/og-image.png", width: 1200, height: 630, alt: "GlobalCard" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GlobalCard — Premium Card Issuing Infrastructure",
    description: "Issue virtual and physical cards across 25+ countries.",
    images: ["/og-image.png"],
    creator: "@globalcard",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "GlobalCard",
              applicationCategory: "FinanceApplication",
              description:
                "Premium card issuing infrastructure for 25 countries",
              url: "https://globalcard.io",
              offers: {
                "@type": "AggregateOffer",
                priceCurrency: "USD",
                lowPrice: "0",
                highPrice: "2499",
              },
              publisher: {
                "@type": "Organization",
                name: "NorwegianSpark SA",
                email: "norwegianspark@gmail.com",
                telephone: "+4799737467",
              },
            }),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
