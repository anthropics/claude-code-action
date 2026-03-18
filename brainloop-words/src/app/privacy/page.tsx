import Link from "next/link";
import { Brain, ArrowLeft, Shield } from "lucide-react";

export const metadata = {
  title: "Privacy Policy | BrainLoop Word Game",
  description: "Privacy Policy for BrainLoop Word Game by NorwegianSpark SA.",
};

export default function PrivacyPolicy() {
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
          <Shield className="w-8 h-8 text-emerald-400" />
          <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
        </div>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-gray-300">
          <p className="text-gray-400 text-sm">
            Last updated: March 18, 2026
          </p>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">1. Introduction</h2>
            <p>
              NorwegianSpark SA (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates the BrainLoop Word Game
              available at words.brainloop.games. This Privacy Policy explains how we
              collect, use, and protect your information when you use our service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">2. Information We Collect</h2>
            <p>
              <strong className="text-white">Game Data:</strong> Your game statistics (games played,
              win percentage, streak data, and guess distribution) are stored locally in
              your browser using localStorage. This data never leaves your device.
            </p>
            <p>
              <strong className="text-white">Technical Data:</strong> We may collect standard
              server logs including IP addresses, browser type, and access times for
              security and analytics purposes.
            </p>
            <p>
              We do not collect personal information such as names, email addresses, or
              account details. No registration is required to play the game.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">3. Cookies and Local Storage</h2>
            <p>
              We use browser localStorage to save your game progress and statistics.
              This data is stored entirely on your device and is not transmitted to our
              servers. You can clear this data at any time through your browser settings.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">4. Third-Party Services</h2>
            <p>
              We may use third-party hosting and analytics services. These services may
              collect anonymized usage data in accordance with their own privacy policies.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">5. Data Security</h2>
            <p>
              We implement appropriate security measures including security headers
              (X-Frame-Options, Content-Security-Policy, etc.) to protect against
              common web vulnerabilities.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">6. Children&apos;s Privacy</h2>
            <p>
              Our game is suitable for all ages. We do not knowingly collect personal
              information from children. Since the game requires no registration and
              stores data only locally, no personal data is collected from any user.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">7. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be
              posted on this page with an updated revision date.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">8. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us:
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
