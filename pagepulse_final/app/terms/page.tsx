import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "PagePulse terms of service — rules and conditions for using our platform.",
  openGraph: {
    title: "Terms of Service | PagePulse",
    description: "Rules and conditions for using PagePulse.",
  },
};

export default function TermsPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold text-white">Terms of Service</h1>
        <p className="mt-4 text-sm text-gray-500">
          Last updated: March 16, 2026
        </p>

        <div className="mt-12 space-y-10 text-gray-300">
          <section>
            <h2 className="text-xl font-semibold text-white">
              1. Acceptance of Terms
            </h2>
            <p className="mt-3 text-sm leading-relaxed">
              By accessing or using PagePulse (&quot;the Service&quot;),
              operated by NorwegianSpark SA (Org. 834 984 172), you agree to be
              bound by these Terms of Service. If you do not agree, do not use
              the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              2. Description of Service
            </h2>
            <p className="mt-3 text-sm leading-relaxed">
              PagePulse provides automated web analysis including SEO auditing,
              performance scoring, and accessibility testing via a web dashboard
              and REST API.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">3. Accounts</h2>
            <p className="mt-3 text-sm leading-relaxed">
              You must provide a valid email address to create an account. You
              are responsible for maintaining the confidentiality of your
              credentials and API keys. You are liable for all activity under
              your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              4. Acceptable Use
            </h2>
            <p className="mt-3 text-sm leading-relaxed">You agree not to:</p>
            <ul className="mt-2 list-disc space-y-2 pl-6 text-sm leading-relaxed">
              <li>Use the Service for any unlawful purpose.</li>
              <li>
                Submit URLs for analysis that contain malware or exploit code.
              </li>
              <li>Attempt to circumvent rate limits or abuse the free tier.</li>
              <li>
                Resell or redistribute analysis results as a competing service.
              </li>
              <li>
                Reverse-engineer, decompile, or otherwise attempt to derive the
                source code of the Service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              5. Pricing and Payment
            </h2>
            <p className="mt-3 text-sm leading-relaxed">
              Free accounts include 2 analyses per month. Pro plans are billed
              monthly or annually via Stripe. Prices may change with 30 days
              notice. Refunds are provided on a case-by-case basis within 14
              days of payment.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">6. API Usage</h2>
            <p className="mt-3 text-sm leading-relaxed">
              API access is available to Pro plan subscribers. API keys must be
              kept confidential. Rate limits apply as documented. Excessive
              usage beyond plan limits may result in throttling or account
              suspension.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              7. Intellectual Property
            </h2>
            <p className="mt-3 text-sm leading-relaxed">
              The Service, its design, code, and content are the intellectual
              property of NorwegianSpark SA. Analysis results generated for you
              belong to you. You grant us a limited license to process the URLs
              you submit for the purpose of providing the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              8. Limitation of Liability
            </h2>
            <p className="mt-3 text-sm leading-relaxed">
              The Service is provided &quot;as is&quot; without warranties of
              any kind. NorwegianSpark SA is not liable for any indirect,
              incidental, or consequential damages. Our total liability is
              limited to the fees you paid in the preceding 12 months.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">9. Termination</h2>
            <p className="mt-3 text-sm leading-relaxed">
              Either party may terminate this agreement at any time. You can
              delete your account from the account settings page. We may suspend
              or terminate accounts that violate these terms. Upon termination,
              your data will be deleted in accordance with our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              10. Governing Law
            </h2>
            <p className="mt-3 text-sm leading-relaxed">
              These terms are governed by the laws of Norway. Disputes shall be
              resolved in the courts of Norway.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">11. Contact</h2>
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
