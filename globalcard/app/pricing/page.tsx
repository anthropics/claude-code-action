import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { PricingSection } from "@/components/pricing-section";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Choose a GlobalCard plan. From free starter to enterprise. Virtual and physical card issuing across 25 countries.",
};

export default function PricingPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-background pt-24">
        <div className="container mx-auto px-6 text-center mb-4">
          <span className="text-xs font-bold text-primary tracking-[0.18em] uppercase">
            Transparent Pricing
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-foreground mt-3 mb-4 tracking-tight">
            Plans for every stage
          </h1>
          <p className="text-base text-muted-foreground max-w-xl mx-auto">
            Start free. Scale as you grow. No hidden fees. No setup costs.
          </p>
        </div>
        <PricingSection />
      </main>
      <SiteFooter />
    </>
  );
}
