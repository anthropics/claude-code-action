import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | BrainLoop Oracle",
  description: "Privacy Policy for BrainLoop Oracle by NorwegianSpark SA.",
};

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="text-gray-500 text-sm mb-10">
          Last updated: March 18, 2026
        </p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              1. Introduction
            </h2>
            <p>
              NorwegianSpark SA (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), organization number
              834 984 172, operates BrainLoop Oracle at oracle.brainloop.games. This
              Privacy Policy explains how we collect, use, and protect your information
              when you use our service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              2. Information We Collect
            </h2>
            <p className="mb-3">
              We collect minimal information necessary to provide our service:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>
                <strong className="text-gray-300">Questions submitted:</strong> The text
                you type into the oracle interface is sent to our server to generate a
                response. Questions are not stored on our servers after the response is
                delivered.
              </li>
              <li>
                <strong className="text-gray-300">Conversation history:</strong> Your
                conversation history is stored locally in your browser using localStorage.
                This data never leaves your device unless you choose to share it.
              </li>
              <li>
                <strong className="text-gray-300">Technical data:</strong> Standard web
                server logs may include IP addresses, browser type, and access timestamps
                for security and operational purposes.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              3. How We Use Your Information
            </h2>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>To provide and maintain the oracle service</li>
              <li>To detect and prevent technical issues or abuse</li>
              <li>To improve the quality of our service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              4. Data Storage and Security
            </h2>
            <p>
              We implement appropriate technical and organizational measures to protect
              your information. Conversation history is stored only in your browser&apos;s
              localStorage and can be cleared at any time using the &quot;Clear History&quot;
              button. We do not maintain a database of user conversations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              5. Cookies and Tracking
            </h2>
            <p>
              BrainLoop Oracle does not use cookies for tracking purposes. We do not use
              any third-party analytics or advertising services. The only client-side
              storage we use is localStorage for your conversation history.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              6. Third-Party Services
            </h2>
            <p>
              Oracle responses are generated locally from a pre-defined set of responses.
              No third-party AI services or APIs are used to process your questions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              7. Your Rights
            </h2>
            <p className="mb-3">
              Under applicable data protection laws, including GDPR, you have the right to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>Access your personal data</li>
              <li>Request deletion of your personal data</li>
              <li>Object to processing of your personal data</li>
              <li>Data portability</li>
              <li>Lodge a complaint with a supervisory authority (Datatilsynet in Norway)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              8. Children&apos;s Privacy
            </h2>
            <p>
              Our service is not directed to children under 13 years of age. We do not
              knowingly collect personal information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              9. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. Any changes will be
              posted on this page with an updated revision date. We encourage you to
              review this page periodically.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-mystic-purple-light mb-3">
              10. Contact Us
            </h2>
            <p>
              If you have questions about this Privacy Policy, please contact us:
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
