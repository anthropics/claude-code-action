import { Brain, Mail, Phone, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - BrainLoop Focus",
  description: "Terms of Service for BrainLoop Focus by NorwegianSpark SA.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/5 bg-dark-800/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-white/40 transition-colors hover:text-white/70"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-accent" />
            <span className="text-sm font-semibold">BrainLoop Focus</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold">Terms of Service</h1>
        <p className="mb-8 text-sm text-white/40">
          Last updated: March 18, 2026
        </p>

        <div className="space-y-8 text-white/70">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing and using BrainLoop Focus at focus.brainloop.games
              (&quot;the Service&quot;), you accept and agree to be bound by these Terms
              of Service. The Service is operated by NorwegianSpark SA,
              organization number 834 984 172.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              2. Description of Service
            </h2>
            <p>
              BrainLoop Focus is a free, web-based productivity application that
              provides Pomodoro timer functionality and task management tools. The
              Service stores all user data locally in the browser and does not
              require account registration.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              3. Use of the Service
            </h2>
            <p>You agree to use the Service only for lawful purposes and in a manner that does not:</p>
            <ul className="mt-3 list-inside list-disc space-y-1 text-white/60">
              <li>Violate any applicable local, national, or international law</li>
              <li>Attempt to interfere with the proper functioning of the Service</li>
              <li>Attempt to gain unauthorized access to any systems or networks</li>
              <li>Use the Service to distribute malware or harmful content</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              4. Data and Privacy
            </h2>
            <p>
              All task data, session history, and preferences are stored locally
              on your device. We do not collect or process personal data. For full
              details, please review our{" "}
              <Link href="/privacy" className="text-accent hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              5. Intellectual Property
            </h2>
            <p>
              The BrainLoop Focus application, including its design, code, and
              branding, is the property of NorwegianSpark SA. You may not
              reproduce, distribute, or create derivative works based on the
              Service without prior written consent.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              6. Disclaimer of Warranties
            </h2>
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available&quot; without any
              warranties of any kind, either express or implied. NorwegianSpark SA
              does not warrant that the Service will be uninterrupted,
              error-free, or free of harmful components.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              7. Limitation of Liability
            </h2>
            <p>
              To the fullest extent permitted by Norwegian law, NorwegianSpark SA
              shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages, or any loss of data, use, or
              profits, arising out of or in connection with your use of the
              Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              8. Modifications to the Service
            </h2>
            <p>
              We reserve the right to modify, suspend, or discontinue the Service
              at any time without notice. We shall not be liable to you or any
              third party for any modification, suspension, or discontinuation of
              the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              9. Changes to Terms
            </h2>
            <p>
              We may revise these Terms of Service at any time by updating this
              page. Your continued use of the Service after any changes
              constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              10. Governing Law
            </h2>
            <p>
              These Terms shall be governed by and construed in accordance with
              the laws of Norway. Any disputes shall be subject to the exclusive
              jurisdiction of the Norwegian courts.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white/90">
              11. Contact Us
            </h2>
            <p>
              If you have any questions about these Terms, please contact us:
            </p>
            <div className="mt-3 space-y-2 text-white/60">
              <p className="font-semibold text-white/70">NorwegianSpark SA</p>
              <p>Organization number: 834 984 172</p>
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <a
                  href="mailto:norwegianspark@gmail.com"
                  className="text-accent hover:underline"
                >
                  norwegianspark@gmail.com
                </a>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <a
                  href="tel:+4799737467"
                  className="text-accent hover:underline"
                >
                  +47 99 73 74 67
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
