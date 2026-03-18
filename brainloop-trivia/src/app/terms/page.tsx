"use client";

import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-200">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Game
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <FileText className="h-8 w-8 text-amber-400" />
          <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
        </div>

        <div className="space-y-6 text-gray-300 leading-relaxed">
          <p className="text-sm text-gray-500">
            Last updated: March 18, 2026
          </p>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing and using BrainLoop Trivia Battle (&quot;the
              Game&quot;), available at trivia.brainloop.games, you agree to be
              bound by these Terms of Service. The Game is provided by
              NorwegianSpark SA (org. nr. 834 984 172), registered in Norway.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              2. Description of Service
            </h2>
            <p>
              BrainLoop Trivia Battle is a free-to-play, browser-based trivia
              game supporting 1 to 4 players in hot-seat mode. The Game
              includes trivia questions across multiple categories including
              Science, History, Geography, Entertainment, Sports, and
              Technology.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              3. Use of the Game
            </h2>
            <p>You agree to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>Use the Game for personal, non-commercial entertainment purposes.</li>
              <li>Not attempt to reverse engineer, decompile, or modify the Game.</li>
              <li>Not use automated scripts or bots to interact with the Game.</li>
              <li>Not exploit bugs or vulnerabilities in the Game.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              4. Intellectual Property
            </h2>
            <p>
              All content within the Game, including but not limited to text,
              graphics, code, design, questions, and the BrainLoop brand, is
              the intellectual property of NorwegianSpark SA and is protected by
              Norwegian and international copyright laws. You may not reproduce,
              distribute, or create derivative works without prior written
              consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              5. Disclaimer of Warranties
            </h2>
            <p>
              The Game is provided &quot;as is&quot; and &quot;as
              available&quot; without warranties of any kind, either express or
              implied. NorwegianSpark SA does not warrant that the Game will be
              uninterrupted, error-free, or free of harmful components.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              6. Limitation of Liability
            </h2>
            <p>
              To the fullest extent permitted by Norwegian law, NorwegianSpark
              SA shall not be liable for any indirect, incidental, special, or
              consequential damages arising from your use of or inability to use
              the Game.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              7. Modifications
            </h2>
            <p>
              NorwegianSpark SA reserves the right to modify, update, or
              discontinue the Game at any time without prior notice. We may also
              update these Terms of Service, with changes effective upon posting
              to this page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              8. Governing Law
            </h2>
            <p>
              These Terms are governed by and construed in accordance with the
              laws of Norway. Any disputes shall be subject to the exclusive
              jurisdiction of the Norwegian courts.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              9. Contact Information
            </h2>
            <p>For questions regarding these Terms, please contact us:</p>
            <ul className="mt-2 space-y-1 ml-4">
              <li>
                <strong>Company:</strong> NorwegianSpark SA
              </li>
              <li>
                <strong>Org. nr.:</strong> 834 984 172
              </li>
              <li>
                <strong>Email:</strong>{" "}
                <a
                  href="mailto:norwegianspark@gmail.com"
                  className="text-amber-400 hover:text-amber-300"
                >
                  norwegianspark@gmail.com
                </a>
              </li>
              <li>
                <strong>Phone:</strong>{" "}
                <a
                  href="tel:+4799737467"
                  className="text-amber-400 hover:text-amber-300"
                >
                  +47 99 73 74 67
                </a>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
