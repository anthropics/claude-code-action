"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Play,
  Pause,
  RotateCcw,
  Brain,
  ListTodo,
  Timer,
  Filter,
  Flame,
  Coffee,
  Armchair,
  Mail,
  Phone,
} from "lucide-react";
import Link from "next/link";

// Types
interface Task {
  id: string;
  name: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
  createdAt: number;
}

interface SessionData {
  count: number;
  history: { date: string; sessions: number }[];
}

type TimerMode = "focus" | "shortBreak" | "longBreak";
type PriorityFilter = "all" | "high" | "medium" | "low";

const TIMER_DURATIONS: Record<TimerMode, number> = {
  focus: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

const TIMER_LABELS: Record<TimerMode, string> = {
  focus: "Focus",
  shortBreak: "Short Break",
  longBreak: "Long Break",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-400 bg-red-400/10 border-red-400/20",
  medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  low: "text-green-400 bg-green-400/10 border-green-400/20",
};

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-400",
  medium: "bg-yellow-400",
  low: "bg-green-400",
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function loadTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem("bl_tasks");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveTasks(tasks: Task[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem("bl_tasks", JSON.stringify(tasks));
}

function loadSessions(): SessionData {
  if (typeof window === "undefined") return { count: 0, history: [] };
  try {
    const stored = localStorage.getItem("bl_sessions");
    return stored ? JSON.parse(stored) : { count: 0, history: [] };
  } catch {
    return { count: 0, history: [] };
  }
}

function saveSessions(data: SessionData) {
  if (typeof window === "undefined") return;
  localStorage.setItem("bl_sessions", JSON.stringify(data));
}

// Timer Ring Component
function TimerRing({
  progress,
  size = 280,
  strokeWidth = 8,
  mode,
  isFlashing,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  mode: TimerMode;
  isFlashing: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  const modeColors: Record<TimerMode, string> = {
    focus: "#3b82f6",
    shortBreak: "#10b981",
    longBreak: "#8b5cf6",
  };

  return (
    <div className={`relative ${isFlashing ? "timer-flash" : ""}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={modeColors[mode]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="timer-ring"
          style={{
            filter: `drop-shadow(0 0 8px ${modeColors[mode]}40)`,
          }}
        />
      </svg>
    </div>
  );
}

// Footer Component
function Footer() {
  return (
    <footer className="mt-16 border-t border-white/5 py-8">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col items-center gap-4 text-center text-sm text-white/40">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-accent" />
            <span className="font-semibold text-white/60">BrainLoop Focus</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1">
            <span>NorwegianSpark SA</span>
            <span>Org. 834 984 172</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1">
            <a
              href="mailto:norwegianspark@gmail.com"
              className="flex items-center gap-1.5 transition-colors hover:text-white/60"
            >
              <Mail className="h-3.5 w-3.5" />
              norwegianspark@gmail.com
            </a>
            <a
              href="tel:+4799737467"
              className="flex items-center gap-1.5 transition-colors hover:text-white/60"
            >
              <Phone className="h-3.5 w-3.5" />
              +47 99 73 74 67
            </a>
          </div>
          <div className="flex gap-4">
            <Link
              href="/privacy"
              className="transition-colors hover:text-white/60"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="transition-colors hover:text-white/60"
            >
              Terms of Service
            </Link>
          </div>
          <p className="text-xs text-white/20">
            &copy; {new Date().getFullYear()} NorwegianSpark SA. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

// Main Page
export default function Home() {
  // Task state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<
    "high" | "medium" | "low"
  >("medium");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [mounted, setMounted] = useState(false);

  // Timer state
  const [timerMode, setTimerMode] = useState<TimerMode>("focus");
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATIONS.focus);
  const [isRunning, setIsRunning] = useState(false);
  const [sessions, setSessions] = useState<SessionData>({
    count: 0,
    history: [],
  });
  const [isFlashing, setIsFlashing] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const consecutiveFocusRef = useRef(0);

  // Load from localStorage
  useEffect(() => {
    setTasks(loadTasks());
    setSessions(loadSessions());
    setMounted(true);
  }, []);

  // Save tasks
  useEffect(() => {
    if (mounted) saveTasks(tasks);
  }, [tasks, mounted]);

  // Save sessions
  useEffect(() => {
    if (mounted) saveSessions(sessions);
  }, [sessions, mounted]);

  // Timer logic
  const handleTimerEnd = useCallback(() => {
    setIsRunning(false);
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 1500);

    if (timerMode === "focus") {
      const today = new Date().toISOString().split("T")[0];
      setSessions((prev) => {
        const newCount = prev.count + 1;
        const historyEntry = prev.history.find((h) => h.date === today);
        let newHistory;
        if (historyEntry) {
          newHistory = prev.history.map((h) =>
            h.date === today ? { ...h, sessions: h.sessions + 1 } : h
          );
        } else {
          newHistory = [...prev.history, { date: today, sessions: 1 }];
        }
        return { count: newCount, history: newHistory };
      });

      consecutiveFocusRef.current += 1;
      toast.success("Focus session complete!", {
        description: "Great work! Time for a break.",
      });

      if (consecutiveFocusRef.current % 4 === 0) {
        setTimerMode("longBreak");
        setTimeLeft(TIMER_DURATIONS.longBreak);
        toast.info("Starting long break", {
          description: "You earned it after 4 focus sessions!",
        });
      } else {
        setTimerMode("shortBreak");
        setTimeLeft(TIMER_DURATIONS.shortBreak);
      }
    } else {
      toast.info("Break is over!", {
        description: "Ready to focus again?",
      });
      setTimerMode("focus");
      setTimeLeft(TIMER_DURATIONS.focus);
    }
  }, [timerMode]);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            handleTimerEnd();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, handleTimerEnd]);

  // Task functions
  const addTask = () => {
    const trimmed = newTaskName.trim();
    if (!trimmed) {
      toast.error("Please enter a task name");
      return;
    }
    const task: Task = {
      id: generateId(),
      name: trimmed,
      priority: newTaskPriority,
      completed: false,
      createdAt: Date.now(),
    };
    setTasks((prev) => [task, ...prev]);
    setNewTaskName("");
    toast.success("Task added");
  };

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    toast("Task deleted");
  };

  const switchMode = (mode: TimerMode) => {
    setIsRunning(false);
    setTimerMode(mode);
    setTimeLeft(TIMER_DURATIONS[mode]);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(TIMER_DURATIONS[timerMode]);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const progress = 1 - timeLeft / TIMER_DURATIONS[timerMode];

  const filteredTasks =
    priorityFilter === "all"
      ? tasks
      : tasks.filter((t) => t.priority === priorityFilter);

  const activeTasks = filteredTasks.filter((t) => !t.completed);
  const completedTasks = filteredTasks.filter((t) => t.completed);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <header className="border-b border-white/5 bg-dark-800/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
              <Brain className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                BrainLoop <span className="text-accent">Focus</span>
              </h1>
              <p className="text-xs text-white/40">Stay productive</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/40">
            <Flame className="h-4 w-4 text-orange-400" />
            <span>
              <span className="font-semibold text-white/70">
                {sessions.count}
              </span>{" "}
              sessions
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-8 max-w-6xl px-4">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Task List Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="glass-card">
              <div className="mb-6 flex items-center gap-3">
                <ListTodo className="h-5 w-5 text-accent" />
                <h2 className="text-lg font-semibold">Tasks</h2>
                <span className="ml-auto rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-white/40">
                  {tasks.filter((t) => !t.completed).length} active
                </span>
              </div>

              {/* Add Task Form */}
              <div className="mb-4 flex gap-2">
                <input
                  type="text"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTask()}
                  placeholder="Add a new task..."
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 transition-all"
                />
                <select
                  value={newTaskPriority}
                  onChange={(e) =>
                    setNewTaskPriority(
                      e.target.value as "high" | "medium" | "low"
                    )
                  }
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/70"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <button onClick={addTask} className="btn-primary flex items-center gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              {/* Priority Filter */}
              <div className="mb-4 flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-white/30" />
                {(["all", "high", "medium", "low"] as PriorityFilter[]).map(
                  (filter) => (
                    <button
                      key={filter}
                      onClick={() => setPriorityFilter(filter)}
                      className={`rounded-lg px-3 py-1 text-xs font-medium capitalize transition-all ${
                        priorityFilter === filter
                          ? "bg-accent/20 text-accent"
                          : "text-white/40 hover:bg-white/5 hover:text-white/60"
                      }`}
                    >
                      {filter}
                    </button>
                  )
                )}
              </div>

              {/* Task List */}
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                <AnimatePresence mode="popLayout">
                  {activeTasks.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 transition-colors hover:bg-white/[0.04]"
                    >
                      <button
                        onClick={() => toggleTask(task.id)}
                        className="text-white/30 transition-colors hover:text-accent"
                      >
                        <Circle className="h-5 w-5" />
                      </button>
                      <span className="flex-1 text-sm text-white/80">
                        {task.name}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_COLORS[task.priority]}`}
                      >
                        {task.priority}
                      </span>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-white/20 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </motion.div>
                  ))}

                  {completedTasks.length > 0 && (
                    <div key="completed-divider" className="py-2">
                      <div className="flex items-center gap-2 text-xs text-white/20">
                        <div className="h-px flex-1 bg-white/5" />
                        <span>Completed ({completedTasks.length})</span>
                        <div className="h-px flex-1 bg-white/5" />
                      </div>
                    </div>
                  )}

                  {completedTasks.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="group flex items-center gap-3 rounded-xl border border-white/[0.02] bg-white/[0.01] px-4 py-3"
                    >
                      <button
                        onClick={() => toggleTask(task.id)}
                        className="text-accent/60 transition-colors hover:text-accent"
                      >
                        <CheckCircle2 className="h-5 w-5" />
                      </button>
                      <span className="flex-1 text-sm text-white/30 line-through">
                        {task.name}
                      </span>
                      <span
                        className={`h-2 w-2 rounded-full opacity-30 ${PRIORITY_DOT[task.priority]}`}
                      />
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-white/10 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {filteredTasks.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ListTodo className="mb-3 h-10 w-10 text-white/10" />
                    <p className="text-sm text-white/30">No tasks yet</p>
                    <p className="text-xs text-white/15">
                      Add a task to get started
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Timer Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="glass-card flex flex-col items-center">
              <div className="mb-6 flex w-full items-center gap-3">
                <Timer className="h-5 w-5 text-accent" />
                <h2 className="text-lg font-semibold">Pomodoro Timer</h2>
              </div>

              {/* Mode Tabs */}
              <div className="mb-8 flex gap-1 rounded-xl bg-white/5 p-1">
                {(
                  [
                    { mode: "focus" as TimerMode, icon: Brain, label: "Focus" },
                    {
                      mode: "shortBreak" as TimerMode,
                      icon: Coffee,
                      label: "Short",
                    },
                    {
                      mode: "longBreak" as TimerMode,
                      icon: Armchair,
                      label: "Long",
                    },
                  ] as const
                ).map(({ mode, icon: Icon, label }) => (
                  <button
                    key={mode}
                    onClick={() => switchMode(mode)}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                      timerMode === mode
                        ? "bg-accent/20 text-accent shadow-sm"
                        : "text-white/40 hover:text-white/60"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Timer Display */}
              <div className="relative mb-8">
                <TimerRing
                  progress={progress}
                  mode={timerMode}
                  isFlashing={isFlashing}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-bold tracking-wider tabular-nums">
                    {formatTime(timeLeft)}
                  </span>
                  <span className="mt-2 text-sm text-white/40">
                    {TIMER_LABELS[timerMode]}
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="mb-6 flex items-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={resetTimer}
                  className="btn-secondary flex items-center gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsRunning(!isRunning)}
                  className="btn-primary flex items-center gap-2 px-8"
                >
                  {isRunning ? (
                    <>
                      <Pause className="h-4 w-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Start
                    </>
                  )}
                </motion.button>
              </div>

              {/* Session Counter */}
              <div className="w-full rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-orange-400" />
                    <span className="text-sm text-white/50">
                      Sessions Today
                    </span>
                  </div>
                  <span className="text-2xl font-bold text-white/80">
                    {sessions.history.find(
                      (h) =>
                        h.date === new Date().toISOString().split("T")[0]
                    )?.sessions || 0}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
                  <span className="text-xs text-white/30">Total sessions</span>
                  <span className="text-sm font-semibold text-white/50">
                    {sessions.count}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
