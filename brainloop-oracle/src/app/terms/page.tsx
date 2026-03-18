import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | BrainLoop Oracle",
  description: "Terms of Service for BrainLoop Oracle by NorwegianSpark SA.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-mystic-bg">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link
          href="/"
          className="text-mystic-purple-light hover:text-mystic-gold-light transition-colors text-sm mb-8 inline-block"
        >
          &larr; Back to Oracle
        </Link>

        <h1 className="text-3xl font-bold text-mystic-gold-light mb-2">
          Terms of Service
        </h1>
        <p className="text-gray-500 text-sm mb-10">
          Last updated: March 18, 2026
        </p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing and using BrainLoop Oracle at oracle.brainloop.games
              (&quot;the Service&quot;), you agree to be bound by these Terms of Service. The
              Service is operated by NorwegianSpark SA, organization number 834 984 172
              (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). If you do not agree to these terms, please do
              not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              2. Description of Service
            </h2>
            <p>
              BrainLoop Oracle is an entertainment application that provides mystical and
              poetic responses to user questions. The Service is designed purely for
              entertainment and creative inspiration purposes. All oracle responses are
              pre-written fictional content and should not be interpreted as genuine
              divination, professional advice, or factual predictions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              3. Entertainment Disclaimer
            </h2>
            <p className="mb-3">
              <strong className="text-mystic-gold">
                The oracle responses provided by this Service are entirely fictional and
                generated for entertainment purposes only.
              </strong>{" "}
              They do not constitute:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>Professional advice of any kind (medical, legal, financial, psychological)</li>
              <li>Genuine predictions or divination</li>
              <li>Factual statements or guarantees</li>
              <li>Recommendations for specific actions or decisions</li>
            </ul>
            <p className="mt-3">
              You should not rely on oracle responses for making important life decisions.
              If you need professional guidance, please consult a qualified professional.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              4. User Conduct
            </h2>
            <p className="mb-3">When using the Service, you agree not to:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>Use the Service for any unlawful purpose</li>
              <li>Attempt to interfere with or disrupt the Service</li>
              <li>Attempt to access the Service through unauthorized means</li>
              <li>Use automated systems to send an excessive number of requests</li>
              <li>Submit content that is harmful, threatening, or abusive</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              5. Intellectual Property
            </h2>
            <p>
              All content, design, and code of BrainLoop Oracle are the property of
              NorwegianSpark SA and are protected by applicable intellectual property
              laws. You may not reproduce, distribute, modify, or create derivative works
              from any part of the Service without our prior written consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              6. Availability
            </h2>
            <p>
              We strive to keep the Service available at all times but do not guarantee
              uninterrupted access. We reserve the right to modify, suspend, or
              discontinue the Service at any time without prior notice. We shall not be
              liable for any modification, suspension, or discontinuation of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              7. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by applicable law, NorwegianSpark SA shall
              not be liable for any indirect, incidental, special, consequential, or
              punitive damages resulting from your use of or inability to use the Service.
              The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of
              any kind, either express or implied.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              8. Privacy
            </h2>
            <p>
              Your use of the Service is also governed by our{" "}
              <Link
                href="/privacy"
                className="text-mystic-purple-light hover:text-mystic-gold-light transition-colors underline"
              >
                Privacy Policy
              </Link>
              , which is incorporated into these Terms by reference.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              9. Governing Law
            </h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws
              of Norway. Any disputes arising from these Terms or your use of the Service
              shall be subject to the exclusive jurisdiction of the courts of Norway.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              10. Changes to Terms
            </h2>
            <p>
              We reserve the right to modify these Terms at any time. Changes will be
              effective immediately upon posting to this page. Your continued use of the
              Service after any changes constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              11. Contact Us
            </h2>
            <p>
              For questions about these Terms of Service, please contact us:
            </p>
            <div className="mt-3 p-4 rounded-lg border border-mystic-border bg-mystic-surface/50 text-gray-400 space-y-1">
              <p><strong className="text-gray-300">NorwegianSpark SA</strong></p>
              <p>Organization number: 834 984 172</p>
              <p>
                Email:{" "}
                <a
                  href="mailto:norwegianspark@gmail.com"
                  className="text-mystic-purple-light hover:text-mystic-gold-light transition-colors"
                >
                  norwegianspark@gmail.com
                </a>
              </p>
              <p>
                Phone:{" "}
                <a
                  href="tel:+4799737467"
                  className="text-mystic-purple-light hover:text-mystic-gold-light transition-colors"
                >
                  +47 99 73 74 67
                </a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
