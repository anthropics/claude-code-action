import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'BrainLoop - Smart Apps for Curious Minds',
  description:
    'BrainLoop is a suite of intelligent apps by NorwegianSpark SA — flashcards, trivia, tarot, habit tracking, productivity tools, and more. Explore the full collection at brainloop.games.',
  keywords: [
    'BrainLoop',
    'smart apps',
    'flashcards',
    'trivia',
    'tarot',
    'habit tracker',
    'productivity',
    'NorwegianSpark',
  ],
  authors: [{ name: 'NorwegianSpark SA' }],
  metadataBase: new URL('https://brainloop.games'),
  openGraph: {
    title: 'BrainLoop - Smart Apps for Curious Minds',
    description:
      'Explore intelligent apps for learning, productivity, and fun. Built by NorwegianSpark SA.',
    url: 'https://brainloop.games',
    siteName: 'BrainLoop',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BrainLoop - Smart Apps for Curious Minds',
    description:
      'Explore intelligent apps for learning, productivity, and fun. Built by NorwegianSpark SA.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-dark-900 text-slate-100 antialiased`}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#14143a',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#f1f5f9',
            },
          }}
        />
      </body>
    </html>
  )
}
