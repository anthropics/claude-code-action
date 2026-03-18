import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Globe, Layers, Shield, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description:
    "About GlobalCard and NorwegianSpark SA. Democratizing card issuing infrastructure for businesses worldwide.",
};

const stats = [
  { value: "25+", label: "Countries" },
  { value: "8", label: "Plan Tiers" },
  { value: "1,000+", label: "Businesses" },
  { value: "99.9%", label: "Uptime" },
];

const values = [
  {
    icon: Zap,
    title: "Speed",
    description:
      "Ship fast, iterate faster. We believe businesses should launch card programs in days, not months.",
  },
  {
    icon: Shield,
    title: "Transparency",
    description:
      "No hidden fees, no surprise charges. What you see is what you pay. Open pricing, open communication.",
  },
  {
    icon: Layers,
    title: "Compliance",
    description:
      "Built-in compliance tools for every jurisdiction. We handle the regulatory complexity so you can focus on growth.",
  },
  {
    icon: Globe,
    title: "Global-First",
    description:
      "Designed from day one for international markets. Multi-currency, multi-region, multi-language ready.",
  },
];

export default function AboutPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-background pt-24 pb-16">
        {/* Hero */}
        <section className="container mx-auto px-6 max-w-4xl text-center mb-20">
          <span className="text-xs font-bold text-primary tracking-[0.18em] uppercase">
            About Us
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-foreground tracking-tight mt-3 mb-6">
            Democratizing card issuing infrastructure for businesses worldwide
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            GlobalCard is built by NorwegianSpark SA, a Norwegian fintech
            company on a mission to make card issuing accessible to every
            business — from early-stage startups to global enterprises.
          </p>
        </section>

        {/* Stats */}
        <section className="container mx-auto px-6 max-w-4xl mb-20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="bg-card border border-border rounded-2xl p-6 text-center"
              >
                <p className="text-3xl font-black text-primary">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Story */}
        <section className="container mx-auto px-6 max-w-3xl mb-20">
          <h2 className="text-2xl font-black text-foreground mb-4">
            Our Story
          </h2>
          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>
              Founded in Norway, NorwegianSpark SA set out to solve a problem we
              experienced firsthand: launching a card program was too complex,
              too expensive, and too slow. Traditional card issuing required
              months of integration work, large upfront investments, and
              navigating a maze of compliance requirements across different
              jurisdictions.
            </p>
            <p>
              We built GlobalCard to change that. Our platform abstracts away
              the complexity of card issuing, providing businesses with a single
              API and dashboard to issue virtual and physical cards in over 25
              countries. Whether you need 5 cards or 50,000, our infrastructure
              scales with you.
            </p>
            <p>
              Today, over 1,000 businesses trust GlobalCard to power their card
              programs — from expense management startups to multinational
              corporations managing corporate spending across borders.
            </p>
          </div>
        </section>

        {/* Team */}
        <section className="bg-muted/50 py-20 mb-20">
          <div className="container mx-auto px-6 max-w-3xl text-center">
            <h2 className="text-2xl font-black text-foreground mb-4">
              Built by a small team with big fintech ambitions
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl mx-auto">
              We&apos;re a lean, remote-first team of engineers, designers, and
              fintech operators spread across Norway and Europe. We believe the
              best products are built by small, focused teams with deep domain
              expertise and a relentless focus on developer experience.
            </p>
          </div>
        </section>

        {/* Values */}
        <section className="container mx-auto px-6 max-w-4xl mb-20">
          <h2 className="text-2xl font-black text-foreground text-center mb-10">
            Our Values
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {values.map((value) => (
              <div key={value.title} className="flex gap-4">
                <value.icon className="w-8 h-8 text-primary shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-bold text-foreground mb-1">
                    {value.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {value.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Contact & CTA */}
        <section className="container mx-auto px-6 max-w-3xl text-center mb-10">
          <div className="bg-primary rounded-2xl p-10">
            <h2 className="text-2xl font-black text-primary-foreground mb-3">
              Ready to get started?
            </h2>
            <p className="text-primary-foreground/70 mb-6">
              Join 1,000+ businesses issuing cards with GlobalCard.
            </p>
            <Link
              href="/pricing"
              className="inline-block bg-white text-primary font-bold rounded-full px-8 py-3.5 hover:opacity-90 transition-opacity"
            >
              Get Started
            </Link>
          </div>
        </section>

        {/* Company info */}
        <section className="container mx-auto px-6 max-w-3xl text-center text-xs text-muted-foreground space-y-1">
          <p>NorwegianSpark SA | Org. 834 984 172</p>
          <p>norwegianspark@gmail.com | +47 99 73 74 67</p>
          <p>Norway — serving global markets</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
