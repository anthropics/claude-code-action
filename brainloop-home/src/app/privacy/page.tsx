import Link from 'next/link'
import type { Metadata } from 'next'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Privacy Policy - BrainLoop',
  description: 'Privacy Policy for BrainLoop apps by NorwegianSpark SA.',
}

export default function PrivacyPolicy() {
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
          <span className="gradient-text">Privacy Policy</span>
        </h1>
        <p className="mt-4 text-slate-400">
          Last updated: March 18, 2026
        </p>

        <div className="mt-12 space-y-10 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              1. Who We Are
            </h2>
            <p>
              BrainLoop is a suite of web applications operated by{' '}
              <strong className="text-slate-100">NorwegianSpark SA</strong>{' '}
              (Org. nr. 834 984 172), a company registered in Norway. Our
              applications are accessible through the domain{' '}
              <strong className="text-slate-100">brainloop.games</strong> and
              its subdomains.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              2. Data Collection and Storage
            </h2>
            <p>
              We are committed to respecting your privacy. BrainLoop
              applications are designed to minimize data collection:
            </p>
            <ul className="mt-4 list-disc list-inside space-y-2 text-slate-400">
              <li>
                <strong className="text-slate-300">Local Storage Only:</strong>{' '}
                All user preferences, progress data, and application state are
                stored exclusively in your browser&apos;s localStorage. This data
                never leaves your device and is not transmitted to our servers or
                any third party.
              </li>
              <li>
                <strong className="text-slate-300">No User Accounts:</strong>{' '}
                We do not require you to create an account or provide personal
                information to use our applications.
              </li>
              <li>
                <strong className="text-slate-300">No Tracking:</strong> We do
                not use analytics trackers, fingerprinting, or any other
                technology to monitor your behavior across websites.
              </li>
              <li>
                <strong className="text-slate-300">No Server-Side Data:</strong>{' '}
                We do not maintain databases of user data. Your data exists only
                on your device.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              3. Cookies
            </h2>
            <p>
              BrainLoop applications do not set cookies for tracking or
              advertising purposes. If any cookies are used, they are strictly
              necessary for the technical functioning of the application (such as
              session management or security tokens) and contain no personally
              identifiable information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              4. Third-Party Services
            </h2>
            <p>
              Some BrainLoop applications may interact with third-party APIs to
              provide core functionality (for example, AI-powered features).
              When this occurs:
            </p>
            <ul className="mt-4 list-disc list-inside space-y-2 text-slate-400">
              <li>
                Data sent to third-party APIs is limited to the minimum
                necessary for the requested feature to function.
              </li>
              <li>
                No personally identifiable information is included in API
                requests unless explicitly provided by you as part of the
                feature&apos;s intended use.
              </li>
              <li>
                We do not share, sell, or transfer your data to any third party
                for marketing, advertising, or data brokering purposes.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              5. Waitlist and Email
            </h2>
            <p>
              If you voluntarily join our waitlist, your email address is stored
              in your browser&apos;s localStorage. We may in the future collect
              waitlist emails on a server for the purpose of sending product
              updates. If we do, you will be able to unsubscribe at any time,
              and we will never share your email with third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              6. Data Retention and Deletion
            </h2>
            <p>
              Since all data is stored in your browser&apos;s localStorage, you
              have full control over it. You can delete your data at any time by
              clearing your browser&apos;s local storage for brainloop.games or
              by using your browser&apos;s &quot;Clear site data&quot; feature.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              7. Children&apos;s Privacy
            </h2>
            <p>
              BrainLoop applications are suitable for general audiences. Since we
              do not collect personal information, there are no specific age
              restrictions. However, children under 13 should use the
              applications under parental guidance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              8. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. Any changes
              will be posted on this page with an updated revision date. We
              encourage you to review this page periodically.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              9. Contact Us
            </h2>
            <p>
              If you have any questions or concerns about this Privacy Policy,
              please contact us:
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
