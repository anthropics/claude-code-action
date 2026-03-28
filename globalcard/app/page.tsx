import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { PricingSection } from "@/components/pricing-section";
import { CreditCard, Globe, Shield, Zap, BarChart3, Users } from "lucide-react";

const features = [
  {
    icon: CreditCard,
    title: "Virtual & Physical Cards",
    description:
      "Issue both virtual and physical cards instantly. Customize designs, set spending limits, and manage cards in real time.",
  },
  {
    icon: Globe,
    title: "25+ Countries",
    description:
      "Launch card programs in over 25 countries with local compliance handled for you. One platform, global reach.",
  },
  {
    icon: Shield,
    title: "Bank-Grade Security",
    description:
      "PCI DSS Level 1 compliant infrastructure with tokenization, 3D Secure, and real-time fraud monitoring.",
  },
  {
    icon: Zap,
    title: "Instant Issuance",
    description:
      "Issue virtual cards in milliseconds via API. Physical cards ship within 3-5 business days worldwide.",
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    description:
      "Track spending, monitor transactions, and generate reports with our comprehensive analytics dashboard.",
  },
  {
    icon: Users,
    title: "Team Management",
    description:
      "Role-based access controls, approval workflows, and audit trails for complete team governance.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main>
        {/* Hero */}
        <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-background pt-16">
          <div className="container mx-auto px-6 text-center">
            <span className="inline-block text-xs font-bold text-primary tracking-[0.18em] uppercase mb-6">
              Card Issuing Infrastructure
            </span>
            <h1 className="text-5xl md:text-7xl font-black text-foreground tracking-tight leading-[1.1] mb-6 max-w-4xl mx-auto">
              Launch your card program in{" "}
              <span className="text-primary">days, not months</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Issue virtual and physical cards across 25+ countries. From
              startup to enterprise — GlobalCard gives you the infrastructure to
              build, scale, and manage card programs with ease.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/pricing"
                className="bg-primary text-primary-foreground font-bold rounded-full px-8 py-4 text-base hover:opacity-90 transition-opacity"
              >
                Get Started Free
              </Link>
              <Link
                href="/contact"
                className="border border-border font-bold rounded-full px-8 py-4 text-base text-foreground hover:bg-muted transition-colors"
              >
                Contact Sales
              </Link>
            </div>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
              <span>25+ Countries</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>8 Plan Tiers</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>1000+ Businesses</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>PCI DSS Level 1</span>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="products" className="py-24 bg-muted/50">
          <div className="container mx-auto px-6">
            <div className="text-center mb-16">
              <span className="text-xs font-bold text-primary tracking-[0.18em] uppercase">
                Platform Features
              </span>
              <h2 className="text-3xl md:text-4xl font-black text-foreground mt-3 tracking-tight">
                Everything you need to issue cards
              </h2>
              <p className="text-muted-foreground mt-4 max-w-xl mx-auto">
                A complete platform for card program management — from issuance
                to reconciliation.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="bg-card border border-border rounded-2xl p-8 hover:shadow-lg transition-shadow"
                >
                  <feature.icon className="w-10 h-10 text-primary mb-4" />
                  <h3 className="text-lg font-bold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-24">
          <div className="container mx-auto px-6 text-center mb-4">
            <span className="text-xs font-bold text-primary tracking-[0.18em] uppercase">
              Transparent Pricing
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-foreground mt-3 tracking-tight">
              Plans for every stage
            </h2>
            <p className="text-muted-foreground mt-4 max-w-xl mx-auto">
              Start free. Scale as you grow. No hidden fees. No setup costs.
            </p>
          </div>
          <PricingSection />
        </section>

        {/* CTA */}
        <section className="py-24 bg-primary">
          <div className="container mx-auto px-6 text-center">
            <h2 className="text-3xl md:text-4xl font-black text-primary-foreground tracking-tight mb-4">
              Ready to launch your card program?
            </h2>
            <p className="text-primary-foreground/70 max-w-xl mx-auto mb-8">
              Join 1000+ businesses already using GlobalCard to issue and manage
              cards worldwide.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/pricing"
                className="bg-white text-primary font-bold rounded-full px-8 py-4 text-base hover:opacity-90 transition-opacity"
              >
                Get Started Free
              </Link>
              <Link
                href="/contact"
                className="border border-white/30 text-white font-bold rounded-full px-8 py-4 text-base hover:bg-white/10 transition-colors"
              >
                Talk to Sales
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
