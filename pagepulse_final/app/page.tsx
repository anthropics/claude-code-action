import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "PagePulse — Web Analysis & SEO Audits",
  description:
    "Analyze any webpage instantly. Get SEO audits, performance scores, accessibility reports, and actionable recommendations.",
  openGraph: {
    title: "PagePulse — Web Analysis & SEO Audits",
    description:
      "Analyze any webpage instantly. Get SEO audits, performance scores, and actionable recommendations.",
    url: "https://pagepulse.app",
  },
};

export default function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-balance text-5xl font-bold tracking-tight text-white sm:text-7xl">
            Analyze any webpage{" "}
            <span className="bg-gradient-to-r from-brand-400 to-brand-600 bg-clip-text text-transparent">
              instantly
            </span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-400">
            Get instant SEO audits, performance scores, accessibility reports,
            and actionable recommendations to help you build better websites.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
            >
              Start Free
            </Link>
            <Link
              href="/api-docs"
              className="rounded-lg border border-gray-700 px-6 py-3 text-sm font-semibold text-gray-300 hover:bg-gray-900"
            >
              View API Docs
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-gray-800 px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-3xl font-bold text-white">
            Everything you need to optimize your web presence
          </h2>
          <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                title: "SEO Analysis",
                description:
                  "Comprehensive SEO audit covering meta tags, headings, structured data, and keyword optimization.",
                icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
              },
              {
                title: "Performance Scoring",
                description:
                  "Core Web Vitals analysis including LCP, FID, CLS metrics with specific improvement suggestions.",
                icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
              },
              {
                title: "Accessibility Audit",
                description:
                  "WCAG compliance checks, contrast ratios, ARIA usage, and screen reader compatibility analysis.",
                icon: "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-gray-800 bg-gray-900 p-8"
              >
                <div className="mb-4 inline-flex rounded-lg bg-brand-600/10 p-3">
                  <svg
                    className="h-6 w-6 text-brand-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={feature.icon}
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-gray-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-gray-800 px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-white">
            Ready to optimize your website?
          </h2>
          <p className="mt-4 text-gray-400">
            Start with 2 free scans. No credit card required.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-lg bg-brand-600 px-8 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Get Started for Free
          </Link>
        </div>
      </section>
    </div>
  );
}
