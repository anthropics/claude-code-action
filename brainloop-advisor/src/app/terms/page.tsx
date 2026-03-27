import Link from "next/link";
import { ArrowLeft, Brain, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - BrainLoop AI Advisor",
  description:
    "Terms of service for BrainLoop AI Advisor by NorwegianSpark SA.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[#1a1a36] bg-[#111128]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-lg hover:bg-[#1a1a36] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Brain className="w-7 h-7 text-rose-400" />
          <h1 className="text-lg font-bold">
            <span className="text-rose-400">BrainLoop</span>{" "}
            <span className="text-gray-300">Terms of Service</span>
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-4 py-10">
        <div className="prose prose-invert prose-sm max-w-none space-y-6">
          <p className="text-gray-400">Last updated: March 18, 2026</p>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              1. Acceptance of Terms
            </h2>
            <p className="text-gray-300 leading-relaxed">
              By accessing and using the BrainLoop AI Advisor service at
              advisor.brainloop.games, you agree to be bound by these Terms of
              Service. If you do not agree with any part of these terms, please
              do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              2. Description of Service
            </h2>
            <p className="text-gray-300 leading-relaxed">
              BrainLoop AI Advisor provides AI-powered conversational guidance
              through various persona-based advisors. The service is provided for
              entertainment and general guidance purposes only. It is not a
              substitute for professional advice from licensed therapists,
              counselors, financial advisors, or other qualified professionals.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              3. User Responsibilities
            </h2>
            <p className="text-gray-300 leading-relaxed">
              You agree to use the service responsibly and in compliance with all
              applicable laws. You will not use the service for any unlawful
              purpose, to harass or harm others, or to submit content that is
              offensive, harmful, or violates the rights of any third party.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              4. Disclaimer of Warranties
            </h2>
            <p className="text-gray-300 leading-relaxed">
              The service is provided &quot;as is&quot; and &quot;as
              available&quot; without warranties of any kind, either express or
              implied. NorwegianSpark SA does not warrant that the service will
              be uninterrupted, error-free, or that the advice provided will be
              accurate, complete, or suitable for any particular purpose.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              5. Limitation of Liability
            </h2>
            <p className="text-gray-300 leading-relaxed">
              In no event shall NorwegianSpark SA be liable for any indirect,
              incidental, special, consequential, or punitive damages arising out
              of or related to your use of the service, including but not limited
              to any decisions made based on advice received through the AI
              advisors.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              6. Intellectual Property
            </h2>
            <p className="text-gray-300 leading-relaxed">
              All content, design, and functionality of the BrainLoop AI Advisor
              service are the property of NorwegianSpark SA and are protected by
              applicable intellectual property laws. You may not reproduce,
              distribute, or create derivative works without prior written
              consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              7. Modifications to Service
            </h2>
            <p className="text-gray-300 leading-relaxed">
              We reserve the right to modify, suspend, or discontinue the
              service at any time without notice. We shall not be liable to you
              or any third party for any modification, suspension, or
              discontinuation of the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              8. Governing Law
            </h2>
            <p className="text-gray-300 leading-relaxed">
              These terms shall be governed by and construed in accordance with
              the laws of Norway, without regard to its conflict of law
              provisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              9. Changes to Terms
            </h2>
            <p className="text-gray-300 leading-relaxed">
              We reserve the right to update these Terms of Service at any time.
              Changes will be effective immediately upon posting to this page. Your
              continued use of the service constitutes acceptance of the revised
              terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              10. Contact Us
            </h2>
            <p className="text-gray-300 leading-relaxed">
              For questions about these Terms of Service, contact us:
            </p>
            <ul className="text-gray-300 mt-2 space-y-1">
              <li>NorwegianSpark SA</li>
              <li>Org. nr: 834 984 172</li>
              <li>Email: norwegianspark@gmail.com</li>
              <li>Phone: +47 99 73 74 67</li>
            </ul>
          </section>
        </div>
      </main>

      <footer className="border-t border-[#1a1a36] bg-[#111128]/50 py-6 px-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <span className="font-medium text-gray-400">NorwegianSpark SA</span>
            <span className="hidden sm:inline">|</span>
            <span>Org. 834 984 172</span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <a
              href="mailto:norwegianspark@gmail.com"
              className="flex items-center gap-1.5 hover:text-rose-400 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              norwegianspark@gmail.com
            </a>
            <span className="hidden sm:inline">|</span>
            <a
              href="tel:+4799737467"
              className="flex items-center gap-1.5 hover:text-rose-400 transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              +47 99 73 74 67
            </a>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/privacy"
              className="hover:text-rose-400 transition-colors"
            >
              Privacy
            </Link>
            <Link href="/terms" className="text-rose-400">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
