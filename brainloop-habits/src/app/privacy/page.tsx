import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | BrainLoop Habit Tracker",
  description: "Privacy Policy for BrainLoop Habit Tracker by NorwegianSpark SA.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-400 mb-8">
        Effective Date: January 1, 2025
      </p>

      <div className="space-y-8 text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            1. Introduction
          </h2>
          <p>
            BrainLoop Habit Tracker (&quot;the App&quot;) is operated by
            NorwegianSpark SA, a company registered in Norway with organization
            number 834 984 172. We are committed to protecting your privacy and
            ensuring transparency about how your data is handled.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            2. Data Collection and Storage
          </h2>
          <p>
            The App stores all habit tracking data exclusively in your
            browser&apos;s local storage (localStorage). We do not collect,
            transmit, or store any personal data on our servers. Your habit
            names, completion records, streaks, and preferences remain entirely
            on your device.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            3. No Account Required
          </h2>
          <p>
            The App does not require account creation, login, or any form of
            user registration. No email addresses, passwords, or personal
            identifiers are collected.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            4. Cookies and Tracking
          </h2>
          <p>
            The App does not use cookies for tracking purposes. We do not employ
            any third-party analytics, advertising trackers, or behavioral
            profiling tools.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            5. Third-Party Services
          </h2>
          <p>
            The App may be hosted on third-party infrastructure providers. These
            providers may collect standard server logs (IP addresses, request
            timestamps) as part of their normal operations. We do not access or
            use this data for tracking individual users.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            6. Data Deletion
          </h2>
          <p>
            Since all data is stored in your browser&apos;s localStorage, you
            can delete all App data at any time by clearing your browser data or
            by deleting individual habits within the App. No residual data
            remains on any server.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            7. Children&apos;s Privacy
          </h2>
          <p>
            The App does not knowingly collect data from children under the age
            of 13. Since no personal data is collected from any user, there are
            no special provisions required.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            8. Changes to This Policy
          </h2>
          <p>
            We may update this Privacy Policy from time to time. Any changes
            will be posted on this page with an updated effective date. We
            encourage you to review this policy periodically.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">
            9. Contact Us
          </h2>
          <p>
            If you have any questions about this Privacy Policy, please contact
            us:
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
