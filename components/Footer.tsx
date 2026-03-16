import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-gray-800 bg-gray-950">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div>
            <h3 className="text-lg font-semibold text-white">PagePulse</h3>
            <p className="mt-2 text-sm text-gray-400">
              AI-powered web analysis for modern teams.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              Product
            </h4>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/pricing"
                  className="text-sm text-gray-300 hover:text-white"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/api-docs"
                  className="text-sm text-gray-300 hover:text-white"
                >
                  API Docs
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="text-sm text-gray-300 hover:text-white"
                >
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              Company
            </h4>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-gray-300 hover:text-white"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-gray-300 hover:text-white"
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              Contact
            </h4>
            <ul className="mt-4 space-y-2">
              <li className="text-sm text-gray-300">
                <a
                  href="mailto:norwegianspark@gmail.com"
                  className="hover:text-white"
                >
                  norwegianspark@gmail.com
                </a>
              </li>
              <li className="text-sm text-gray-300">
                <a href="tel:+4799737467" className="hover:text-white">
                  +47 99 73 74 67
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-gray-800 pt-8 text-center text-sm text-gray-500">
          <p>
            &copy; {new Date().getFullYear()} NorwegianSpark SA | Org. 834 984
            172 | norwegianspark@gmail.com | +47 99 73 74 67
          </p>
        </div>
      </div>
    </footer>
  );
}
