import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | BrainLoop Tarot",
  description: "Terms of Service for BrainLoop Tarot by NorwegianSpark SA.",
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-mystic-bg text-slate-300">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link
          href="/"
          className="text-mystic-violet hover:text-mystic-accent transition-colors text-sm mb-8 inline-block"
        >
          &larr; Back to BrainLoop Tarot
        </Link>

        <h1 className="text-3xl font-bold text-mystic-gold-light mb-2">
          Terms of Service
        </h1>
        <p className="text-mystic-accent/50 text-sm mb-8">
          Last updated: January 1, 2025
        </p>

        <div className="space-y-6 text-sm leading-relaxed text-slate-400">
          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing and using BrainLoop Tarot (tarot.brainloop.games),
              operated by NorwegianSpark SA (org. number 834 984 172), you
              agree to be bound by these Terms of Service. If you do not agree
              to these terms, please do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              2. Description of Service
            </h2>
            <p>
              BrainLoop Tarot provides digital tarot card readings for
              entertainment purposes only. The readings are generated using
              randomized card selection and pre-written interpretive templates.
              The service does not provide professional advice of any kind,
              including but not limited to medical, legal, financial, or
              psychological advice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              3. Entertainment Disclaimer
            </h2>
            <p>
              All tarot readings provided by this service are for entertainment
              purposes only. The readings should not be taken as factual
              predictions, professional guidance, or substitutes for
              professional consultation. NorwegianSpark SA makes no claims
              regarding the accuracy or predictive ability of the readings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              4. Intellectual Property
            </h2>
            <p>
              All content on BrainLoop Tarot, including but not limited to text,
              graphics, code, designs, and the overall look and feel of the
              service, is the property of NorwegianSpark SA and is protected
              by applicable intellectual property laws. You may not reproduce,
              distribute, or create derivative works from this content without
              our express written permission.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              5. User Conduct
            </h2>
            <p>You agree not to:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>
                Use the service for any unlawful purpose or in violation of
                any applicable laws
              </li>
              <li>
                Attempt to gain unauthorized access to any part of the service
                or its related systems
              </li>
              <li>
                Interfere with or disrupt the service or servers connected to
                the service
              </li>
              <li>
                Use automated means to access the service without our express
                permission
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              6. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by Norwegian law, NorwegianSpark
              SA shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages, or any loss of profits or
              revenues, whether incurred directly or indirectly, or any loss
              of data, use, goodwill, or other intangible losses resulting
              from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              7. Availability
            </h2>
            <p>
              We strive to keep BrainLoop Tarot available at all times but
              make no guarantees regarding uptime or availability. We reserve
              the right to modify, suspend, or discontinue the service at any
              time without notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              8. Governing Law
            </h2>
            <p>
              These Terms of Service shall be governed by and construed in
              accordance with the laws of Norway. Any disputes arising from
              these terms shall be subject to the exclusive jurisdiction of
              the Norwegian courts.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              9. Changes to Terms
            </h2>
            <p>
              We reserve the right to modify these Terms of Service at any
              time. Changes will be effective immediately upon posting to this
              page. Your continued use of the service after changes are posted
              constitutes your acceptance of the revised terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              10. Contact Us
            </h2>
            <p>
              If you have any questions about these Terms of Service, please
              contact us:
            </p>
            <ul className="mt-2 space-y-1">
              <li>
                <strong>Company:</strong> NorwegianSpark SA
              </li>
              <li>
                <strong>Org. number:</strong> 834 984 172
              </li>
              <li>
                <strong>Email:</strong>{" "}
                <a
                  href="mailto:norwegianspark@gmail.com"
                  className="text-mystic-violet hover:text-mystic-accent transition-colors"
                >
                  norwegianspark@gmail.com
                </a>
              </li>
              <li>
                <strong>Phone:</strong>{" "}
                <a
                  href="tel:+4799737467"
                  className="text-mystic-violet hover:text-mystic-accent transition-colors"
                >
                  +47 99 73 74 67
                </a>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
