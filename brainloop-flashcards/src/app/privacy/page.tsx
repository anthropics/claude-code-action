import { Brain, Mail, Phone, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - BrainLoop Flashcards",
  description: "Privacy policy for BrainLoop Flashcards by NorwegianSpark SA.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 max-w-3xl mx-auto px-4 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-purple-400 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Flashcards
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Brain className="w-6 h-6 text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-200">Privacy Policy</h1>
        </div>

        <div className="glass-strong rounded-2xl p-6 sm:p-8 space-y-6 text-slate-400 text-sm leading-relaxed">
          <p className="text-slate-300">
            <strong>Effective Date:</strong> January 1, 2025
          </p>
          <p>
            This Privacy Policy describes how <strong className="text-slate-300">BrainLoop Flashcards</strong> (&quot;we&quot;,
            &quot;us&quot;, or &quot;our&quot;), operated by <strong className="text-slate-300">NorwegianSpark SA</strong>{" "}
            (Org. nr. 834 984 172), handles information when you use our flashcard study application
            available at <strong className="text-slate-300">flashcards.brainloop.games</strong>.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">1. Information We Collect</h2>
            <p>
              BrainLoop Flashcards is designed with privacy in mind. We do <strong className="text-slate-300">not</strong> collect, store, or transmit
              any personal data to external servers. All study progress, scores, and session data are stored
              exclusively in your browser&apos;s <strong className="text-slate-300">localStorage</strong> on your device.
            </p>
            <p className="mt-2">Specifically, we store the following data locally on your device:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Current card index (your position in the deck)</li>
              <li>Score data (which cards you marked as &quot;known&quot; or &quot;study more&quot;)</li>
              <li>Session statistics (session count, total cards studied, accuracy)</li>
              <li>Last session date</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">2. No Account Required</h2>
            <p>
              BrainLoop Flashcards does not require you to create an account, log in, or provide any personal
              information such as your name, email address, or payment details to use the application.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">3. Cookies and Tracking</h2>
            <p>
              We do not use cookies, tracking pixels, analytics services, or any third-party tracking tools.
              We do not serve advertisements. Your study activity is completely private and stays on your device.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">4. Data Sharing</h2>
            <p>
              Since we do not collect any personal data, we do not share, sell, or transfer any personal
              information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">5. Data Retention and Deletion</h2>
            <p>
              All data is stored locally in your browser. You can delete all stored data at any time by:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Using the &quot;Reset All Progress&quot; button in the app</li>
              <li>Clearing your browser&apos;s localStorage for this site</li>
              <li>Clearing your browser&apos;s site data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">6. Children&apos;s Privacy</h2>
            <p>
              BrainLoop Flashcards is suitable for users of all ages. Since we do not collect any personal
              data, there are no special concerns regarding children&apos;s privacy. The application is an
              educational tool designed to help learners of any age study more effectively.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">7. Third-Party Services</h2>
            <p>
              The application may be hosted on third-party infrastructure providers. These providers may
              collect standard server logs (such as IP addresses and request timestamps) as part of their
              normal operations. We do not control this data collection. Please refer to the hosting
              provider&apos;s privacy policy for details.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Any changes will be reflected on this page
              with an updated effective date. We encourage you to review this policy periodically.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">9. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact us:</p>
            <div className="mt-3 space-y-2">
              <p><strong className="text-slate-300">NorwegianSpark SA</strong></p>
              <p>Org. nr. 834 984 172</p>
              <p className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-purple-400" />
                <a href="mailto:norwegianspark@gmail.com" className="text-purple-400 hover:underline">
                  norwegianspark@gmail.com
                </a>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-purple-400" />
                <a href="tel:+4799737467" className="text-purple-400 hover:underline">
                  +47 99 73 74 67
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="w-full border-t border-white/5 mt-12 py-8 px-4">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-3 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-500/50" />
            <span className="font-medium text-slate-400">BrainLoop Flashcards</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <span>NorwegianSpark SA</span>
            <span className="hidden sm:inline">|</span>
            <span>Org. 834 984 172</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <a href="mailto:norwegianspark@gmail.com" className="hover:text-purple-400 transition-colors flex items-center gap-1">
              <Mail className="w-3 h-3" />
              norwegianspark@gmail.com
            </a>
            <span className="hidden sm:inline">|</span>
            <a href="tel:+4799737467" className="hover:text-purple-400 transition-colors flex items-center gap-1">
              <Phone className="w-3 h-3" />
              +47 99 73 74 67
            </a>
          </div>
          <div className="flex gap-4 mt-1">
            <Link href="/privacy" className="hover:text-purple-400 transition-colors">
              Privacy Policy
            </Link>
            <span>|</span>
            <Link href="/terms" className="hover:text-purple-400 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
