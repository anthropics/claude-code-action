import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "GlobalCard cookie policy. Learn about the cookies we use and how to manage your preferences.",
};

export default function CookiesPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-background pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-3xl">
          <h1 className="text-4xl font-black text-foreground tracking-tight mb-2">
            Cookie Policy
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            Last updated: March 2026
          </p>

          <div className="prose prose-neutral max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                1. What Are Cookies
              </h2>
              <p>
                Cookies are small text files stored on your device when you
                visit a website. They help the site remember your preferences
                and understand how you interact with the content. GlobalCard
                uses cookies to provide a better user experience, analyze
                traffic, and ensure the security of our platform.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                2. Cookies We Use
              </h2>

              <h3 className="text-base font-bold text-foreground mt-4 mb-2">
                Essential Cookies
              </h3>
              <p>
                These cookies are necessary for the website to function
                properly. They enable core features like page navigation, access
                to secure areas, and session management. You cannot opt out of
                essential cookies as the site cannot operate without them.
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>
                  <strong className="text-foreground">Session ID</strong> —
                  maintains your authenticated session (expires when browser
                  closes)
                </li>
                <li>
                  <strong className="text-foreground">CSRF token</strong> —
                  protects against cross-site request forgery (expires per
                  session)
                </li>
                <li>
                  <strong className="text-foreground">Cookie consent</strong> —
                  stores your cookie preferences (expires after 12 months)
                </li>
              </ul>

              <h3 className="text-base font-bold text-foreground mt-4 mb-2">
                Analytical Cookies
              </h3>
              <p>
                These cookies help us understand how visitors interact with
                GlobalCard by collecting and reporting information anonymously.
                We use this data to improve our website and services.
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>
                  <strong className="text-foreground">Page views</strong> —
                  tracks which pages are visited and for how long
                </li>
                <li>
                  <strong className="text-foreground">Referral source</strong> —
                  identifies how visitors arrive at our site
                </li>
                <li>
                  <strong className="text-foreground">
                    Device information
                  </strong>{" "}
                  — browser type, screen resolution, and operating system
                </li>
              </ul>

              <h3 className="text-base font-bold text-foreground mt-4 mb-2">
                Functional Cookies
              </h3>
              <p>
                These cookies enable enhanced functionality and personalization,
                such as remembering your preferred language or region settings.
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>
                  <strong className="text-foreground">
                    Language preference
                  </strong>{" "}
                  — remembers your language selection (expires after 12 months)
                </li>
                <li>
                  <strong className="text-foreground">UI preferences</strong> —
                  stores display settings like theme (expires after 12 months)
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                3. Third-Party Cookies
              </h2>
              <p>
                Some cookies are placed by third-party services that appear on
                our pages. We use the following third-party services that may
                set cookies:
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>
                  <strong className="text-foreground">Stripe</strong> — payment
                  processing cookies for secure transactions
                </li>
                <li>
                  <strong className="text-foreground">Vercel Analytics</strong>{" "}
                  — privacy-focused web analytics (no personal data collected)
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                4. Managing Cookies
              </h2>
              <p>You can control and manage cookies in several ways:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>
                  <strong className="text-foreground">Browser settings:</strong>{" "}
                  Most browsers allow you to view, delete, and block cookies
                  from websites. Note that blocking all cookies may impact the
                  functionality of GlobalCard.
                </li>
                <li>
                  <strong className="text-foreground">Opt-out tools:</strong>{" "}
                  For analytical cookies, you can opt out through your
                  browser&apos;s Do Not Track setting, which we respect.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                5. Cookie Retention
              </h2>
              <p>
                Session cookies are deleted when you close your browser.
                Persistent cookies remain on your device for the period
                specified above or until you manually delete them. We review our
                cookie usage periodically and remove any cookies that are no
                longer necessary.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                6. Updates to This Policy
              </h2>
              <p>
                We may update this Cookie Policy from time to time to reflect
                changes in technology, legislation, or our data practices. We
                encourage you to review this page periodically for the latest
                information.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">
                7. Contact
              </h2>
              <p>If you have questions about our use of cookies, contact:</p>
              <p className="mt-2">
                NorwegianSpark SA
                <br />
                Org. 834 984 172
                <br />
                Email:{" "}
                <a
                  href="mailto:norwegianspark@gmail.com"
                  className="text-primary hover:underline"
                >
                  norwegianspark@gmail.com
                </a>
                <br />
                Phone: +47 99 73 74 67
              </p>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
