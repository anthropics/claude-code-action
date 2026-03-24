import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  }
  stripeInstance = new Stripe(key, { apiVersion: "2023-10-16" });
  return stripeInstance;
}

export const PLANS = {
  free: {
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    analysesPerMonth: 10,
    features: [
      "10 page analyses per month",
      "Basic SEO audit",
      "Performance score",
      "Mobile responsiveness check",
      "Community support",
    ],
  },
  pro: {
    name: "Pro",
    monthlyPrice: 29,
    annualPrice: 290,
    analysesPerMonth: 1000,
    features: [
      "1,000 page analyses per month",
      "Advanced SEO audit with recommendations",
      "Full performance breakdown",
      "Competitor comparison",
      "API access",
      "Custom reports & exports",
      "Priority email support",
      "Webhook integrations",
    ],
  },
} as const;
