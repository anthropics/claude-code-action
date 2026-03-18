import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - BrainLoop Finance",
  description: "Privacy Policy for BrainLoop Finance by NorwegianSpark SA",
};

export default function PrivacyPolicy() {
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
          Privacy Policy
        </h1>
        <p className="text-sm text-slate-400 mb-8">Last updated: March 18, 2026</p>

        <div className="space-y-6 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Introduction</h2>
            <p>
              NorwegianSpark SA (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates BrainLoop Finance at
              finance.brainloop.games. This Privacy Policy explains how we handle information when
              you use our personal finance tracker application.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Data Storage</h2>
            <p>
              BrainLoop Finance stores all your financial data locally in your web browser using
              localStorage. We do not collect, transmit, or store any of your personal financial
              data on our servers. Your transaction history, budget settings, and all other financial
              information remain exclusively on your device.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Information We Do Not Collect</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Personal financial data or transaction history</li>
              <li>Bank account or payment card information</li>
              <li>Personal identification information</li>
              <li>Location data</li>
              <li>Camera or microphone data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Cookies and Tracking</h2>
            <p>
              BrainLoop Finance does not use cookies for tracking purposes. The application uses
              browser localStorage solely to persist your financial data on your device.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Third-Party Services</h2>
            <p>
              We may use hosting and content delivery services to serve the application. These
              services may collect standard web server logs (IP addresses, browser type, etc.) as
              part of their normal operations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Data Security</h2>
            <p>
              Since all data is stored locally on your device, you are responsible for the security
              of your device. Clearing your browser data will permanently delete all stored financial
              records. We recommend regularly backing up important financial information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Children&apos;s Privacy</h2>
            <p>
              BrainLoop Finance is not intended for children under the age of 13. We do not
              knowingly collect personal information from children.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Any changes will be posted on
              this page with an updated revision date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us:
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
