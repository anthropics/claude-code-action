"use client";

import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-200">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Game
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <Shield className="h-8 w-8 text-amber-400" />
          <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
        </div>

        <div className="space-y-6 text-gray-300 leading-relaxed">
          <p className="text-sm text-gray-500">
            Last updated: March 18, 2026
          </p>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              1. Introduction
            </h2>
            <p>
              BrainLoop Trivia Battle (&quot;the Game&quot;) is operated by
              NorwegianSpark SA (org. nr. 834 984 172). We are committed to
              protecting your privacy and handling your data responsibly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              2. Data We Collect
            </h2>
            <p>
              The Game operates entirely in your browser. We collect minimal
              data:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>
                <strong>Local Storage:</strong> Player names and high scores are
                stored locally on your device using browser localStorage. This
                data never leaves your device.
              </li>
              <li>
                <strong>No Account Required:</strong> We do not require user
                registration or collect personal information such as email
                addresses, phone numbers, or payment details through the Game
                itself.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              3. Cookies and Tracking
            </h2>
            <p>
              The Game does not use cookies for tracking purposes. We do not
              employ third-party analytics, advertising trackers, or social
              media pixels within the Game.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              4. Data Storage
            </h2>
            <p>
              All game data (player names, scores, game progress) is stored
              exclusively in your browser&apos;s localStorage. You can clear
              this data at any time by clearing your browser&apos;s site data
              for trivia.brainloop.games.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              5. Third-Party Services
            </h2>
            <p>
              The Game may be hosted on third-party infrastructure providers.
              These providers may collect standard server logs (IP addresses,
              request timestamps) as part of normal web hosting operations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              6. Children&apos;s Privacy
            </h2>
            <p>
              The Game is suitable for all ages. We do not knowingly collect
              personal data from children. Since the Game uses only localStorage
              and does not transmit data to our servers, no personal information
              about children is collected or stored by us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              7. Your Rights
            </h2>
            <p>
              Under GDPR and Norwegian data protection law, you have the right
              to access, correct, or delete your personal data. Since all data
              is stored locally on your device, you maintain full control and
              can delete it at any time through your browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              8. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will
              be posted on this page with an updated revision date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              9. Contact Us
            </h2>
            <p>
              If you have questions about this Privacy Policy, please contact
              us:
            </p>
            <ul className="mt-2 space-y-1 ml-4">
              <li>
                <strong>Company:</strong> NorwegianSpark SA
              </li>
              <li>
                <strong>Org. nr.:</strong> 834 984 172
              </li>
              <li>
                <strong>Email:</strong>{" "}
                <a
                  href="mailto:norwegianspark@gmail.com"
                  className="text-amber-400 hover:text-amber-300"
                >
                  norwegianspark@gmail.com
                </a>
              </li>
              <li>
                <strong>Phone:</strong>{" "}
                <a
                  href="tel:+4799737467"
                  className="text-amber-400 hover:text-amber-300"
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
