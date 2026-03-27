import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | BrainLoop Daily Journal",
  description: "Privacy Policy for BrainLoop Daily Journal by NorwegianSpark SA.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-brand-dark text-slate-300">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link
          href="/"
          className="inline-flex items-center text-teal-400 hover:text-teal-300 mb-8 transition-colors"
        >
          &larr; Back to Journal
        </Link>

        <h1 className="text-3xl font-bold gradient-text mb-8">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-8">Last updated: March 18, 2026</p>

        <div className="space-y-8 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Introduction</h2>
            <p>
              BrainLoop Daily Journal (&quot;the Service&quot;) is operated by NorwegianSpark SA
              (Org. 834 984 172). We are committed to protecting your privacy and
              ensuring transparency in how we handle your data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Data Storage</h2>
            <p>
              All journal entries, mood data, and personal reflections are stored
              exclusively in your browser&apos;s local storage (localStorage). We do not
              transmit, collect, or store any of your journal data on our servers. Your
              entries remain entirely on your device.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Data We Do Not Collect</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Journal entries or text content</li>
              <li>Mood selections</li>
              <li>Personal information or identifiers</li>
              <li>Usage analytics or tracking data</li>
              <li>Cookies for tracking purposes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Local Storage</h2>
            <p>
              The Service uses browser localStorage to save your journal entries
              locally on your device. This data is not accessible to us or any third
              party. You can clear this data at any time through your browser settings
              or by deleting entries within the app.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Third-Party Services</h2>
            <p>
              The Service does not integrate with any third-party analytics, advertising,
              or tracking services. We use Google Fonts to serve the Inter typeface, which
              is subject to Google&apos;s Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Data Security</h2>
            <p>
              Since all data is stored locally on your device, the security of your
              journal entries depends on the security of your device and browser. We
              recommend keeping your device secure and using a private browser if you
              share your device with others.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Children&apos;s Privacy</h2>
            <p>
              The Service is not directed at children under the age of 13. We do not
              knowingly collect any data from children.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Any changes will be
              posted on this page with an updated revision date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Contact</h2>
            <p>
              If you have questions about this Privacy Policy, contact us at:
            </p>
            <div className="mt-3 glass rounded-lg p-4 space-y-1">
              <p className="text-white font-medium">NorwegianSpark SA</p>
              <p>Org. nr: 834 984 172</p>
              <p>
                Email:{" "}
                <a href="mailto:norwegianspark@gmail.com" className="text-teal-400 hover:text-teal-300">
                  norwegianspark@gmail.com
                </a>
              </p>
              <p>
                Phone:{" "}
                <a href="tel:+4799737467" className="text-teal-400 hover:text-teal-300">
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
