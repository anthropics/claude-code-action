"use client";

import Link from "next/link";
import { useState } from "react";

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold text-white">
          PagePulse
        </Link>
        <div className="hidden items-center gap-6 md:flex">
          <Link
            href="/pricing"
            className="text-sm text-gray-300 hover:text-white"
          >
            Pricing
          </Link>
          <Link
            href="/api-docs"
            className="text-sm text-gray-300 hover:text-white"
          >
            API Docs
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-gray-300 hover:text-white"
          >
            Dashboard
          </Link>
          <Link
            href="/login"
            className="text-sm text-gray-300 hover:text-white"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Get Started
          </Link>
        </div>
        <button
          className="text-gray-300 md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            {mobileOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </nav>
      {mobileOpen && (
        <div className="border-t border-gray-800 px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            <Link
              href="/pricing"
              className="text-sm text-gray-300 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              Pricing
            </Link>
            <Link
              href="/api-docs"
              className="text-sm text-gray-300 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              API Docs
            </Link>
            <Link
              href="/dashboard"
              className="text-sm text-gray-300 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              Dashboard
            </Link>
            <Link
              href="/login"
              className="text-sm text-gray-300 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand-700"
              onClick={() => setMobileOpen(false)}
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
