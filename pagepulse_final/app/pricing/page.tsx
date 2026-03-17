"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FREE_LIMIT,
  PRO_LIMIT,
  PRO_MONTHLY_PRICE,
  PRO_ANNUAL_PRICE,
  ENTERPRISE_MONTHLY_PRICE,
  ENTERPRISE_ANNUAL_PRICE,
} from "@/lib/quotas";

const plans = [
  {
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    description: "Try PagePulse with 2 free scans",
    cta: "Get Started Free",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Pro",
    monthlyPrice: PRO_MONTHLY_PRICE,
    annualPrice: PRO_ANNUAL_PRICE,
    description: "For teams and professionals",
    cta: "Upgrade to Pro",
    href: "/signup?plan=pro",
    highlighted: true,
  },
  {
    name: "Enterprise",
    monthlyPrice: ENTERPRISE_MONTHLY_PRICE,
    annualPrice: ENTERPRISE_ANNUAL_PRICE,
    description: "Unlimited scans for large organizations",
    cta: "Contact Sales",
    href: "/signup?plan=enterprise",
    highlighted: false,
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  const features = [
    {
      name: "Page analyses per month",
      free: String(FREE_LIMIT),
      pro: PRO_LIMIT.toLocaleString(),
      enterprise: "Unlimited",
    },
    { name: "Basic SEO audit", free: true, pro: true, enterprise: true },
    { name: "Performance score", free: true, pro: true, enterprise: true },
    {
      name: "Mobile responsiveness check",
      free: true,
      pro: true,
      enterprise: true,
    },
    {
      name: "Advanced SEO recommendations",
      free: false,
      pro: true,
      enterprise: true,
    },
    {
      name: "Competitor comparison",
      free: false,
      pro: true,
      enterprise: true,
    },
    { name: "API access", free: false, pro: true, enterprise: true },
    {
      name: "Custom reports & exports",
      free: false,
      pro: true,
      enterprise: true,
    },
    {
      name: "Webhook integrations",
      free: false,
      pro: false,
      enterprise: true,
    },
    {
      name: "Priority email support",
      free: false,
      pro: true,
      enterprise: true,
    },
    {
      name: "Dedicated account manager",
      free: false,
      pro: false,
      enterprise: true,
    },
  ];

  type FeatureValue = string | boolean;

  function renderCell(value: FeatureValue) {
    if (typeof value === "string") {
      return <span className="text-gray-300">{value}</span>;
    }
    if (value) {
      return (
        <svg
          className="mx-auto h-5 w-5 text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      );
    }
    return (
      <svg
        className="mx-auto h-5 w-5 text-gray-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    );
  }

  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-gray-400">
            Start free, upgrade when you need more power.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <span
              className={`text-sm ${!annual ? "text-white" : "text-gray-400"}`}
            >
              Monthly
            </span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                annual ? "bg-brand-600" : "bg-gray-700"
              }`}
              role="switch"
              aria-checked={annual}
              aria-label="Toggle annual billing"
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  annual ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <span
              className={`text-sm ${annual ? "text-white" : "text-gray-400"}`}
            >
              Annual{" "}
              <span className="text-xs text-brand-400">(Save 2 months)</span>
            </span>
          </div>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
          {plans.map((plan) => {
            const price = annual ? plan.annualPrice : plan.monthlyPrice;
            const period = annual ? "/year" : "/month";
            return (
              <div
                key={plan.name}
                className={`rounded-2xl border p-8 ${
                  plan.highlighted
                    ? "border-brand-500 bg-gray-900 ring-1 ring-brand-500"
                    : "border-gray-800 bg-gray-900"
                }`}
              >
                {plan.highlighted && (
                  <span className="mb-4 inline-block rounded-full bg-brand-600/10 px-3 py-1 text-xs font-medium text-brand-400">
                    Most Popular
                  </span>
                )}
                <h2 className="text-2xl font-bold text-white">{plan.name}</h2>
                <p className="mt-1 text-sm text-gray-400">{plan.description}</p>
                <div className="mt-6">
                  <span className="text-4xl font-bold text-white">
                    ${price}
                  </span>
                  {price > 0 && <span className="text-gray-400">{period}</span>}
                </div>
                <Link
                  href={plan.href}
                  className={`mt-8 block rounded-lg px-4 py-3 text-center text-sm font-semibold ${
                    plan.highlighted
                      ? "bg-brand-600 text-white hover:bg-brand-700"
                      : "border border-gray-700 text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mx-auto mt-24 max-w-5xl">
          <h2 className="mb-8 text-center text-2xl font-bold text-white">
            Feature Comparison
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-800">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900">
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">
                    Feature
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-gray-400">
                    Free
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-brand-400">
                    Pro
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-gray-400">
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map((feature, i) => (
                  <tr
                    key={feature.name}
                    className={
                      i < features.length - 1 ? "border-b border-gray-800" : ""
                    }
                  >
                    <td className="px-6 py-4 text-sm text-gray-300">
                      {feature.name}
                    </td>
                    <td className="px-6 py-4 text-center text-sm">
                      {renderCell(feature.free)}
                    </td>
                    <td className="px-6 py-4 text-center text-sm">
                      {renderCell(feature.pro)}
                    </td>
                    <td className="px-6 py-4 text-center text-sm">
                      {renderCell(feature.enterprise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
