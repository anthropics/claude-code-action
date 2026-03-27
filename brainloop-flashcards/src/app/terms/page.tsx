import { Brain, Mail, Phone, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - BrainLoop Flashcards",
  description: "Terms of service for BrainLoop Flashcards by NorwegianSpark SA.",
};

export default function TermsPage() {
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
          <h1 className="text-2xl font-bold text-slate-200">Terms of Service</h1>
        </div>

        <div className="glass-strong rounded-2xl p-6 sm:p-8 space-y-6 text-slate-400 text-sm leading-relaxed">
          <p className="text-slate-300">
            <strong>Effective Date:</strong> January 1, 2025
          </p>
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your use of{" "}
            <strong className="text-slate-300">BrainLoop Flashcards</strong> (&quot;the Service&quot;), a flashcard study
            application operated by <strong className="text-slate-300">NorwegianSpark SA</strong> (Org. nr. 834 984 172),
            available at <strong className="text-slate-300">flashcards.brainloop.games</strong>. By accessing or using the
            Service, you agree to be bound by these Terms.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing and using BrainLoop Flashcards, you acknowledge that you have read, understood, and
              agree to be bound by these Terms. If you do not agree to these Terms, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">2. Description of Service</h2>
            <p>
              BrainLoop Flashcards is a free, web-based educational tool that provides interactive flashcard
              study functionality. The Service allows users to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Study flashcards across various subjects and topics</li>
              <li>Track study progress and performance locally</li>
              <li>Shuffle and navigate through flashcard decks</li>
              <li>Mark cards as known or requiring further study</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">3. User Responsibilities</h2>
            <p>When using the Service, you agree to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Use the Service only for lawful purposes and in accordance with these Terms</li>
              <li>Not attempt to interfere with or disrupt the Service or its infrastructure</li>
              <li>Not attempt to gain unauthorized access to any part of the Service</li>
              <li>Not use automated tools to scrape or extract content from the Service</li>
              <li>Not reproduce, distribute, or create derivative works from the Service without permission</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">4. Intellectual Property</h2>
            <p>
              All content, design, code, and materials within the Service are the property of NorwegianSpark SA
              or its licensors and are protected by applicable intellectual property laws. The flashcard content
              is provided for educational purposes and may include commonly known facts and general knowledge.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">5. Disclaimer of Warranties</h2>
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express
              or implied. NorwegianSpark SA does not warrant that:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>The Service will be uninterrupted, timely, secure, or error-free</li>
              <li>The flashcard content will be accurate, complete, or up to date</li>
              <li>Any errors in the Service will be corrected</li>
              <li>The Service will meet your specific learning requirements</li>
            </ul>
            <p className="mt-2">
              The flashcard content is intended for general educational purposes only and should not be relied
              upon as the sole source of information for academic, professional, or any other purpose.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">6. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by applicable law, NorwegianSpark SA shall not be liable for
              any indirect, incidental, special, consequential, or punitive damages, including but not limited
              to loss of data, loss of profits, or other intangible losses, arising out of or related to your
              use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">7. Data and Storage</h2>
            <p>
              All study data is stored locally in your browser&apos;s localStorage. NorwegianSpark SA is not
              responsible for any loss of locally stored data due to browser updates, cache clearing, device
              changes, or any other reason. We recommend that users do not rely on local storage for
              critical data preservation.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">8. Modifications to Service</h2>
            <p>
              NorwegianSpark SA reserves the right to modify, suspend, or discontinue the Service (or any part
              thereof) at any time, with or without notice. We shall not be liable to you or any third party
              for any modification, suspension, or discontinuation of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">9. Changes to Terms</h2>
            <p>
              We reserve the right to update or modify these Terms at any time. Changes will be effective
              immediately upon posting on this page. Your continued use of the Service after any changes
              constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">10. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of Norway. Any
              disputes arising from these Terms or your use of the Service shall be subject to the exclusive
              jurisdiction of the courts of Norway.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">11. Contact Us</h2>
            <p>If you have any questions about these Terms, please contact us:</p>
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
