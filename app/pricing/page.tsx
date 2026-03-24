"use client";

import { useState } from "react";
import Link from "next/link";

const plans = [
  {
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    description: "Perfect for getting started",
    features: [
      { name: "Page analyses per month", free: "10", pro: "1,000" },
      { name: "Basic SEO audit", free: true, pro: true },
      { name: "Performance score", free: true, pro: true },
      { name: "Mobile responsiveness check", free: true, pro: true },
      { name: "Advanced SEO recommendations", free: false, pro: true },
      { name: "Competitor comparison", free: false, pro: true },
      { name: "API access", free: false, pro: true },
      { name: "Custom reports & exports", free: false, pro: true },
      { name: "Webhook integrations", free: false, pro: true },
      { name: "Priority email support", free: false, pro: true },
    ],
    cta: "Get Started Free",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Pro",
    monthlyPrice: 29,
    annualPrice: 290,
    description: "For teams and professionals",
    cta: "Upgrade to Pro",
    href: "/signup?plan=pro",
    highlighted: true,
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  const features = [
    { name: "Page analyses per month", free: "10", pro: "1,000" },
    { name: "Basic SEO audit", free: true, pro: true },
    { name: "Performance score", free: true, pro: true },
    { name: "Mobile responsiveness check", free: true, pro: true },
    { name: "Advanced SEO recommendations", free: false, pro: true },
    { name: "Competitor comparison", free: false, pro: true },
    { name: "API access", free: false, pro: true },
    { name: "Custom reports & exports", free: false, pro: true },
    { name: "Webhook integrations", free: false, pro: true },
    { name: "Priority email support", free: false, pro: true },
  ];

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
              Annual <span className="text-xs text-brand-400">(Save ~17%)</span>
            </span>
          </div>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
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

        <div className="mx-auto mt-24 max-w-4xl">
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
                      {typeof feature.free === "string" ? (
                        <span className="text-gray-300">{feature.free}</span>
                      ) : feature.free ? (
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
                      ) : (
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
                      )}
                    </td>
                    <td className="px-6 py-4 text-center text-sm">
                      {typeof feature.pro === "string" ? (
                        <span className="text-gray-300">{feature.pro}</span>
                      ) : feature.pro ? (
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
                      ) : (
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
                      )}
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
