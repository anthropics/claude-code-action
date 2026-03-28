import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "GlobalCard privacy policy. How we collect, use, and protect your personal data under GDPR.",
};

export default function PrivacyPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-background pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-3xl">
          <h1 className="text-4xl font-black text-foreground tracking-tight mb-2">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            Last updated: March 2026
          </p>

          <div className="prose prose-neutral max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                1. Data Controller
              </h2>
              <p>
                The data controller for personal data processed through
                GlobalCard is NorwegianSpark SA, registered in Norway under
                organization number 834 984 172. You can contact us at{" "}
                <a
                  href="mailto:norwegianspark@gmail.com"
                  className="text-primary hover:underline"
                >
                  norwegianspark@gmail.com
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                2. Data We Collect
              </h2>
              <p>We collect the following categories of personal data:</p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>
                  <strong className="text-foreground">
                    Account information:
                  </strong>{" "}
                  name, email address, company name, and phone number provided
                  during registration.
                </li>
                <li>
                  <strong className="text-foreground">Usage data:</strong> pages
                  visited, features used, session duration, and interaction
                  patterns collected through analytics.
                </li>
                <li>
                  <strong className="text-foreground">Technical data:</strong>{" "}
                  IP address, browser type, device information, and operating
                  system.
                </li>
                <li>
                  <strong className="text-foreground">Cookies:</strong>{" "}
                  functional and analytical cookies as described in our Cookie
                  Policy.
                </li>
                <li>
                  <strong className="text-foreground">Payment data:</strong>{" "}
                  billing information processed securely through Stripe. We do
                  not store full payment card numbers.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                3. Purpose of Processing
              </h2>
              <p>We process your personal data for the following purposes:</p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>
                  <strong className="text-foreground">Service delivery:</strong>{" "}
                  to provide, maintain, and improve our card issuing platform.
                </li>
                <li>
                  <strong className="text-foreground">Analytics:</strong> to
                  understand usage patterns and improve user experience.
                </li>
                <li>
                  <strong className="text-foreground">Communication:</strong> to
                  send service updates, security alerts, and account
                  notifications.
                </li>
                <li>
                  <strong className="text-foreground">Marketing:</strong> to
                  send promotional materials only with your explicit opt-in
                  consent.
                </li>
                <li>
                  <strong className="text-foreground">Legal compliance:</strong>{" "}
                  to meet regulatory obligations in the financial services
                  sector.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                4. Legal Basis
              </h2>
              <p>
                We process your data based on: (a) contractual necessity for
                service delivery, (b) legitimate interest for analytics and
                security, (c) explicit consent for marketing, and (d) legal
                obligation for regulatory compliance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                5. Third-Party Processors
              </h2>
              <p>
                We share data with the following trusted third-party processors:
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>
                  <strong className="text-foreground">Stripe</strong> — payment
                  processing (PCI DSS Level 1 compliant)
                </li>
                <li>
                  <strong className="text-foreground">Vercel</strong> — website
                  hosting and delivery
                </li>
                <li>
                  <strong className="text-foreground">Resend</strong> —
                  transactional email delivery
                </li>
              </ul>
              <p className="mt-2">
                All third-party processors are bound by data processing
                agreements and process data only on our instructions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                6. Your Rights
              </h2>
              <p>Under the GDPR, you have the right to:</p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>
                  <strong className="text-foreground">Access</strong> — request
                  a copy of your personal data.
                </li>
                <li>
                  <strong className="text-foreground">Rectification</strong> —
                  correct inaccurate or incomplete data.
                </li>
                <li>
                  <strong className="text-foreground">Erasure</strong> — request
                  deletion of your data (&quot;right to be forgotten&quot;).
                </li>
                <li>
                  <strong className="text-foreground">Portability</strong> —
                  receive your data in a machine-readable format.
                </li>
                <li>
                  <strong className="text-foreground">Objection</strong> —
                  object to processing based on legitimate interest.
                </li>
                <li>
                  <strong className="text-foreground">Restriction</strong> —
                  request limitation of processing.
                </li>
                <li>
                  <strong className="text-foreground">Withdraw consent</strong>{" "}
                  — withdraw marketing consent at any time.
                </li>
              </ul>
              <p className="mt-2">
                To exercise any of these rights, contact us at{" "}
                <a
                  href="mailto:norwegianspark@gmail.com"
                  className="text-primary hover:underline"
                >
                  norwegianspark@gmail.com
                </a>
                . We will respond within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                7. Data Retention
              </h2>
              <p>
                We retain your account data for the duration of your active
                subscription. Upon account closure, all personal data is deleted
                within 30 days, except where retention is required by law (e.g.,
                financial records retained for 5 years under Norwegian
                accounting regulations).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                8. Data Security
              </h2>
              <p>
                We implement industry-standard security measures including
                encryption at rest and in transit, access controls, regular
                security audits, and PCI DSS Level 1 compliant infrastructure
                for card data handling.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                9. International Transfers
              </h2>
              <p>
                Your data may be processed outside the EEA. Where this occurs,
                we ensure adequate safeguards through Standard Contractual
                Clauses (SCCs) approved by the European Commission.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                10. Governing Law
              </h2>
              <p>
                This privacy policy is governed by Norwegian law and the General
                Data Protection Regulation (GDPR). You have the right to lodge a
                complaint with the Norwegian Data Protection Authority
                (Datatilsynet).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                11. Contact
              </h2>
              <p>
                For any questions regarding this privacy policy or your personal
                data, contact:
              </p>
              <p className="mt-2">
                NorwegianSpark SA
                <br />
                Org. 834 984 172
                <br />
                Email:{" "}
                <a
                  href="mailto:norwegianspark@gmail.com"
                  className="text-primary hover:underline"
                >
                  norwegianspark@gmail.com
                </a>
                <br />
                Phone: +47 99 73 74 67
              </p>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
