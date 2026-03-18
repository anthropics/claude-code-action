import Link from 'next/link'
import type { Metadata } from 'next'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Terms of Service - BrainLoop',
  description: 'Terms of Service for BrainLoop apps by NorwegianSpark SA.',
}

export default function TermsOfService() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300 transition-colors mb-10"
        >
          &larr; Back to Home
        </Link>

        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          <span className="gradient-text">Terms of Service</span>
        </h1>
        <p className="mt-4 text-slate-400">
          Last updated: March 18, 2026
        </p>

        <div className="mt-12 space-y-10 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using any application within the BrainLoop suite
              (available at brainloop.games and its subdomains), you agree to be
              bound by these Terms of Service. If you do not agree to these
              terms, please do not use our applications.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              2. Service Provider
            </h2>
            <p>
              BrainLoop is operated by{' '}
              <strong className="text-slate-100">NorwegianSpark SA</strong>{' '}
              (Org. nr. 834 984 172), a company registered in Norway. References
              to &quot;we,&quot; &quot;us,&quot; or &quot;our&quot; in these
              terms refer to NorwegianSpark SA.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              3. Description of Services
            </h2>
            <p>
              BrainLoop provides a suite of web-based applications including,
              but not limited to: flashcard learning, trivia games, tarot
              readings, habit tracking, productivity tools, word games, AI
              advisory, financial tracking, and journaling. These applications
              are provided free of charge and are accessible through standard
              web browsers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              4. Use of Services
            </h2>
            <p>You agree to use BrainLoop applications only for lawful purposes and in accordance with these Terms. You agree not to:</p>
            <ul className="mt-4 list-disc list-inside space-y-2 text-slate-400">
              <li>
                Use the services in any way that violates applicable local,
                national, or international laws or regulations.
              </li>
              <li>
                Attempt to gain unauthorized access to any part of the services,
                other users&apos; data, or any systems or networks connected to
                the services.
              </li>
              <li>
                Use automated tools, bots, or scrapers to access, extract, or
                interact with the services without our prior written consent.
              </li>
              <li>
                Introduce malicious code, viruses, or any other harmful
                technology to the services.
              </li>
              <li>
                Interfere with or disrupt the integrity or performance of the
                services.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              5. Intellectual Property
            </h2>
            <p>
              All content, design, graphics, code, and other materials within
              BrainLoop applications are the property of NorwegianSpark SA or
              its licensors and are protected by applicable intellectual
              property laws. You may not reproduce, distribute, modify, or
              create derivative works from any part of our applications without
              prior written permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              6. User-Generated Content
            </h2>
            <p>
              Some BrainLoop applications allow you to create content (such as
              flashcard decks, journal entries, or habit definitions). This
              content is stored locally on your device. You retain full
              ownership of any content you create. We do not claim any rights to
              your user-generated content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              7. AI-Powered Features
            </h2>
            <p>
              Certain BrainLoop applications use artificial intelligence to
              provide features such as advice, content generation, or insights.
              AI-generated content is provided for informational and
              entertainment purposes only. You should not rely on AI-generated
              content as a substitute for professional advice (financial, legal,
              medical, or otherwise). We make no guarantees regarding the
              accuracy, completeness, or suitability of AI-generated content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              8. Tarot and Divination Disclaimer
            </h2>
            <p>
              The Tarot application within BrainLoop is provided strictly for
              entertainment and self-reflection purposes. Tarot readings are not
              predictive and should not be used as the basis for making
              important life decisions. NorwegianSpark SA makes no claims
              regarding the supernatural or divinatory accuracy of tarot
              readings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              9. Financial Tools Disclaimer
            </h2>
            <p>
              The Finance application is a personal budgeting and tracking tool.
              It does not constitute financial advice. You should consult a
              qualified financial advisor for financial decisions.
              NorwegianSpark SA is not responsible for any financial decisions
              you make based on information provided by our applications.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              10. Availability and Modifications
            </h2>
            <p>
              We strive to keep BrainLoop applications available at all times,
              but we do not guarantee uninterrupted access. We reserve the right
              to modify, suspend, or discontinue any part of the services at
              any time, with or without notice. We are not liable for any
              modification, suspension, or discontinuation of the services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              11. Disclaimer of Warranties
            </h2>
            <p>
              BrainLoop applications are provided &quot;as is&quot; and &quot;as
              available&quot; without warranties of any kind, either express or
              implied, including but not limited to implied warranties of
              merchantability, fitness for a particular purpose, and
              non-infringement. We do not warrant that the services will be
              error-free, secure, or uninterrupted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              12. Limitation of Liability
            </h2>
            <p>
              To the fullest extent permitted by applicable law, NorwegianSpark
              SA shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages, or any loss of profits,
              revenue, data, or use, arising out of or related to your use of
              BrainLoop applications, regardless of the theory of liability.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              13. Governing Law
            </h2>
            <p>
              These Terms of Service shall be governed by and construed in
              accordance with the laws of Norway. Any disputes arising from
              these terms or your use of BrainLoop applications shall be
              subject to the exclusive jurisdiction of the Norwegian courts.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              14. Changes to These Terms
            </h2>
            <p>
              We reserve the right to update these Terms of Service at any
              time. Changes will be posted on this page with an updated revision
              date. Your continued use of the services after changes are posted
              constitutes your acceptance of the revised terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              15. Contact Us
            </h2>
            <p>
              If you have any questions about these Terms of Service, please
              contact us:
            </p>
            <div className="mt-4 glass-card rounded-xl p-6 space-y-2 text-sm text-slate-400">
              <p>
                <strong className="text-slate-300">Company:</strong>{' '}
                NorwegianSpark SA
              </p>
              <p>
                <strong className="text-slate-300">Org. Number:</strong>{' '}
                834 984 172
              </p>
              <p>
                <strong className="text-slate-300">Email:</strong>{' '}
                <a
                  href="mailto:norwegianspark@gmail.com"
                  className="text-purple-400 hover:text-purple-300 transition-colors"
                >
                  norwegianspark@gmail.com
                </a>
              </p>
              <p>
                <strong className="text-slate-300">Phone:</strong>{' '}
                <a
                  href="tel:+4799737467"
                  className="text-purple-400 hover:text-purple-300 transition-colors"
                >
                  +47 99 73 74 67
                </a>
              </p>
            </div>
          </section>
        </div>
      </div>

      <Footer />
    </main>
  )
}
