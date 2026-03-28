"use client";

import { Check } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Get started with virtual cards",
    features: [
      "5 virtual cards",
      "1 team member",
      "Basic analytics",
      "Email support",
      "API access",
    ],
    cta: "Start Free",
    highlight: false,
  },
  {
    name: "Growth",
    price: "$49",
    period: "/mo",
    description: "For growing businesses",
    features: [
      "50 virtual cards",
      "5 team members",
      "Advanced analytics",
      "Priority support",
      "Webhooks",
      "Custom branding",
    ],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Business",
    price: "$149",
    period: "/mo",
    description: "For scaling operations",
    features: [
      "500 virtual cards",
      "25 physical cards",
      "15 team members",
      "Full analytics suite",
      "Phone support",
      "Custom rules engine",
      "Multi-currency",
    ],
    cta: "Get Started",
    highlight: true,
  },
  {
    name: "Scale",
    price: "$349",
    period: "/mo",
    description: "High-volume card programs",
    features: [
      "2,000 virtual cards",
      "100 physical cards",
      "50 team members",
      "Dedicated account manager",
      "SLA guarantee",
      "Custom integrations",
      "Bulk issuance",
    ],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$599",
    period: "/mo",
    description: "Professional card issuing",
    features: [
      "5,000 virtual cards",
      "500 physical cards",
      "Unlimited team members",
      "White-label options",
      "Advanced fraud rules",
      "Real-time alerts",
      "Custom card designs",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
  {
    name: "Premium",
    price: "$999",
    period: "/mo",
    description: "Full-featured platform",
    features: [
      "15,000 virtual cards",
      "2,000 physical cards",
      "Unlimited team members",
      "Full white-label",
      "Dedicated infrastructure",
      "24/7 phone support",
      "Compliance dashboard",
      "Multi-region",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
  {
    name: "Ultra",
    price: "$1,499",
    period: "/mo",
    description: "Large-scale operations",
    features: [
      "50,000 virtual cards",
      "10,000 physical cards",
      "Unlimited everything",
      "Custom SLAs",
      "On-premise option",
      "Regulatory support",
      "Dedicated engineer",
      "Priority roadmap input",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
  {
    name: "Enterprise",
    price: "$2,499",
    period: "/mo",
    description: "Unlimited, custom solutions",
    features: [
      "Unlimited cards",
      "Unlimited everything",
      "Custom contract",
      "Dedicated team",
      "On-site onboarding",
      "Custom compliance",
      "Full API customization",
      "Volume discounts",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="py-20">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-6 flex flex-col ${
                plan.highlight
                  ? "border-primary bg-primary/5 ring-2 ring-primary shadow-lg relative"
                  : "border-border bg-card"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-full">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
              <div className="mt-3 mb-1">
                <span className="text-3xl font-black text-foreground">
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="text-sm text-muted-foreground">
                    {plan.period}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                {plan.description}
              </p>
              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.cta === "Contact Sales" ? "/contact" : "/contact"}
                className={`block text-center font-bold text-sm rounded-full px-6 py-3 transition-opacity hover:opacity-90 ${
                  plan.highlight
                    ? "bg-primary text-primary-foreground"
                    : "bg-foreground text-background"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
