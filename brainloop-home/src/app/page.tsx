'use client'

import { useState, FormEvent } from 'react'
import {
  Brain,
  Sparkles,
  Trophy,
  Moon,
  Target,
  Timer,
  Type,
  MessageCircle,
  Wallet,
  BookOpen,
  ArrowRight,
  Zap,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import Footer from '@/components/Footer'

const apps = [
  {
    name: 'Flashcards',
    description: 'Master any subject with smart spaced repetition flashcards.',
    href: 'https://flashcards.brainloop.games',
    icon: Brain,
    color: 'from-purple-500 to-purple-700',
    bgGlow: 'group-hover:shadow-purple-500/20',
    iconColor: 'text-purple-400',
  },
  {
    name: 'Oracle',
    description: 'Get AI-powered insights and answers to your burning questions.',
    href: 'https://oracle.brainloop.games',
    icon: Sparkles,
    color: 'from-indigo-500 to-indigo-700',
    bgGlow: 'group-hover:shadow-indigo-500/20',
    iconColor: 'text-indigo-400',
  },
  {
    name: 'Trivia Battle',
    description: 'Challenge friends and climb the leaderboard with trivia quizzes.',
    href: 'https://trivia.brainloop.games',
    icon: Trophy,
    color: 'from-amber-500 to-amber-700',
    bgGlow: 'group-hover:shadow-amber-500/20',
    iconColor: 'text-amber-400',
  },
  {
    name: 'Tarot',
    description: 'Explore tarot card readings with beautiful interpretations.',
    href: 'https://tarot.brainloop.games',
    icon: Moon,
    color: 'from-violet-500 to-violet-700',
    bgGlow: 'group-hover:shadow-violet-500/20',
    iconColor: 'text-violet-400',
  },
  {
    name: 'Habit Tracker',
    description: 'Build lasting habits with streaks, reminders, and analytics.',
    href: 'https://habits.brainloop.games',
    icon: Target,
    color: 'from-green-500 to-green-700',
    bgGlow: 'group-hover:shadow-green-500/20',
    iconColor: 'text-green-400',
  },
  {
    name: 'Productivity',
    description: 'Stay focused with Pomodoro timers and productivity tools.',
    href: 'https://focus.brainloop.games',
    icon: Timer,
    color: 'from-blue-500 to-blue-700',
    bgGlow: 'group-hover:shadow-blue-500/20',
    iconColor: 'text-blue-400',
  },
  {
    name: 'Word Game',
    description: 'Expand your vocabulary with fun and challenging word puzzles.',
    href: 'https://words.brainloop.games',
    icon: Type,
    color: 'from-emerald-500 to-emerald-700',
    bgGlow: 'group-hover:shadow-emerald-500/20',
    iconColor: 'text-emerald-400',
  },
  {
    name: 'AI Advisor',
    description: 'Get personalized advice powered by artificial intelligence.',
    href: 'https://advisor.brainloop.games',
    icon: MessageCircle,
    color: 'from-rose-500 to-rose-700',
    bgGlow: 'group-hover:shadow-rose-500/20',
    iconColor: 'text-rose-400',
  },
  {
    name: 'Finance',
    description: 'Track expenses, set budgets, and take control of your finances.',
    href: 'https://finance.brainloop.games',
    icon: Wallet,
    color: 'from-orange-500 to-orange-700',
    bgGlow: 'group-hover:shadow-orange-500/20',
    iconColor: 'text-orange-400',
  },
  {
    name: 'Daily Journal',
    description: 'Reflect on your day with guided journaling and mood tracking.',
    href: 'https://journal.brainloop.games',
    icon: BookOpen,
    color: 'from-teal-500 to-teal-700',
    bgGlow: 'group-hover:shadow-teal-500/20',
    iconColor: 'text-teal-400',
  },
]

const marqueeItems = apps.map((app) => app.name)

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: 'easeOut' },
  }),
}

export default function HomePage() {
  const [email, setEmail] = useState('')

  function handleWaitlist(e: FormEvent) {
    e.preventDefault()
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address.')
      return
    }

    const existing = JSON.parse(localStorage.getItem('brainloop-waitlist') || '[]')
    if (existing.includes(email)) {
      toast.info('You are already on the waitlist!')
      return
    }

    existing.push(email)
    localStorage.setItem('brainloop-waitlist', JSON.stringify(existing))
    toast.success('Welcome to the BrainLoop waitlist!')
    setEmail('')
  }

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 pt-20 pb-16 md:pt-32 md:pb-24">
        {/* Background glow effects */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-cyan-600/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-5xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-slate-300 backdrop-blur-sm">
              <Zap size={14} className="text-purple-400" />
              10 smart apps, one ecosystem
            </div>
          </motion.div>

          <motion.h1
            className="text-5xl font-extrabold tracking-tight sm:text-7xl md:text-8xl"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            <span className="gradient-text">BrainLoop</span>
          </motion.h1>

          <motion.p
            className="mt-6 text-xl text-slate-400 sm:text-2xl md:text-3xl font-light"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            Smart Apps for Curious Minds
          </motion.p>

          <motion.p
            className="mt-4 max-w-2xl mx-auto text-base text-slate-500 md:text-lg leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
          >
            A curated suite of intelligent applications designed to boost your
            learning, productivity, creativity, and daily well-being.
          </motion.p>

          <motion.div
            className="mt-8 flex justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <a
              href="#apps"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition-all hover:shadow-purple-500/40 hover:scale-105"
            >
              Explore Apps
              <ArrowRight size={16} />
            </a>
            <a
              href="#waitlist"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-300 backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/20"
            >
              Join Waitlist
            </a>
          </motion.div>
        </div>
      </section>

      {/* Marquee Section */}
      <section className="py-8 border-y border-white/5">
        <div className="marquee-container">
          <div className="inline-flex animate-marquee">
            {[...marqueeItems, ...marqueeItems].map((item, i) => (
              <span
                key={i}
                className="mx-8 text-lg font-semibold text-slate-600 whitespace-nowrap"
              >
                {item}
                <span className="ml-8 text-purple-500/40">&bull;</span>
              </span>
            ))}
          </div>
          <div className="inline-flex animate-marquee2 absolute top-0">
            {[...marqueeItems, ...marqueeItems].map((item, i) => (
              <span
                key={`dup-${i}`}
                className="mx-8 text-lg font-semibold text-slate-600 whitespace-nowrap"
              >
                {item}
                <span className="ml-8 text-purple-500/40">&bull;</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Apps Grid */}
      <section id="apps" className="px-6 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl">
              The <span className="gradient-text">BrainLoop</span> Suite
            </h2>
            <p className="mt-3 text-slate-400 text-lg">
              Tap into any app to get started — all free, all fast, all smart.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {apps.map((app, i) => {
              const Icon = app.icon
              return (
                <motion.a
                  key={app.name}
                  href={app.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group glass-card rounded-2xl p-6 block ${app.bgGlow} hover:shadow-2xl`}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: '-50px' }}
                  variants={fadeInUp}
                >
                  <div
                    className={`mb-4 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${app.color} shadow-lg`}
                  >
                    <Icon size={22} className="text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-100 group-hover:text-white transition-colors">
                    {app.name}
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    {app.description}
                  </p>
                  <div className="mt-4 flex items-center gap-1 text-xs font-medium text-slate-500 group-hover:text-purple-400 transition-colors">
                    Open app
                    <ArrowRight size={12} />
                  </div>
                </motion.a>
              )
            })}
          </div>
        </div>
      </section>

      {/* Waitlist Section */}
      <section
        id="waitlist"
        className="relative px-6 py-20 md:py-28 overflow-hidden"
      >
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-purple-600/8 rounded-full blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl font-bold sm:text-4xl">
              Stay in the <span className="gradient-text">Loop</span>
            </h2>
            <p className="mt-4 text-slate-400">
              Join our waitlist to get early access to new apps, features, and
              updates from the BrainLoop ecosystem.
            </p>

            <form
              onSubmit={handleWaitlist}
              className="mt-8 flex flex-col sm:flex-row gap-3"
            >
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 placeholder-slate-500 backdrop-blur-sm transition-all focus:border-purple-500/50"
              />
              <button
                type="submit"
                className="rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 transition-all hover:shadow-purple-500/40 hover:scale-105 whitespace-nowrap"
              >
                Join Waitlist
              </button>
            </form>

            <p className="mt-4 text-xs text-slate-500">
              No spam, ever. We respect your privacy.
            </p>
          </motion.div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
