"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  RotateCcw,
  BarChart3,
  X,
  Trophy,
  Flame,
  Brain,
  HelpCircle,
} from "lucide-react";
import Link from "next/link";

// ─── Word Banks ───────────────────────────────────────────────────────────────

const WORD_BANK: string[] = [
  "about", "above", "abuse", "actor", "acute", "admit", "adopt", "adult",
  "after", "again", "agent", "agree", "ahead", "alarm", "album", "alert",
  "alien", "align", "alike", "alive", "alley", "allow", "alone", "along",
  "alter", "amaze", "ample", "angel", "anger", "angle", "angry", "anime",
  "ankle", "annex", "apart", "apple", "apply", "arena", "argue", "arise",
  "armor", "array", "arrow", "aside", "asset", "attic", "audio", "audit",
  "avoid", "award", "aware", "awful", "bacon", "badge", "badly", "baker",
  "bases", "basic", "basin", "basis", "batch", "beach", "beard", "beast",
  "begin", "being", "belly", "below", "bench", "berry", "birth", "black",
  "blade", "blame", "bland", "blank", "blast", "blaze", "bleed", "blend",
  "bless", "blind", "bliss", "block", "bloom", "blown", "blues", "bluff",
  "board", "boast", "bonus", "boost", "booth", "bound", "brain", "brand",
  "brave", "bread", "break", "breed", "brick", "bride", "brief", "bring",
  "broad", "brook", "brown", "brush", "build", "bunch", "burst", "buyer",
  "cabin", "cable", "camel", "candy", "cargo", "carry", "catch", "cause",
  "chain", "chair", "chaos", "charm", "chart", "chase", "cheap", "check",
  "cheek", "cheer", "chess", "chest", "chief", "child", "chill", "china",
  "choir", "chunk", "civic", "civil", "claim", "clash", "class", "clean",
  "clear", "clerk", "click", "cliff", "climb", "cling", "clock", "clone",
  "close", "cloth", "cloud", "coach", "coast", "color", "comet", "comic",
  "coral", "count", "court", "cover", "crack", "craft", "crane", "crash",
  "crazy", "cream", "crime", "cross", "crowd", "crown", "cruel", "crush",
  "curve", "cycle", "daily", "dance", "death", "debug", "decay", "delay",
  "delta", "demon", "dense", "depot", "depth", "derby", "devil", "diary",
  "dirty", "ditch", "dizzy", "dodge", "donor", "doubt", "dough", "draft",
  "drain", "drake", "drama", "drank", "drawn", "dream", "dress", "dried",
  "drift", "drink", "drive", "drops", "drove", "drugs", "drums", "drunk",
  "dryer", "dying", "eager", "eagle", "early", "earth", "easel", "eight",
  "elder", "elect", "elite", "email", "ember", "empty", "enemy", "enjoy",
  "enter", "entry", "equal", "equip", "error", "essay", "event", "every",
  "exact", "exams", "exist", "extra", "fable", "facet", "faint", "fairy",
  "faith", "false", "fancy", "fatal", "fault", "feast", "fence", "ferry",
  "fetch", "fever", "fiber", "field", "fifth", "fifty", "fight", "final",
  "first", "fixed", "flame", "flash", "flesh", "float", "flock", "flood",
  "floor", "flour", "fluid", "flush", "focal", "focus", "force", "forge",
  "forum", "fossil","found", "frame", "frank", "fraud", "fresh", "front",
  "frost", "froze", "fruit", "funny", "giant", "given", "glass", "gleam",
  "globe", "gloom", "glory", "gloss", "glove", "going", "grace", "grade",
  "grain", "grand", "grant", "grape", "graph", "grasp", "grass", "grave",
  "great", "greed", "green", "greet", "grief", "grill", "grind", "gripe",
  "gross", "group", "grove", "guard", "guess", "guest", "guide", "guild",
  "guilt", "habit", "happy", "harsh", "hasn", "haste", "haunt", "haven",
  "heart", "heavy", "hedge", "hello", "hence", "herbs", "hinge", "hobby",
  "honey", "honor", "horse", "hotel", "house", "human", "humor", "hurry",
  "hyper", "ideal", "image", "imply", "inbox", "index", "indie", "inner",
  "input", "irony", "issue", "ivory", "jewel", "joint", "joker", "judge",
  "juice", "karma", "knack", "kneel", "knife", "knock", "known", "label",
  "labor", "large", "laser", "later", "laugh", "layer", "learn", "lease",
  "least", "leave", "legal", "lemon", "level", "light", "limit", "linen",
  "liver", "local", "lodge", "logic", "login", "loose", "lorry", "lover",
  "lower", "loyal", "lucky", "lunar", "lunch", "lying", "magic", "major",
  "maker", "manor", "maple", "march", "marry", "match", "mayor", "media",
  "mercy", "merit", "metal", "meter", "midst", "might", "minor", "minus",
  "misty", "mixed", "model", "money", "month", "moral", "motor", "mount",
  "mourn", "mouse", "mouth", "movie", "muddy", "music", "naive", "naval",
  "nerve", "never", "night", "noble", "noise", "north", "notch", "noted",
  "novel", "nurse", "nylon", "occur", "ocean", "offer", "often", "olive",
  "onset", "opera", "orbit", "order", "other", "ought", "outer", "owner",
  "oxide", "ozone", "paint", "panel", "panic", "paper", "party", "pasta",
  "paste", "patch", "pause", "peace", "peach", "pearl", "pedal", "penny",
  "phase", "phone", "photo", "piano", "piece", "pilot", "pinch", "pixel",
  "pizza", "place", "plain", "plane", "plant", "plate", "plaza", "plead",
  "pluck", "point", "poise", "polar", "pound", "power", "press", "price",
  "pride", "prime", "print", "prior", "prize", "probe", "proof", "proud",
  "prove", "proxy", "pulse", "punch", "pupil", "purse", "queen", "quest",
  "queue", "quick", "quiet", "quota", "quote", "radar", "radio", "raise",
  "rally", "range", "rapid", "ratio", "reach", "react", "ready", "realm",
  "rebel", "refer", "reign", "relax", "reply", "rider", "ridge", "rifle",
  "right", "rigid", "risky", "rival", "river", "roast", "robot", "rocky",
  "rough", "round", "route", "royal", "rugby", "ruler", "rural", "saint",
  "salad", "sauce", "scale", "scare", "scene", "scent", "scope", "score",
  "scout", "scrap", "setup", "seven", "shade", "shaft", "shake", "shall",
  "shame", "shape", "share", "shark", "sharp", "shelf", "shell", "shift",
  "shine", "shirt", "shock", "shore", "short", "shout", "sight", "sigma",
  "silly", "since", "sixth", "sixty", "skate", "skill", "skull", "slate",
  "sleep", "slice", "slide", "slope", "small", "smart", "smell", "smile",
  "smoke", "snack", "snake", "solar", "solid", "solve", "sorry", "sound",
  "south", "space", "spare", "spark", "speak", "spear", "speed", "spend",
  "spice", "spine", "spite", "split", "spoke", "spoon", "sport", "spray",
  "squad", "stack", "staff", "stage", "stain", "stake", "stale", "stall",
  "stamp", "stand", "stare", "start", "state", "stays", "steady","steam",
  "steel", "steep", "steer", "stern", "stick", "stiff", "still", "stock",
  "stone", "stood", "store", "storm", "story", "stove", "strip", "stuck",
  "study", "stuff", "style", "sugar", "suite", "super", "surge", "swamp",
  "swear", "sweep", "sweet", "swept", "swift", "swing", "sword", "syrup",
  "table", "taste", "teach", "tears", "tempo", "tense", "tenth", "theme",
  "thick", "thief", "thing", "think", "third", "thorn", "those", "three",
  "throw", "thumb", "tiger", "tight", "timer", "tired", "title", "toast",
  "today", "token", "tooth", "topic", "total", "touch", "tough", "tower",
  "toxic", "trace", "track", "trade", "trail", "train", "trait", "trash",
  "treat", "trend", "trial", "tribe", "trick", "troop", "truck", "truly",
  "trump", "trunk", "trust", "truth", "tumor", "tuner", "twist", "ultra",
  "uncle", "under", "union", "unite", "unity", "until", "upper", "upset",
  "urban", "usage", "usual", "utter", "valid", "value", "vapor", "vault",
  "venue", "verse", "vigor", "viral", "virus", "visit", "vital", "vivid",
  "vocal", "vodka", "voice", "voter", "wagon", "waste", "watch", "water",
  "weary", "weave", "wedge", "wheat", "wheel", "where", "which", "while",
  "white", "whole", "whose", "width", "witch", "woman", "world", "worry",
  "worse", "worst", "worth", "would", "wound", "wrist", "write", "wrong",
  "yield", "young", "yours", "youth", "zones",
];

const SOLUTION_WORDS: string[] = [
  "about", "above", "actor", "admit", "adult", "after", "again", "agent",
  "agree", "alarm", "album", "alert", "alive", "allow", "alone", "along",
  "angel", "anger", "angle", "angry", "apple", "arena", "arrow", "aside",
  "avoid", "award", "beach", "begin", "being", "below", "black", "blade",
  "blame", "blank", "blast", "blaze", "blend", "blind", "block", "bloom",
  "board", "bonus", "brain", "brand", "brave", "bread", "break", "brick",
  "brief", "bring", "broad", "brown", "brush", "build", "cabin", "candy",
  "carry", "catch", "cause", "chain", "chair", "chaos", "charm", "chase",
  "cheap", "check", "chest", "child", "claim", "class", "clean", "clear",
  "climb", "clock", "close", "cloud", "coach", "color", "count", "court",
  "cover", "crack", "craft", "crane", "crash", "crazy", "cream", "crime",
  "cross", "crowd", "crown", "crush", "cycle", "daily", "dance", "death",
  "delay", "depth", "doubt", "draft", "drain", "drama", "dream", "dress",
  "drift", "drink", "drive", "eager", "eagle", "early", "earth", "eight",
  "elite", "empty", "enemy", "enjoy", "enter", "equal", "error", "event",
  "every", "exact", "exist", "extra", "faith", "false", "fault", "feast",
  "fence", "fever", "field", "fight", "final", "first", "flame", "flash",
  "float", "flood", "floor", "fluid", "focus", "force", "forge", "found",
  "frame", "frank", "fraud", "fresh", "front", "fruit", "funny", "ghost",
  "giant", "given", "glass", "globe", "glory", "grace", "grade", "grain",
  "grand", "grant", "grape", "graph", "grasp", "grass", "grave", "great",
  "greed", "green", "grind", "group", "grove", "guard", "guess", "guide",
  "guild", "habit", "happy", "harsh", "haven", "heart", "heavy", "hello",
  "honey", "honor", "horse", "hotel", "house", "human", "humor", "ideal",
  "image", "imply", "index", "inner", "input", "irony", "issue", "jewel",
  "joint", "judge", "juice", "known", "label", "large", "laser", "later",
  "laugh", "layer", "learn", "leave", "legal", "lemon", "level", "light",
  "limit", "liver", "local", "logic", "loose", "lover", "lower", "loyal",
  "lucky", "lunar", "lunch", "magic", "major", "maple", "march", "match",
  "mayor", "media", "mercy", "merit", "metal", "might", "minor", "model",
  "money", "month", "moral", "motor", "mount", "mouse", "mouth", "movie",
  "music", "naval", "nerve", "never", "night", "noble", "noise", "north",
  "novel", "nurse", "ocean", "offer", "often", "onset", "opera", "orbit",
  "order", "other", "outer", "owner", "paint", "panel", "panic", "paper",
  "party", "pasta", "pause", "peace", "peach", "pearl", "phase", "phone",
  "photo", "piano", "piece", "pilot", "pixel", "pizza", "place", "plain",
  "plane", "plant", "plate", "point", "pound", "power", "press", "price",
  "pride", "prime", "print", "prior", "prize", "proof", "proud", "prove",
  "pulse", "queen", "quest", "quick", "quiet", "quote", "radar", "radio",
  "raise", "range", "rapid", "reach", "react", "ready", "realm", "rebel",
  "refer", "reign", "relax", "reply", "rider", "right", "rigid", "rival",
  "river", "robot", "rough", "round", "route", "royal", "ruler", "rural",
  "saint", "salad", "scale", "scare", "scene", "scope", "score", "scout",
  "seven", "shade", "shake", "shame", "shape", "share", "shark", "sharp",
  "shelf", "shell", "shift", "shine", "shirt", "shock", "shore", "short",
  "shout", "sight", "silly", "since", "skill", "skull", "sleep", "slice",
  "slide", "slope", "small", "smart", "smell", "smile", "smoke", "snake",
  "solar", "solid", "solve", "sorry", "sound", "south", "space", "spare",
  "spark", "speak", "speed", "spend", "spice", "spine", "split", "sport",
  "spray", "squad", "stack", "staff", "stage", "stain", "stake", "stamp",
  "stand", "stare", "start", "state", "steam", "steel", "steep", "stern",
  "stick", "still", "stock", "stone", "store", "storm", "story", "strip",
  "stuck", "study", "stuff", "style", "sugar", "suite", "super", "surge",
  "swear", "sweep", "sweet", "swept", "swift", "swing", "sword", "table",
  "taste", "teach", "tempo", "tense", "theme", "thick", "thief", "thing",
  "think", "third", "those", "three", "throw", "thumb", "tiger", "tight",
  "timer", "tired", "title", "toast", "today", "token", "tooth", "topic",
  "total", "touch", "tough", "tower", "trace", "track", "trade", "trail",
  "train", "trait", "trash", "treat", "trend", "trial", "tribe", "trick",
  "truck", "truly", "trunk", "trust", "truth", "twist", "ultra", "uncle",
  "under", "union", "unite", "unity", "until", "upper", "upset", "urban",
  "usage", "usual", "valid", "value", "vault", "venue", "vigor", "viral",
  "virus", "visit", "vital", "vivid", "vocal", "voice", "voter", "waste",
  "watch", "water", "weave", "wheat", "wheel", "where", "which", "while",
  "white", "whole", "width", "woman", "world", "worry", "worse", "worst",
  "worth", "would", "wound", "write", "wrong", "yield", "young", "youth",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type LetterState = "correct" | "present" | "absent" | "empty" | "tbd";

interface TileData {
  letter: string;
  state: LetterState;
}

interface GameStats {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  maxStreak: number;
  guessDistribution: number[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;

const KEYBOARD_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRandomWord(): string {
  return SOLUTION_WORDS[Math.floor(Math.random() * SOLUTION_WORDS.length)];
}

function loadStats(): GameStats {
  if (typeof window === "undefined") {
    return {
      gamesPlayed: 0,
      gamesWon: 0,
      currentStreak: 0,
      maxStreak: 0,
      guessDistribution: [0, 0, 0, 0, 0, 0],
    };
  }
  try {
    const saved = localStorage.getItem("brainloop-words-stats");
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    currentStreak: 0,
    maxStreak: 0,
    guessDistribution: [0, 0, 0, 0, 0, 0],
  };
}

function saveStats(stats: GameStats) {
  try {
    localStorage.setItem("brainloop-words-stats", JSON.stringify(stats));
  } catch {
    // ignore
  }
}

function evaluateGuess(guess: string, solution: string): LetterState[] {
  const result: LetterState[] = Array(WORD_LENGTH).fill("absent");
  const solutionChars = solution.split("");
  const guessChars = guess.split("");
  const used = Array(WORD_LENGTH).fill(false);

  // First pass: correct positions
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessChars[i] === solutionChars[i]) {
      result[i] = "correct";
      used[i] = true;
    }
  }

  // Second pass: present but wrong position
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === "correct") continue;
    for (let j = 0; j < WORD_LENGTH; j++) {
      if (!used[j] && guessChars[i] === solutionChars[j]) {
        result[i] = "present";
        used[j] = true;
        break;
      }
    }
  }

  return result;
}

// ─── Components ───────────────────────────────────────────────────────────────

function Tile({
  letter,
  state,
  delay,
  isRevealing,
  isCurrentRow,
}: {
  letter: string;
  state: LetterState;
  delay: number;
  isRevealing: boolean;
  isCurrentRow: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (isRevealing && !revealed) {
      const timer = setTimeout(() => {
        setFlipping(true);
        const flipDone = setTimeout(() => {
          setRevealed(true);
          setFlipping(false);
        }, 250);
        return () => clearTimeout(flipDone);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [isRevealing, delay, revealed]);

  const displayState = revealed ? state : letter ? "tbd" : "empty";

  const bgColor = {
    correct: "bg-emerald-600 border-emerald-600",
    present: "bg-amber-600 border-amber-600",
    absent: "bg-gray-700 border-gray-700",
    tbd: "border-gray-500",
    empty: "border-gray-700/50",
  }[displayState];

  return (
    <div
      className={`
        w-[52px] h-[52px] sm:w-[58px] sm:h-[58px] md:w-[62px] md:h-[62px]
        flex items-center justify-center
        border-2 rounded-lg text-xl sm:text-2xl font-bold uppercase
        transition-colors duration-100
        ${bgColor}
        ${flipping ? "animate-flip" : ""}
        ${letter && !revealed && isCurrentRow ? "animate-pop" : ""}
      `}
    >
      {letter}
    </div>
  );
}

function Keyboard({
  onKey,
  letterStates,
}: {
  onKey: (key: string) => void;
  letterStates: Record<string, LetterState>;
}) {
  const getKeyColor = (key: string) => {
    const state = letterStates[key.toLowerCase()];
    if (state === "correct") return "bg-emerald-600 hover:bg-emerald-500 text-white";
    if (state === "present") return "bg-amber-600 hover:bg-amber-500 text-white";
    if (state === "absent") return "bg-gray-800 hover:bg-gray-700 text-gray-400";
    return "bg-[#2a2a4a] hover:bg-[#3a3a5a] text-white";
  };

  return (
    <div className="flex flex-col items-center gap-1.5 w-full max-w-[520px] mx-auto px-1">
      {KEYBOARD_ROWS.map((row, i) => (
        <div key={i} className="flex gap-1 sm:gap-1.5 justify-center w-full">
          {row.map((key) => (
            <button
              key={key}
              onClick={() => onKey(key)}
              className={`
                ${key === "ENTER" || key === "BACK" ? "px-2 sm:px-3 text-[10px] sm:text-xs min-w-[52px] sm:min-w-[65px]" : "min-w-[28px] sm:min-w-[36px] md:min-w-[40px] text-sm sm:text-base"}
                h-[48px] sm:h-[54px] rounded-md font-semibold
                transition-all duration-150 active:scale-95
                ${getKeyColor(key)}
              `}
            >
              {key === "BACK" ? "\u232B" : key}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function StatsModal({
  stats,
  isOpen,
  onClose,
}: {
  stats: GameStats;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  const winPct =
    stats.gamesPlayed > 0
      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
      : 0;

  const maxDist = Math.max(...stats.guessDistribution, 1);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#111128] border border-[#1e1e3a] rounded-2xl p-6 w-full max-w-sm shadow-2xl"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
                Statistics
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                { value: stats.gamesPlayed, label: "Played" },
                { value: winPct, label: "Win %" },
                { value: stats.currentStreak, label: "Current Streak" },
                { value: stats.maxStreak, label: "Max Streak" },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div className="text-2xl font-bold text-white">
                    {item.value}
                  </div>
                  <div className="text-[10px] text-gray-400 leading-tight">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>

            <h3 className="text-sm font-semibold text-gray-300 mb-3">
              Guess Distribution
            </h3>
            <div className="space-y-1.5">
              {stats.guessDistribution.map((count, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-400 w-3">
                    {i + 1}
                  </span>
                  <div
                    className="h-5 rounded-sm bg-emerald-600/80 flex items-center justify-end px-1.5 transition-all duration-500"
                    style={{
                      width: `${Math.max((count / maxDist) * 100, 8)}%`,
                    }}
                  >
                    <span className="text-xs font-semibold text-white">
                      {count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HelpModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#111128] border border-[#1e1e3a] rounded-2xl p-6 w-full max-w-sm shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-emerald-400" />
                How to Play
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-gray-300">
              <p>Guess the word in 6 tries.</p>
              <p>Each guess must be a valid 5-letter word. Press Enter to submit.</p>
              <p>After each guess, the color of the tiles will change to show how close your guess was.</p>
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-600 rounded flex items-center justify-center font-bold text-white text-sm">
                    W
                  </div>
                  <span>Correct letter, correct spot</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-600 rounded flex items-center justify-center font-bold text-white text-sm">
                    O
                  </div>
                  <span>Correct letter, wrong spot</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-700 rounded flex items-center justify-center font-bold text-white text-sm">
                    R
                  </div>
                  <span>Letter not in the word</span>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [solution, setSolution] = useState("");
  const [guesses, setGuesses] = useState<string[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [revealingRow, setRevealingRow] = useState<number | null>(null);
  const [shakeRow, setShakeRow] = useState(false);
  const [stats, setStats] = useState<GameStats>(loadStats);
  const [showStats, setShowStats] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [letterStates, setLetterStates] = useState<Record<string, LetterState>>({});
  const [mounted, setMounted] = useState(false);
  const inputLock = useRef(false);

  // Initialize
  useEffect(() => {
    setSolution(getRandomWord());
    setMounted(true);
  }, []);

  // Update letter states after reveal
  const updateLetterStates = useCallback(
    (guess: string, evaluation: LetterState[]) => {
      setLetterStates((prev) => {
        const next = { ...prev };
        for (let i = 0; i < guess.length; i++) {
          const letter = guess[i];
          const newState = evaluation[i];
          const existing = next[letter];
          if (
            !existing ||
            existing === "empty" ||
            existing === "tbd" ||
            (existing === "absent" && newState !== "absent") ||
            (existing === "present" && newState === "correct")
          ) {
            next[letter] = newState;
          }
        }
        return next;
      });
    },
    []
  );

  const handleSubmit = useCallback(() => {
    if (inputLock.current || gameOver || currentGuess.length !== WORD_LENGTH) return;

    const guess = currentGuess.toLowerCase();

    if (!WORD_BANK.includes(guess)) {
      setShakeRow(true);
      toast.error("Not in word list");
      setTimeout(() => setShakeRow(false), 500);
      return;
    }

    inputLock.current = true;
    const newGuesses = [...guesses, guess];
    setGuesses(newGuesses);
    setCurrentGuess("");
    setRevealingRow(newGuesses.length - 1);

    const evaluation = evaluateGuess(guess, solution);

    // Wait for reveal animation to finish
    const revealTime = WORD_LENGTH * 200 + 300;
    setTimeout(() => {
      updateLetterStates(guess, evaluation);
      setRevealingRow(null);

      const won = guess === solution;
      const lost = !won && newGuesses.length >= MAX_ATTEMPTS;

      if (won) {
        setGameWon(true);
        setGameOver(true);
        const newStats = { ...loadStats() };
        newStats.gamesPlayed += 1;
        newStats.gamesWon += 1;
        newStats.currentStreak += 1;
        newStats.maxStreak = Math.max(newStats.maxStreak, newStats.currentStreak);
        newStats.guessDistribution[newGuesses.length - 1] += 1;
        saveStats(newStats);
        setStats(newStats);
        toast.success(
          ["Genius!", "Magnificent!", "Impressive!", "Splendid!", "Great!", "Phew!"][
            newGuesses.length - 1
          ]
        );
      } else if (lost) {
        setGameOver(true);
        const newStats = { ...loadStats() };
        newStats.gamesPlayed += 1;
        newStats.currentStreak = 0;
        saveStats(newStats);
        setStats(newStats);
        toast.error(`The word was: ${solution.toUpperCase()}`);
      }

      inputLock.current = false;
    }, revealTime);
  }, [currentGuess, guesses, gameOver, solution, updateLetterStates]);

  const handleKey = useCallback(
    (key: string) => {
      if (inputLock.current || gameOver) return;

      if (key === "ENTER") {
        handleSubmit();
        return;
      }

      if (key === "BACK" || key === "BACKSPACE") {
        setCurrentGuess((prev) => prev.slice(0, -1));
        return;
      }

      if (/^[A-Z]$/i.test(key) && currentGuess.length < WORD_LENGTH) {
        setCurrentGuess((prev) => prev + key.toLowerCase());
      }
    },
    [currentGuess, gameOver, handleSubmit]
  );

  // Physical keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        handleKey("ENTER");
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleKey("BACK");
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        handleKey(e.key.toUpperCase());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleKey]);

  const newGame = () => {
    setSolution(getRandomWord());
    setGuesses([]);
    setCurrentGuess("");
    setGameOver(false);
    setGameWon(false);
    setRevealingRow(null);
    setShakeRow(false);
    setLetterStates({});
    inputLock.current = false;
  };

  // Build grid data
  const grid: TileData[][] = [];
  for (let row = 0; row < MAX_ATTEMPTS; row++) {
    const tiles: TileData[] = [];
    if (row < guesses.length) {
      const evaluation = evaluateGuess(guesses[row], solution);
      for (let col = 0; col < WORD_LENGTH; col++) {
        tiles.push({ letter: guesses[row][col], state: evaluation[col] });
      }
    } else if (row === guesses.length) {
      for (let col = 0; col < WORD_LENGTH; col++) {
        tiles.push({
          letter: currentGuess[col] || "",
          state: "empty",
        });
      }
    } else {
      for (let col = 0; col < WORD_LENGTH; col++) {
        tiles.push({ letter: "", state: "empty" });
      }
    }
    grid.push(tiles);
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
        <Brain className="w-10 h-10 text-emerald-400 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a1a] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#1e1e3a] bg-[#0d0d22]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-xl mx-auto flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setShowHelp(true)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Brain className="w-6 h-6 text-emerald-400" />
            <h1 className="text-lg font-bold tracking-tight text-white">
              Brain<span className="text-emerald-400">Loop</span>{" "}
              <span className="text-gray-400 font-normal">Words</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowStats(true)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <BarChart3 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Game Area */}
      <main className="flex-1 flex flex-col items-center justify-between py-4 px-4 max-w-xl mx-auto w-full">
        {/* Grid */}
        <div className="flex flex-col items-center gap-1.5 my-auto">
          {grid.map((row, rowIdx) => (
            <div
              key={rowIdx}
              className={`flex gap-1.5 ${
                shakeRow && rowIdx === guesses.length ? "animate-shake" : ""
              } ${
                gameWon && rowIdx === guesses.length - 1
                  ? "animate-celebration"
                  : ""
              }`}
            >
              {row.map((tile, colIdx) => (
                <Tile
                  key={`${rowIdx}-${colIdx}`}
                  letter={tile.letter}
                  state={tile.state}
                  delay={colIdx * 200}
                  isRevealing={revealingRow === rowIdx}
                  isCurrentRow={rowIdx === guesses.length}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Game Over Actions */}
        <AnimatePresence>
          {gameOver && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-3 py-3"
            >
              {gameWon && (
                <div className="flex items-center gap-2 text-emerald-400">
                  <Trophy className="w-5 h-5" />
                  <span className="font-semibold">You won!</span>
                  {stats.currentStreak > 1 && (
                    <span className="flex items-center gap-1 text-amber-400 text-sm">
                      <Flame className="w-4 h-4" />
                      {stats.currentStreak} streak
                    </span>
                  )}
                </div>
              )}
              {!gameWon && (
                <div className="text-gray-400 text-sm">
                  The word was{" "}
                  <span className="font-bold text-white uppercase">
                    {solution}
                  </span>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={newGame}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  New Game
                </button>
                <button
                  onClick={() => setShowStats(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#2a2a4a] hover:bg-[#3a3a5a] text-white rounded-lg font-semibold transition-colors"
                >
                  <BarChart3 className="w-4 h-4" />
                  Stats
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Keyboard */}
        <div className="w-full pt-2 pb-1">
          <Keyboard onKey={handleKey} letterStates={letterStates} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1e1e3a] bg-[#0d0d22]/60 py-4 px-4">
        <div className="max-w-xl mx-auto text-center space-y-1.5">
          <div className="text-xs text-gray-500">
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
          <div className="flex items-center justify-center gap-3 text-xs text-gray-600">
            <Link
              href="/privacy"
              className="hover:text-emerald-400 transition-colors"
            >
              Privacy Policy
            </Link>
            <span>|</span>
            <Link
              href="/terms"
              className="hover:text-emerald-400 transition-colors"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <StatsModal
        stats={stats}
        isOpen={showStats}
        onClose={() => setShowStats(false)}
      />
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
