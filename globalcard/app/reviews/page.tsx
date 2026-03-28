import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Star } from "lucide-react";

export const metadata: Metadata = {
  title: "Reviews",
  description:
    "What businesses say about GlobalCard. Read reviews from companies using our card issuing platform.",
};

const reviews = [
  {
    name: "Sarah Chen",
    role: "CFO",
    company: "Meridian Logistics",
    rating: 5,
    text: "We switched to GlobalCard from a legacy card provider and the difference is night and day. Issuing virtual cards for our drivers used to take 48 hours — now it takes seconds. The real-time spend controls have saved us thousands in unauthorized purchases.",
  },
  {
    name: "Marcus Olsen",
    role: "Head of Finance",
    company: "TechBridge Solutions",
    rating: 5,
    text: "The API is incredibly well-documented and our engineering team had it integrated within two days. We now issue project-specific virtual cards automatically when new contracts are signed. The webhooks for transaction events are exactly what we needed.",
  },
  {
    name: "Priya Sharma",
    role: "Operations Director",
    company: "NovaPay",
    rating: 5,
    text: "As a fintech startup, we needed a card issuing partner that could scale with us. GlobalCard's multi-currency support across 25 countries meant we could launch in three European markets simultaneously without any additional integrations.",
  },
  {
    name: "James Whitfield",
    role: "CEO",
    company: "Fleet Management Pro",
    rating: 4,
    text: "We manage fuel cards for 200+ vehicles across Scandinavia. GlobalCard's spending rules engine lets us set per-transaction limits, merchant category restrictions, and daily caps — all configurable via their dashboard. Great product, responsive support team.",
  },
  {
    name: "Elena Vasquez",
    role: "VP Engineering",
    company: "SpendWise",
    rating: 5,
    text: "We evaluated five card issuing platforms before choosing GlobalCard. The combination of transparent pricing, comprehensive API, and genuine PCI DSS compliance set them apart. Our compliance team was impressed by the audit trail and reporting features.",
  },
  {
    name: "Thomas Berg",
    role: "Founder",
    company: "Nordic Expense",
    rating: 5,
    text: "Starting on the free tier let us validate our business model before committing to a paid plan. When we were ready to scale, upgrading was seamless — no data migration, no downtime. The Business plan gives us everything we need for our current 150-card program.",
  },
  {
    name: "Amara Okafor",
    role: "Finance Manager",
    company: "Globex Trading",
    rating: 4,
    text: "The physical card program is excellent. Custom-branded cards arrived within 5 business days, and the activation process was smooth. Our team uses them for client entertainment and travel expenses. Would love to see even more card design customization options.",
  },
  {
    name: "David Kim",
    role: "CTO",
    company: "PayStream",
    rating: 5,
    text: "What sets GlobalCard apart is their developer experience. The sandbox environment mirrors production perfectly, the error messages are clear, and their SDK handles edge cases we hadn't even considered. This is how fintech APIs should be built.",
  },
];

export default function ReviewsPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-background pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-primary tracking-[0.18em] uppercase">
              Reviews
            </span>
            <h1 className="text-4xl md:text-5xl font-black text-foreground tracking-tight mt-3 mb-4">
              Trusted by 1,000+ businesses
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              See what companies around the world are saying about GlobalCard.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reviews.map((review) => (
              <div
                key={review.name}
                className="bg-card border border-border rounded-2xl p-8"
              >
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${i < review.rating ? "text-yellow-500 fill-yellow-500" : "text-border"}`}
                    />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  &ldquo;{review.text}&rdquo;
                </p>
                <div>
                  <p className="font-bold text-foreground text-sm">
                    {review.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {review.role}, {review.company}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* JSON-LD for reviews */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: "GlobalCard",
              description: "Premium card issuing infrastructure",
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: "4.8",
                reviewCount: reviews.length.toString(),
                bestRating: "5",
              },
              review: reviews.map((r) => ({
                "@type": "Review",
                author: { "@type": "Person", name: r.name },
                reviewRating: {
                  "@type": "Rating",
                  ratingValue: r.rating.toString(),
                  bestRating: "5",
                },
                reviewBody: r.text,
              })),
            }),
          }}
        />
      </main>
      <SiteFooter />
    </>
  );
}
