import Link from "next/link";
import { Brain, ArrowLeft, ScrollText } from "lucide-react";

export const metadata = {
  title: "Terms of Service | BrainLoop Word Game",
  description:
    "Terms of Service for BrainLoop Word Game by NorwegianSpark SA.",
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#0a0a1a] flex flex-col">
      <header className="border-b border-[#1e1e3a] bg-[#0d0d22]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Game</span>
          </Link>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-semibold text-white">
              Brain<span className="text-emerald-400">Loop</span>
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-4 py-10 w-full">
        <div className="flex items-center gap-3 mb-8">
          <ScrollText className="w-8 h-8 text-emerald-400" />
          <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
        </div>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-gray-300">
          <p className="text-gray-400 text-sm">
            Last updated: March 18, 2026
          </p>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing and using the BrainLoop Word Game at words.brainloop.games,
              you accept and agree to be bound by these Terms of Service. If you do not
              agree to these terms, please do not use the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              2. Description of Service
            </h2>
            <p>
              BrainLoop Word Game is a free-to-play word puzzle game operated by
              NorwegianSpark SA. The game challenges players to guess a 5-letter word
              within 6 attempts. The service is provided &quot;as is&quot; and &quot;as available&quot;.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">3. Use of Service</h2>
            <p>You agree to use the service only for lawful purposes and in a manner that does not:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Infringe the rights of others</li>
              <li>Restrict or inhibit others from using the service</li>
              <li>Attempt to gain unauthorized access to the service or its systems</li>
              <li>Use automated means to access or interact with the service</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              4. Intellectual Property
            </h2>
            <p>
              The BrainLoop name, logo, game design, and all related content are the
              property of NorwegianSpark SA. You may not reproduce, distribute, or
              create derivative works without our express written permission.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              5. Disclaimer of Warranties
            </h2>
            <p>
              The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis without
              warranties of any kind, either express or implied. We do not warrant that
              the service will be uninterrupted, error-free, or free of harmful
              components.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              6. Limitation of Liability
            </h2>
            <p>
              To the fullest extent permitted by applicable law, NorwegianSpark SA
              shall not be liable for any indirect, incidental, special, consequential,
              or punitive damages arising out of or related to your use of the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              7. Changes to Terms
            </h2>
            <p>
              We reserve the right to modify these Terms of Service at any time. Changes
              will be effective immediately upon posting to this page. Your continued
              use of the service after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">8. Governing Law</h2>
            <p>
              These terms shall be governed by and construed in accordance with the laws
              of Norway, without regard to its conflict of law provisions.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">9. Contact Us</h2>
            <p>
              If you have questions about these Terms of Service, please contact us:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                Email:{" "}
                <a
                  href="mailto:norwegianspark@gmail.com"
                  className="text-emerald-400 hover:underline"
                >
                  norwegianspark@gmail.com
                </a>
              </li>
              <li>
                Phone:{" "}
                <a
                  href="tel:+4799737467"
                  className="text-emerald-400 hover:underline"
                >
                  +47 99 73 74 67
                </a>
              </li>
              <li>Company: NorwegianSpark SA, Org. 834 984 172</li>
            </ul>
          </section>
        </div>
      </main>

      <footer className="border-t border-[#1e1e3a] bg-[#0d0d22]/60 py-4 px-4">
        <div className="max-w-3xl mx-auto text-center text-xs text-gray-500">
          <span className="text-gray-400 font-medium">NorwegianSpark SA</span>
          {" | "}Org. 834 984 172
          {" | "}
          <a
            href="mailto:norwegianspark@gmail.com"
            className="hover:text-emerald-400 transition-colors"
          >
            norwegianspark@gmail.com
          </a>
          {" | "}
          <a
            href="tel:+4799737467"
            className="hover:text-emerald-400 transition-colors"
          >
            +47 99 73 74 67
          </a>
        </div>
      </footer>
    </div>
  );
}
