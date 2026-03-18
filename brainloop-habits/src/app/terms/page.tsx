import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | BrainLoop Habit Tracker",
  description:
    "Terms of Service for BrainLoop Habit Tracker by NorwegianSpark SA.",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-400 mb-8">
        Effective Date: January 1, 2025
      </p>

      <div className="space-y-8 text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            1. Acceptance of Terms
          </h2>
          <p>
            By accessing and using BrainLoop Habit Tracker (&quot;the
            App&quot;), available at habits.brainloop.games, you agree to be
            bound by these Terms of Service. The App is operated by
            NorwegianSpark SA (Org. 834 984 172), a company registered in
            Norway. If you do not agree to these terms, please do not use the
            App.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            2. Description of Service
          </h2>
          <p>
            BrainLoop Habit Tracker is a free, browser-based habit tracking
            application. The App allows you to create habits, track daily
            completions, view streaks, and monitor your progress over time. All
            data is stored locally in your browser.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            3. User Responsibilities
          </h2>
          <p>You agree to:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
            <li>Use the App only for its intended purpose of habit tracking.</li>
            <li>
              Not attempt to reverse engineer, modify, or interfere with the
              App&apos;s functionality.
            </li>
            <li>
              Not use the App for any unlawful or prohibited activities.
            </li>
            <li>
              Understand that data stored in localStorage may be lost if you
              clear your browser data.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            4. Data and Privacy
          </h2>
          <p>
            All habit data is stored exclusively in your browser&apos;s local
            storage. We do not collect, store, or process personal data on our
            servers. Please review our{" "}
            <a href="/privacy" className="text-green-400 hover:underline">
              Privacy Policy
            </a>{" "}
            for complete details.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            5. Intellectual Property
          </h2>
          <p>
            The App, including its design, code, graphics, and branding, is the
            intellectual property of NorwegianSpark SA. You may not copy,
            reproduce, distribute, or create derivative works based on the App
            without prior written consent.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            6. Disclaimer of Warranties
          </h2>
          <p>
            The App is provided &quot;as is&quot; and &quot;as available&quot;
            without warranties of any kind, either express or implied. We do not
            warrant that the App will be uninterrupted, error-free, or free of
            harmful components. We make no guarantees regarding the persistence
            of data stored in localStorage.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            7. Limitation of Liability
          </h2>
          <p>
            To the maximum extent permitted by applicable law, NorwegianSpark SA
            shall not be liable for any indirect, incidental, special,
            consequential, or punitive damages arising from your use of or
            inability to use the App, including but not limited to loss of data
            stored in localStorage.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            8. Modifications to the Service
          </h2>
          <p>
            We reserve the right to modify, suspend, or discontinue the App at
            any time without prior notice. We shall not be liable to you or any
            third party for any modification, suspension, or discontinuation of
            the App.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            9. Changes to Terms
          </h2>
          <p>
            We may revise these Terms of Service at any time by updating this
            page. Your continued use of the App after changes are posted
            constitutes acceptance of the revised terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            10. Governing Law
          </h2>
          <p>
            These Terms of Service are governed by and construed in accordance
            with the laws of Norway. Any disputes arising from or in connection
            with these terms shall be subject to the exclusive jurisdiction of
            the Norwegian courts.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            11. Contact Us
          </h2>
          <p>
            If you have any questions about these Terms, please contact us:
          </p>
          <ul className="mt-3 space-y-1 text-gray-400">
            <li>
              <strong className="text-gray-300">Company:</strong>{" "}
              NorwegianSpark SA
            </li>
            <li>
              <strong className="text-gray-300">Org. Number:</strong>{" "}
              834 984 172
            </li>
            <li>
              <strong className="text-gray-300">Email:</strong>{" "}
              <a
                href="mailto:norwegianspark@gmail.com"
                className="text-green-400 hover:underline"
              >
                norwegianspark@gmail.com
              </a>
            </li>
            <li>
              <strong className="text-gray-300">Phone:</strong>{" "}
              <a
                href="tel:+4799737467"
                className="text-green-400 hover:underline"
              >
                +47 99 73 74 67
              </a>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
