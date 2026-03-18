"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Flame,
  Save,
  Trash2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sparkles,
  Calendar,
  Mail,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface JournalEntry {
  id: string;
  date: string;
  mood: string;
  prompt: string;
  text: string;
  createdAt: string;
}

const MOODS = [
  { emoji: "\ud83d\ude0a", label: "Great" },
  { emoji: "\ud83d\ude42", label: "Good" },
  { emoji: "\ud83d\ude10", label: "Okay" },
  { emoji: "\ud83d\ude14", label: "Low" },
  { emoji: "\ud83d\ude22", label: "Rough" },
];

const PROMPTS = [
  "What are you grateful for today?",
  "Describe a moment that made you smile.",
  "What challenge did you overcome?",
  "What would your ideal day look like?",
  "Write a letter to your future self.",
  "What is something new you learned recently?",
  "Describe a person who inspires you and why.",
  "What are three things that went well today?",
  "What would you do if you had no fear?",
  "Describe your happiest memory.",
  "What is a goal you are working toward?",
  "Write about a place that feels like home.",
  "What advice would you give your younger self?",
  "What does your perfect morning look like?",
  "Describe something beautiful you noticed today.",
  "What is a habit you want to build?",
  "Write about someone who made a difference in your life.",
  "What are you most proud of this week?",
  "Describe a book, movie, or song that changed your perspective.",
  "What does success mean to you?",
  "Write about a time you stepped outside your comfort zone.",
  "What brings you peace?",
  "Describe your favorite season and why you love it.",
  "What is something you want to forgive yourself for?",
  "Write about a dream you had recently.",
  "What are you looking forward to?",
  "Describe a skill you would love to master.",
  "What does self-care look like for you?",
  "Write about a turning point in your life.",
  "What makes you feel most alive?",
  "Describe your ideal weekend.",
  "What is a boundary you need to set?",
  "Write about a small victory you had today.",
  "What legacy do you want to leave behind?",
  "Describe the view from your favorite spot.",
];

const STORAGE_KEY = "bl_journal";

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function getRandomPrompt(exclude?: string): string {
  const filtered = exclude ? PROMPTS.filter((p) => p !== exclude) : PROMPTS;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedMood, setSelectedMood] = useState<string>("");
  const [currentPrompt, setCurrentPrompt] = useState<string>("");
  const [entryText, setEntryText] = useState<string>("");
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setEntries(JSON.parse(stored));
      } catch {
        setEntries([]);
      }
    }
    setCurrentPrompt(getRandomPrompt());
  }, []);

  const saveEntries = useCallback((updated: JournalEntry[]) => {
    setEntries(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const today = getToday();

  const todayEntry = entries.find((e) => e.date === today);

  const calculateStreak = (): number => {
    if (entries.length === 0) return 0;
    const dates = Array.from(new Set(entries.map((e) => e.date))).sort().reverse();
    let streak = 0;
    const now = new Date();
    const checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (let i = 0; i < dates.length; i++) {
      const entryDate = new Date(dates[i] + "T12:00:00");
      const expected = new Date(checkDate);
      expected.setDate(expected.getDate() - i);
      const expectedStr = expected.toISOString().split("T")[0];
      if (dates[i] === expectedStr) {
        streak++;
      } else if (i === 0) {
        const yesterday = new Date(checkDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];
        if (dates[i] === yesterdayStr) {
          streak++;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    return streak;
  };

  const handleSave = () => {
    if (!entryText.trim()) {
      toast.error("Please write something in your journal entry.");
      return;
    }
    if (!selectedMood) {
      toast.error("Please select your mood for today.");
      return;
    }

    const newEntry: JournalEntry = {
      id: generateId(),
      date: today,
      mood: selectedMood,
      prompt: currentPrompt,
      text: entryText.trim(),
      createdAt: new Date().toISOString(),
    };

    const filtered = entries.filter((e) => e.date !== today);
    const updated = [newEntry, ...filtered];
    saveEntries(updated);
    toast.success("Journal entry saved!");
  };

  const handleDelete = (id: string) => {
    const updated = entries.filter((e) => e.id !== id);
    saveEntries(updated);
    if (expandedEntryId === id) setExpandedEntryId(null);
    toast.success("Entry deleted.");
  };

  const handleNewPrompt = () => {
    setCurrentPrompt(getRandomPrompt(currentPrompt));
  };

  const streak = calculateStreak();
  const pastEntries = entries
    .filter((e) => e.date !== today)
    .sort((a, b) => b.date.localeCompare(a.date));

  useEffect(() => {
    if (todayEntry && mounted) {
      setSelectedMood(todayEntry.mood);
      setEntryText(todayEntry.text);
      setCurrentPrompt(todayEntry.prompt);
    }
  }, [todayEntry, mounted]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center">
        <div className="text-teal-400 animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-dark">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <div className="flex items-center justify-center gap-3 mb-2">
            <BookOpen className="w-8 h-8 text-teal-400" />
            <h1 className="text-3xl sm:text-4xl font-bold gradient-text">
              BrainLoop Daily Journal
            </h1>
          </div>
          <p className="text-slate-400 text-sm">
            Reflect, grow, and track your journey
          </p>
        </motion.header>

        {/* Date & Streak */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8"
        >
          <div className="flex items-center gap-2 text-slate-300">
            <Calendar className="w-5 h-5 text-teal-400" />
            <span className="text-lg font-medium">{formatDisplayDate(today)}</span>
          </div>
          <div className="flex items-center gap-2 glass rounded-full px-5 py-2">
            <Flame className="w-5 h-5 text-orange-400" />
            <span className="text-white font-semibold">{streak}</span>
            <span className="text-slate-400 text-sm">
              day{streak !== 1 ? "s" : ""} streak
            </span>
          </div>
        </motion.div>

        {/* Writing Prompt */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="glass rounded-2xl p-6 mb-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Sparkles className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs uppercase tracking-wider text-teal-400 font-medium mb-1">
                  Today&apos;s Prompt
                </p>
                <p className="text-white text-lg font-medium">{currentPrompt}</p>
              </div>
            </div>
            <button
              onClick={handleNewPrompt}
              className="shrink-0 p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-teal-400 transition-colors"
              title="New Prompt"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </motion.div>

        {/* Mood Picker */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="glass rounded-2xl p-6 mb-6"
        >
          <p className="text-sm text-slate-400 mb-4">How are you feeling today?</p>
          <div className="flex flex-wrap gap-3">
            {MOODS.map((mood) => (
              <button
                key={mood.label}
                onClick={() => setSelectedMood(mood.emoji)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all duration-200 ${
                  selectedMood === mood.emoji
                    ? "border-teal-400 bg-teal-400/10 shadow-lg shadow-teal-400/10"
                    : "border-white/10 hover:border-white/25 hover:bg-white/5"
                }`}
              >
                <span className="text-xl">{mood.emoji}</span>
                <span
                  className={`text-sm font-medium ${
                    selectedMood === mood.emoji ? "text-teal-300" : "text-slate-300"
                  }`}
                >
                  {mood.label}
                </span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Text Area */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="glass rounded-2xl p-6 mb-6"
        >
          <textarea
            value={entryText}
            onChange={(e) => setEntryText(e.target.value)}
            placeholder="Start writing your thoughts..."
            rows={8}
            className="w-full bg-transparent text-slate-200 placeholder-slate-600 resize-none text-base leading-relaxed border border-white/10 rounded-xl p-4 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 transition-all"
          />
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-slate-500">
              {entryText.length} character{entryText.length !== 1 ? "s" : ""}
            </span>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-medium rounded-xl hover:from-teal-400 hover:to-cyan-400 transition-all shadow-lg shadow-teal-500/20"
            >
              <Save className="w-4 h-4" />
              {todayEntry ? "Update Entry" : "Save Entry"}
            </motion.button>
          </div>
        </motion.div>

        {/* Past Entries */}
        {pastEntries.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mt-12"
          >
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-teal-400" />
              Past Entries
            </h2>
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {pastEntries.map((entry) => {
                const isExpanded = expandedEntryId === entry.id;
                return (
                  <motion.div
                    key={entry.id}
                    layout
                    className="glass glass-hover rounded-xl overflow-hidden transition-all"
                  >
                    <button
                      onClick={() =>
                        setExpandedEntryId(isExpanded ? null : entry.id)
                      }
                      className="w-full flex items-center justify-between p-4 text-left"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-xl shrink-0">{entry.mood}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-teal-400 font-medium">
                            {formatDisplayDate(entry.date)}
                          </p>
                          {!isExpanded && (
                            <p className="text-sm text-slate-400 truncate mt-0.5">
                              {entry.text.substring(0, 100)}
                              {entry.text.length > 100 ? "..." : ""}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 ml-3 text-slate-500">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 border-t border-white/5 pt-4">
                            <p className="text-xs text-cyan-400 mb-2 italic">
                              Prompt: &quot;{entry.prompt}&quot;
                            </p>
                            <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                              {entry.text}
                            </p>
                            <div className="mt-4 flex justify-end">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(entry.id);
                                }}
                                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-400/10"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-16 pt-8 border-t border-white/5"
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-slate-500 text-sm font-medium">
              NorwegianSpark SA | Org. 834 984 172
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-500">
              <a
                href="mailto:norwegianspark@gmail.com"
                className="flex items-center gap-1.5 hover:text-teal-400 transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                norwegianspark@gmail.com
              </a>
              <a
                href="tel:+4799737467"
                className="flex items-center gap-1.5 hover:text-teal-400 transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                +47 99 73 74 67
              </a>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <Link
                href="/privacy"
                className="text-slate-500 hover:text-teal-400 transition-colors"
              >
                Privacy Policy
              </Link>
              <span className="text-slate-700">|</span>
              <Link
                href="/terms"
                className="text-slate-500 hover:text-teal-400 transition-colors"
              >
                Terms of Service
              </Link>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              &copy; {new Date().getFullYear()} BrainLoop by NorwegianSpark SA. All
              rights reserved.
            </p>
          </div>
        </motion.footer>
      </div>
    </div>
  );
}
