import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "GlobalCard terms of service. Read our service agreement, subscription terms, and acceptable use policy.",
};

export default function TermsPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-background pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-3xl">
          <h1 className="text-4xl font-black text-foreground tracking-tight mb-2">
            Terms of Service
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            Last updated: March 2026
          </p>

          <div className="prose prose-neutral max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                1. Parties
              </h2>
              <p>
                These Terms of Service (&quot;Terms&quot;) constitute a legally
                binding agreement between you (&quot;Customer&quot;,
                &quot;you&quot;) and NorwegianSpark SA, a company registered in
                Norway under organization number 834 984 172
                (&quot;GlobalCard&quot;, &quot;we&quot;, &quot;us&quot;). By
                accessing or using our services, you agree to these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                2. Service Description
              </h2>
              <p>
                GlobalCard provides card issuing infrastructure enabling
                businesses to create, manage, and distribute virtual and
                physical payment cards. Our platform includes APIs for card
                issuance, transaction monitoring, spend controls, team
                management, analytics dashboards, and compliance tools.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                3. Account Registration
              </h2>
              <p>
                To use GlobalCard, you must create an account with accurate and
                complete information. You are responsible for maintaining the
                confidentiality of your account credentials and for all
                activities under your account. You must notify us immediately of
                any unauthorized use.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                4. Subscription & Billing
              </h2>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>
                  Subscriptions are billed monthly in advance on the anniversary
                  of your signup date.
                </li>
                <li>
                  All prices are in USD and exclude applicable taxes unless
                  stated otherwise.
                </li>
                <li>
                  You may upgrade or downgrade your plan at any time. Changes
                  take effect at the next billing cycle.
                </li>
                <li>
                  Cancellation requires 14 days written notice before the next
                  billing date. Email cancellations to norwegianspark@gmail.com.
                </li>
                <li>
                  No refunds are provided for partial billing periods, except
                  where required by applicable law.
                </li>
                <li>
                  We reserve the right to change pricing with 30 days advance
                  notice.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                5. Acceptable Use
              </h2>
              <p>You agree not to use GlobalCard for:</p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>
                  Any illegal activity, including money laundering, fraud, or
                  terrorist financing.
                </li>
                <li>
                  Circumventing financial regulations or sanctions in any
                  jurisdiction.
                </li>
                <li>
                  Issuing cards for personal use under a business account.
                </li>
                <li>
                  Reverse engineering, decompiling, or attempting to extract
                  source code from our platform.
                </li>
                <li>
                  Transmitting malware, viruses, or any harmful code through our
                  APIs.
                </li>
                <li>
                  Exceeding rate limits or abusing API access in a way that
                  degrades service for others.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                6. Compliance
              </h2>
              <p>
                You are responsible for ensuring your use of GlobalCard complies
                with all applicable laws and regulations in your jurisdiction,
                including but not limited to anti-money laundering (AML),
                know-your-customer (KYC), and payment services regulations.
                GlobalCard provides tools to assist with compliance but does not
                provide legal advice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                7. Limitation of Liability
              </h2>
              <p>
                GlobalCard is a technology platform and does not provide
                financial advice. To the maximum extent permitted by law: (a)
                our total liability is limited to the fees paid by you in the 12
                months preceding the claim; (b) we are not liable for indirect,
                incidental, special, consequential, or punitive damages; (c) we
                are not liable for loss of profits, data, business, or goodwill.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                8. Service Availability
              </h2>
              <p>
                We strive for 99.9% uptime but do not guarantee uninterrupted
                service. Planned maintenance windows will be communicated 48
                hours in advance. We are not liable for downtime caused by force
                majeure, third-party failures, or circumstances beyond our
                reasonable control.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                9. Intellectual Property
              </h2>
              <p>
                All intellectual property in the GlobalCard platform, including
                software, APIs, documentation, trademarks, and designs, remains
                the exclusive property of NorwegianSpark SA. Your subscription
                grants a limited, non-exclusive, non-transferable license to use
                the platform for your business purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                10. Data Protection
              </h2>
              <p>
                Our handling of personal data is governed by our{" "}
                <a href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </a>
                . By using our services, you acknowledge and agree to the data
                practices described therein.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                11. Termination
              </h2>
              <p>
                Either party may terminate this agreement with 14 days written
                notice. We may suspend or terminate your account immediately if
                you breach these Terms, engage in fraudulent activity, or if
                required by law or regulation. Upon termination, your access to
                the platform ceases and data is handled in accordance with our
                Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                12. Changes to Terms
              </h2>
              <p>
                We may update these Terms from time to time. Material changes
                will be communicated via email at least 30 days before they take
                effect. Continued use of the service after changes constitutes
                acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                13. Governing Law & Dispute Resolution
              </h2>
              <p>
                These Terms are governed by the laws of Norway. Any disputes
                arising from these Terms shall be resolved by the courts of
                Bergen, Norway. Before initiating legal proceedings, both
                parties agree to attempt resolution through good-faith
                negotiation.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                14. Contact
              </h2>
              <p>For questions about these Terms, contact:</p>
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
