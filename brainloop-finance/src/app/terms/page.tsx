import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - BrainLoop Finance",
  description: "Terms of Service for BrainLoop Finance by NorwegianSpark SA",
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 max-w-3xl mx-auto px-4 py-12 w-full">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-orange-400 hover:text-orange-300 mb-8 transition-colors"
        >
          &larr; Back to Finance Tracker
        </Link>

        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
          Terms of Service
        </h1>
        <p className="text-sm text-slate-400 mb-8">Last updated: March 18, 2026</p>

        <div className="space-y-6 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing and using BrainLoop Finance at finance.brainloop.games, you agree to be
              bound by these Terms of Service. If you do not agree to these terms, please do not use
              the application.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Service Description</h2>
            <p>
              BrainLoop Finance is a personal finance tracking application operated by NorwegianSpark
              SA. The application allows users to track income, expenses, and budgets. All data is
              stored locally in the user&apos;s web browser.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. User Responsibilities</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>You are responsible for the accuracy of data you enter into the application.</li>
              <li>
                You are responsible for maintaining the security of your device and browser data.
              </li>
              <li>
                You acknowledge that clearing browser data will permanently delete your stored
                financial records.
              </li>
              <li>You agree to use the application only for lawful purposes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Data and Privacy</h2>
            <p>
              All financial data is stored locally on your device. We do not collect, store, or
              process your financial information on our servers. For more details, please review our{" "}
              <Link href="/privacy" className="text-orange-400 hover:text-orange-300">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Disclaimer of Warranties</h2>
            <p>
              BrainLoop Finance is provided &quot;as is&quot; and &quot;as available&quot; without any warranties of
              any kind, express or implied. We do not guarantee that the application will be
              error-free, uninterrupted, or meet your specific requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Limitation of Liability</h2>
            <p>
              NorwegianSpark SA shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages arising from your use of BrainLoop Finance. This
              includes, but is not limited to, loss of data, financial losses, or any damages
              resulting from reliance on information provided by the application.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Not Financial Advice</h2>
            <p>
              BrainLoop Finance is a personal tracking tool and does not provide financial advice,
              investment recommendations, or tax guidance. You should consult qualified financial
              professionals for financial advice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Modifications</h2>
            <p>
              We reserve the right to modify or discontinue the application at any time without
              notice. We may also update these Terms of Service from time to time. Continued use of
              the application constitutes acceptance of any modifications.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Governing Law</h2>
            <p>
              These Terms of Service are governed by and construed in accordance with the laws of
              Norway. Any disputes arising from these terms shall be resolved in Norwegian courts.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Contact Us</h2>
            <p>
              If you have any questions about these Terms of Service, please contact us:
            </p>
            <ul className="mt-2 space-y-1 text-slate-400">
              <li>
                <strong className="text-slate-300">Company:</strong> NorwegianSpark SA
              </li>
              <li>
                <strong className="text-slate-300">Organization Number:</strong> 834 984 172
              </li>
              <li>
                <strong className="text-slate-300">Email:</strong>{" "}
                <a href="mailto:norwegianspark@gmail.com" className="text-orange-400 hover:text-orange-300">
                  norwegianspark@gmail.com
                </a>
              </li>
              <li>
                <strong className="text-slate-300">Phone:</strong>{" "}
                <a href="tel:+4799737467" className="text-orange-400 hover:text-orange-300">
                  +47 99 73 74 67
                </a>
              </li>
            </ul>
          </section>
        </div>
      </main>

      <footer className="border-t border-[#1e1e3a] mt-16 pt-8 pb-8">
        <div className="max-w-3xl mx-auto px-4 text-center text-sm text-slate-400">
          <p>&copy; {new Date().getFullYear()} NorwegianSpark SA. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
