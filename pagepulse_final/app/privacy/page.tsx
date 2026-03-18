import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "PagePulse privacy policy — how we collect, use, and protect your data.",
  openGraph: {
    title: "Privacy Policy | PagePulse",
    description: "How PagePulse collects, uses, and protects your data.",
  },
};

export default function PrivacyPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold text-white">Privacy Policy</h1>
        <p className="mt-4 text-sm text-gray-500">
          Last updated: March 16, 2026
        </p>

        <div className="mt-12 space-y-10 text-gray-300">
          <section>
            <h2 className="text-xl font-semibold text-white">1. Who We Are</h2>
            <p className="mt-3 text-sm leading-relaxed">
              PagePulse is operated by NorwegianSpark SA (Org. 834 984 172),
              registered in Norway. Contact us at norwegianspark@gmail.com or
              +47 99 73 74 67.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              2. Information We Collect
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-6 text-sm leading-relaxed">
              <li>
                <strong>Account information:</strong> email address and password
                hash when you register.
              </li>
              <li>
                <strong>Usage data:</strong> URLs you submit for analysis, API
                call timestamps, and feature usage metrics.
              </li>
              <li>
                <strong>Payment data:</strong> processed and stored securely by
                Stripe. We do not store card numbers.
              </li>
              <li>
                <strong>Technical data:</strong> IP address, browser type, and
                device information from server logs.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              3. How We Use Your Data
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-6 text-sm leading-relaxed">
              <li>Providing and improving our web analysis services.</li>
              <li>Processing payments and managing subscriptions.</li>
              <li>
                Sending transactional emails (account confirmations, billing
                receipts).
              </li>
              <li>
                Sending marketing emails (product updates, tips) — you can
                unsubscribe at any time.
              </li>
              <li>Detecting and preventing fraud or abuse.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              4. Data Sharing
            </h2>
            <p className="mt-3 text-sm leading-relaxed">
              We do not sell your personal data. We share data only with:
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-6 text-sm leading-relaxed">
              <li>
                <strong>Stripe:</strong> for payment processing.
              </li>
              <li>
                <strong>Supabase:</strong> for database hosting and
                authentication.
              </li>
              <li>
                <strong>Vercel:</strong> for application hosting.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              5. Data Retention
            </h2>
            <p className="mt-3 text-sm leading-relaxed">
              We retain your data for as long as your account is active. When
              you delete your account, all personal data is permanently removed
              within 30 days. Anonymized aggregate analytics data may be
              retained indefinitely.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              6. Your Rights (GDPR)
            </h2>
            <p className="mt-3 text-sm leading-relaxed">
              Under the General Data Protection Regulation, you have the right
              to access, rectify, erase, restrict processing, data portability,
              and object to processing of your personal data. To exercise these
              rights, email us at norwegianspark@gmail.com.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">7. Cookies</h2>
            <p className="mt-3 text-sm leading-relaxed">
              We use essential cookies for authentication and session
              management. We do not use third-party tracking cookies or
              advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">8. Security</h2>
            <p className="mt-3 text-sm leading-relaxed">
              We implement industry-standard security measures including TLS
              encryption, hashed passwords, and encrypted API key storage. If
              you discover a vulnerability, please report it to
              norwegianspark@gmail.com.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              9. Changes to This Policy
            </h2>
            <p className="mt-3 text-sm leading-relaxed">
              We may update this policy from time to time. We will notify you of
              significant changes via email or a notice on our website.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">10. Contact</h2>
            <p className="mt-3 text-sm leading-relaxed">
              NorwegianSpark SA | Org. 834 984 172
              <br />
              Email:{" "}
              <a
                href="mailto:norwegianspark@gmail.com"
                className="text-brand-400 hover:underline"
              >
                norwegianspark@gmail.com
              </a>
              <br />
              Phone:{" "}
              <a
                href="tel:+4799737467"
                className="text-brand-400 hover:underline"
              >
                +47 99 73 74 67
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
