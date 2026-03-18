import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | BrainLoop Tarot",
  description: "Privacy Policy for BrainLoop Tarot by NorwegianSpark SA.",
};

export default function PrivacyPolicy() {
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
          Privacy Policy
        </h1>
        <p className="text-mystic-accent/50 text-sm mb-8">
          Last updated: January 1, 2025
        </p>

        <div className="space-y-6 text-sm leading-relaxed text-slate-400">
          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              1. Introduction
            </h2>
            <p>
              NorwegianSpark SA (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;),
              organization number 834 984 172, operates BrainLoop Tarot
              (tarot.brainloop.games). We are committed to protecting your
              privacy and handling your data with transparency.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              2. Data We Collect
            </h2>
            <p>
              BrainLoop Tarot is designed to operate with minimal data
              collection. The tarot readings are generated entirely on the
              client side within your browser. We do not collect, store, or
              transmit your tarot reading results or any personal information
              you may associate with your readings.
            </p>
            <p className="mt-2">
              We may collect basic, anonymized usage analytics such as page
              views and general geographic region to help improve the service.
              No personally identifiable information is collected through
              analytics.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              3. Cookies
            </h2>
            <p>
              We may use essential cookies required for the functioning of the
              website. We do not use tracking cookies or third-party advertising
              cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              4. Third-Party Services
            </h2>
            <p>
              The website may use third-party hosting and content delivery
              services. These services may process limited technical data (such
              as IP addresses) as necessary for delivering the website to your
              browser, in accordance with their own privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              5. Data Security
            </h2>
            <p>
              We implement appropriate technical and organizational measures to
              protect any data we process. Since readings are generated locally
              in your browser, your tarot reading data never leaves your
              device.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              6. Your Rights
            </h2>
            <p>
              Under applicable data protection laws, including the Norwegian
              Personal Data Act and the GDPR, you have the right to access,
              rectify, or delete any personal data we may hold about you. Since
              we collect minimal data, there may be no personal data to provide
              upon request.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              7. Children&apos;s Privacy
            </h2>
            <p>
              BrainLoop Tarot is intended for users aged 13 and older. We do
              not knowingly collect personal information from children under
              the age of 13.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              8. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. Any changes
              will be posted on this page with an updated revision date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-mystic-accent mb-2">
              9. Contact Us
            </h2>
            <p>
              If you have any questions about this Privacy Policy, please
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
