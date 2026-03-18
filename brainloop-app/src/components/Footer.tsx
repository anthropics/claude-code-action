'use client'

import Link from 'next/link'
import { Mail, Phone, Building2 } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-dark-900/80 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="text-xl font-bold gradient-text mb-3">BrainLoop</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Smart Apps for Curious Minds. A suite of intelligent applications
              designed to boost your productivity, learning, and daily life.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
              Legal
            </h4>
            <ul className="space-y-2">
              <li>
                <Link href="/privacy" className="text-sm text-slate-400 hover:text-purple-400 transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm text-slate-400 hover:text-purple-400 transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
              Contact
            </h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-sm text-slate-400">
                <Building2 size={14} className="text-purple-400 flex-shrink-0" />
                <span>NorwegianSpark SA &middot; Org. 834 984 172</span>
              </li>
              <li>
                <a href="mailto:norwegianspark@gmail.com" className="flex items-center gap-2 text-sm text-slate-400 hover:text-purple-400 transition-colors">
                  <Mail size={14} className="text-purple-400 flex-shrink-0" />
                  norwegianspark@gmail.com
                </a>
              </li>
              <li>
                <a href="tel:+4799737467" className="flex items-center gap-2 text-sm text-slate-400 hover:text-purple-400 transition-colors">
                  <Phone size={14} className="text-purple-400 flex-shrink-0" />
                  +47 99 73 74 67
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            &copy; {new Date().getFullYear()} NorwegianSpark SA. All rights reserved.
          </p>
          <p className="text-xs text-slate-500">
            Org. 834 984 172 &middot; norwegianspark@gmail.com &middot; +47 99 73 74 67
          </p>
        </div>
      </div>
    </footer>
  )
}
