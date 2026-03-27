"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Check,
  Flame,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "bl_habits";

const EMOJI_OPTIONS = [
  "\uD83D\uDCAA", "\uD83D\uDCD6", "\uD83C\uDFC3", "\uD83E\uDDD8", "\uD83D\uDCA7",
  "\uD83C\uDF4E", "\uD83D\uDCA4", "\u270D\uFE0F", "\uD83C\uDFB5", "\uD83C\uDF1E",
  "\uD83E\uDDE0", "\uD83D\uDE4F", "\uD83C\uDF31", "\uD83D\uDCBB", "\uD83C\uDFA8",
  "\uD83D\uDCDA", "\uD83C\uDFAF", "\u2764\uFE0F", "\uD83D\uDE80", "\uD83C\uDF0D",
  "\uD83D\uDD25", "\u2B50", "\uD83C\uDF1C", "\uD83E\uDD19",
];

const COLOR_OPTIONS = [
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#f43f5e",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#10b981",
];

interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  completedDates: string[];
  createdAt: string;
}

function getTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2);
}

function calculateStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0;
  const sorted = [...completedDates].sort().reverse();
  const today = getTodayStr();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  if (sorted[0] !== today && sorted[0] !== yesterdayStr) return 0;

  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + "T00:00:00");
    const curr = new Date(sorted[i] + "T00:00:00");
    const diffDays = Math.round(
      (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export default function HabitTracker() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJI_OPTIONS[0]);
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHabits(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  const persist = useCallback(
    (updated: Habit[]) => {
      setHabits(updated);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
    },
    []
  );

  const addHabit = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error("Please enter a habit name");
      return;
    }
    const habit: Habit = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: trimmed,
      emoji: selectedEmoji,
      color: selectedColor,
      completedDates: [],
      createdAt: new Date().toISOString(),
    };
    persist([...habits, habit]);
    setNewName("");
    setSelectedEmoji(EMOJI_OPTIONS[0]);
    setSelectedColor(COLOR_OPTIONS[0]);
    setShowForm(false);
    toast.success(`"${trimmed}" added to your habits!`);
  };

  const deleteHabit = (id: string, name: string) => {
    persist(habits.filter((h) => h.id !== id));
    toast.success(`"${name}" removed`);
  };

  const toggleToday = (id: string) => {
    const today = getTodayStr();
    persist(
      habits.map((h) => {
        if (h.id !== id) return h;
        const done = h.completedDates.includes(today);
        return {
          ...h,
          completedDates: done
            ? h.completedDates.filter((d) => d !== today)
            : [...h.completedDates, today],
        };
      })
    );
  };

  const last7 = getLast7Days();
  const today = getTodayStr();

  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="text-center mb-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-green-400" />
            <span className="text-sm font-medium text-green-400 tracking-wider uppercase">
              BrainLoop
            </span>
            <Sparkles className="w-5 h-5 text-green-400" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            Habit Tracker
          </h1>
          <p className="text-gray-400 text-sm sm:text-base">
            Build consistency. Track streaks. Achieve your goals.
          </p>
        </motion.div>
      </div>

      {/* Add Habit Button / Form */}
      <div className="mb-8">
        <AnimatePresence mode="wait">
          {!showForm ? (
            <motion.button
              key="add-btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForm(true)}
              className="w-full glass-card p-4 flex items-center justify-center gap-2 text-green-400 hover:text-green-300 hover:border-green-500/30 transition-all group cursor-pointer"
            >
              <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
              <span className="font-medium">Add New Habit</span>
            </motion.button>
          ) : (
            <motion.div
              key="add-form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="glass-card p-5 green-glow-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  New Habit
                </h2>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <ChevronUp className="w-5 h-5" />
                </button>
              </div>

              {/* Name input */}
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addHabit()}
                placeholder="Habit name (e.g. Meditate 10 min)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 mb-4 focus:border-green-500/50 transition-colors"
                autoFocus
                maxLength={50}
              />

              {/* Emoji Picker */}
              <div className="mb-4">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="flex items-center gap-2 text-sm text-gray-300 mb-2 hover:text-white transition-colors"
                >
                  <span className="text-2xl">{selectedEmoji}</span>
                  <span>Choose emoji</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${showEmojiPicker ? "rotate-180" : ""}`}
                  />
                </button>
                <AnimatePresence>
                  {showEmojiPicker && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex flex-wrap gap-2"
                    >
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            setSelectedEmoji(emoji);
                            setShowEmojiPicker(false);
                          }}
                          className={`text-2xl p-2 rounded-lg hover:bg-white/10 transition-colors ${
                            selectedEmoji === emoji
                              ? "bg-white/15 ring-2 ring-green-500/50"
                              : ""
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Color Picker */}
              <div className="mb-5">
                <p className="text-sm text-gray-300 mb-2">Color</p>
                <div className="flex flex-wrap gap-3">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className="w-8 h-8 rounded-full transition-transform hover:scale-110"
                      style={{
                        backgroundColor: color,
                        boxShadow:
                          selectedColor === color
                            ? `0 0 0 3px #0a0a1a, 0 0 0 5px ${color}`
                            : "none",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={addHabit}
                className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Add Habit
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Habit List */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {habits.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 text-gray-500"
            >
              <p className="text-lg mb-1">No habits yet</p>
              <p className="text-sm">
                Add your first habit to start tracking!
              </p>
            </motion.div>
          )}
          {habits.map((habit) => {
            const isCompletedToday = habit.completedDates.includes(today);
            const streak = calculateStreak(habit.completedDates);

            return (
              <motion.div
                key={habit.id}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, x: -100 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="glass-card p-4 sm:p-5"
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  {/* Check Button */}
                  <motion.button
                    onClick={() => {
                      toggleToday(habit.id);
                      if (!isCompletedToday) {
                        toast.success(`${habit.emoji} ${habit.name} - Done!`);
                      }
                    }}
                    whileTap={{ scale: 0.85 }}
                    className="flex-shrink-0 mt-0.5"
                  >
                    <motion.div
                      animate={{
                        backgroundColor: isCompletedToday
                          ? habit.color
                          : "transparent",
                        borderColor: isCompletedToday
                          ? habit.color
                          : "rgba(255,255,255,0.2)",
                      }}
                      transition={{ duration: 0.2 }}
                      className="w-10 h-10 rounded-full border-2 flex items-center justify-center"
                      style={
                        isCompletedToday
                          ? {
                              boxShadow: `0 0 12px ${habit.color}50`,
                            }
                          : {}
                      }
                    >
                      <AnimatePresence>
                        {isCompletedToday && (
                          <motion.div
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0, rotate: 90 }}
                            transition={{
                              type: "spring",
                              stiffness: 400,
                              damping: 15,
                            }}
                          >
                            <Check className="w-5 h-5 text-white" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </motion.button>

                  {/* Habit Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{habit.emoji}</span>
                      <h3
                        className={`font-semibold truncate ${
                          isCompletedToday
                            ? "text-white"
                            : "text-gray-200"
                        }`}
                      >
                        {habit.name}
                      </h3>
                    </div>

                    {/* Streak */}
                    {streak > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-1 mb-3"
                      >
                        <Flame
                          className="w-4 h-4"
                          style={{ color: habit.color }}
                        />
                        <span
                          className="text-sm font-medium"
                          style={{ color: habit.color }}
                        >
                          {streak} day{streak !== 1 ? "s" : ""} streak
                        </span>
                      </motion.div>
                    )}
                    {streak === 0 && <div className="mb-3" />}

                    {/* 7-day grid */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {last7.map((day) => {
                        const done = habit.completedDates.includes(day);
                        const isToday = day === today;
                        return (
                          <div
                            key={day}
                            className="flex flex-col items-center gap-1"
                          >
                            <span className="text-[10px] text-gray-500 font-medium">
                              {getDayLabel(day)}
                            </span>
                            <motion.div
                              animate={{
                                backgroundColor: done
                                  ? habit.color
                                  : "rgba(255,255,255,0.06)",
                                scale: done ? 1 : 0.85,
                              }}
                              transition={{ duration: 0.2 }}
                              className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full ${
                                isToday
                                  ? "ring-2 ring-white/20"
                                  : ""
                              }`}
                              style={
                                done
                                  ? {
                                      boxShadow: `0 0 8px ${habit.color}40`,
                                    }
                                  : {}
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => deleteHabit(habit.id, habit.name)}
                    className="flex-shrink-0 p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete habit"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
