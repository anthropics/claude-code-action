import { Brain, Mail, Phone, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - BrainLoop Focus",
  description: "Privacy Policy for BrainLoop Focus by NorwegianSpark SA.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/5 bg-dark-800/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-white/40 transition-colors hover:text-white/70"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-accent" />
            <span className="text-sm font-semibold">BrainLoop Focus</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold">Privacy Policy</h1>
        <p className="mb-8 text-sm text-white/40">
          Last updated: March 18, 2026
        </p>

        <div className="space-y-8 text-white/70">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              1. Introduction
            </h2>
            <p>
              NorwegianSpark SA (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;), organization number 834 984
              172, operates BrainLoop Focus at focus.brainloop.games. This
              Privacy Policy explains how we handle information when you use our
              productivity application.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              2. Information We Collect
            </h2>
            <p>
              BrainLoop Focus is designed with privacy in mind. All your data,
              including tasks, timer sessions, and preferences, is stored locally
              on your device using browser localStorage. We do not collect,
              transmit, or store any personal data on our servers.
            </p>
            <ul className="mt-3 list-inside list-disc space-y-1 text-white/60">
              <li>Task data (names, priorities, completion status)</li>
              <li>Session history (focus session counts)</li>
              <li>Timer preferences</li>
            </ul>
            <p className="mt-3">
              All of the above is stored exclusively in your browser&apos;s
              localStorage and never leaves your device.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              3. Cookies and Tracking
            </h2>
            <p>
              We do not use cookies, analytics trackers, or any third-party
              tracking services. We do not use advertising pixels or social media
              tracking scripts.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              4. Data Storage and Security
            </h2>
            <p>
              Since all data is stored locally on your device, you have full
              control over your information. You can clear your data at any time
              by clearing your browser&apos;s localStorage. We implement security
              headers to protect against common web vulnerabilities.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              5. Third-Party Services
            </h2>
            <p>
              BrainLoop Focus uses Google Fonts (Inter) to render typography. This
              may result in your browser making requests to Google&apos;s servers to
              load font files. Please refer to Google&apos;s Privacy Policy for more
              information about how they handle data from font requests.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              6. Children&apos;s Privacy
            </h2>
            <p>
              Our application is suitable for users of all ages. Since we do not
              collect any personal data, there are no specific concerns regarding
              children&apos;s privacy.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              7. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. Any changes
              will be posted on this page with an updated revision date.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              8. Contact Us
            </h2>
            <p>
              If you have any questions about this Privacy Policy, please contact
              us:
            </p>
            <div className="mt-3 space-y-2 text-white/60">
              <p className="font-semibold text-white/70">NorwegianSpark SA</p>
              <p>Organization number: 834 984 172</p>
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <a
                  href="mailto:norwegianspark@gmail.com"
                  className="text-accent hover:underline"
                >
                  norwegianspark@gmail.com
                </a>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <a
                  href="tel:+4799737467"
                  className="text-accent hover:underline"
                >
                  +47 99 73 74 67
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
