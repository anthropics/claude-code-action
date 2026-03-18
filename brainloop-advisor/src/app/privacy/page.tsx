import Link from "next/link";
import { ArrowLeft, Brain, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - BrainLoop AI Advisor",
  description: "Privacy policy for BrainLoop AI Advisor by NorwegianSpark SA.",
};

export default function PrivacyPage() {
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
            <span className="text-gray-300">Privacy Policy</span>
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-4 py-10">
        <div className="prose prose-invert prose-sm max-w-none space-y-6">
          <p className="text-gray-400">Last updated: March 18, 2026</p>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              1. Introduction
            </h2>
            <p className="text-gray-300 leading-relaxed">
              NorwegianSpark SA (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;)
              operates the BrainLoop AI Advisor service at advisor.brainloop.games.
              This Privacy Policy explains how we collect, use, and protect your
              information when you use our service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              2. Information We Collect
            </h2>
            <p className="text-gray-300 leading-relaxed">
              <strong className="text-gray-200">Chat Data:</strong> Your
              conversations with AI advisors are stored locally in your browser
              using localStorage. We do not transmit or store your conversation
              data on our servers beyond the duration needed to generate a
              response.
            </p>
            <p className="text-gray-300 leading-relaxed mt-2">
              <strong className="text-gray-200">Usage Data:</strong> We may
              collect anonymous usage statistics such as page views and feature
              usage to improve our service. No personally identifiable
              information is collected through analytics.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              3. How We Use Your Information
            </h2>
            <p className="text-gray-300 leading-relaxed">
              We use collected information solely to provide and improve the
              BrainLoop AI Advisor service. We do not sell, trade, or share your
              personal information with third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              4. Data Storage and Security
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Conversation history is stored exclusively in your browser&apos;s
              localStorage. You can clear this data at any time by clearing your
              browser data. We implement security headers and best practices to
              protect the service from common web vulnerabilities.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              5. Cookies
            </h2>
            <p className="text-gray-300 leading-relaxed">
              This service uses only essential cookies required for the
              application to function. We do not use tracking cookies or
              third-party advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              6. Your Rights
            </h2>
            <p className="text-gray-300 leading-relaxed">
              You have the right to access, correct, or delete any personal data
              we may hold. Since conversations are stored locally in your
              browser, you have full control over this data. For any
              privacy-related requests, contact us at norwegianspark@gmail.com.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              7. Changes to This Policy
            </h2>
            <p className="text-gray-300 leading-relaxed">
              We may update this Privacy Policy from time to time. Changes will
              be posted on this page with an updated revision date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              8. Contact Us
            </h2>
            <p className="text-gray-300 leading-relaxed">
              If you have any questions about this Privacy Policy, please
              contact us:
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
            <Link href="/privacy" className="text-rose-400">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-rose-400 transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
