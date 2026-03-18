import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | BrainLoop Daily Journal",
  description: "Terms of Service for BrainLoop Daily Journal by NorwegianSpark SA.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-brand-dark text-slate-300">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link
          href="/"
          className="inline-flex items-center text-teal-400 hover:text-teal-300 mb-8 transition-colors"
        >
          &larr; Back to Journal
        </Link>

        <h1 className="text-3xl font-bold gradient-text mb-8">Terms of Service</h1>
        <p className="text-sm text-slate-500 mb-8">Last updated: March 18, 2026</p>

        <div className="space-y-8 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing and using BrainLoop Daily Journal (&quot;the Service&quot;), operated
              by NorwegianSpark SA (Org. 834 984 172), you agree to be bound by these
              Terms of Service. If you do not agree, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Description of Service</h2>
            <p>
              BrainLoop Daily Journal is a free, browser-based journaling application
              that allows users to write daily reflections, track moods, and maintain a
              writing streak. All data is stored locally in your browser.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. User Responsibilities</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>You are responsible for the content you write in your journal entries.</li>
              <li>You are responsible for maintaining the security of your device.</li>
              <li>
                You understand that clearing browser data will permanently delete your
                journal entries.
              </li>
              <li>You agree to use the Service for lawful purposes only.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Data and Storage</h2>
            <p>
              All journal entries are stored in your browser&apos;s localStorage. We do not
              back up, sync, or store your data on any server. You are solely
              responsible for backing up your data if needed. We are not liable for any
              data loss resulting from browser cache clearing, device changes, or other
              causes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Intellectual Property</h2>
            <p>
              The Service&apos;s design, code, branding, and writing prompts are the
              intellectual property of NorwegianSpark SA. Your journal entries remain
              your own property.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Disclaimer of Warranties</h2>
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of
              any kind, either express or implied. We do not guarantee that the Service
              will be uninterrupted, error-free, or free of harmful components.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Limitation of Liability</h2>
            <p>
              NorwegianSpark SA shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages arising out of your use of
              the Service, including but not limited to loss of data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Mental Health Disclaimer</h2>
            <p>
              BrainLoop Daily Journal is a reflective writing tool and is not a
              substitute for professional mental health services. If you are
              experiencing mental health difficulties, please reach out to a qualified
              professional or your local crisis helpline.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Modifications</h2>
            <p>
              We reserve the right to modify these Terms at any time. Changes will be
              posted on this page. Continued use of the Service after changes
              constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws
              of Norway.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Contact</h2>
            <p>
              For questions regarding these Terms, contact us at:
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
