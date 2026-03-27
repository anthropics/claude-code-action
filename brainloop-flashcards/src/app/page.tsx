"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  Shuffle,
  CheckCircle2,
  BookOpen,
  BarChart3,
  RotateCcw,
  Sparkles,
  Mail,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface Flashcard {
  id: number;
  question: string;
  answer: string;
  category: string;
}

interface Scores {
  known: number[];
  studyMore: number[];
}

interface SessionData {
  count: number;
  totalStudied: number;
  totalKnown: number;
}

const FLASHCARDS: Flashcard[] = [
  { id: 1, question: "What is the powerhouse of the cell?", answer: "The mitochondria. It generates most of the cell's supply of adenosine triphosphate (ATP), used as a source of chemical energy.", category: "Biology" },
  { id: 2, question: "In what year did the Berlin Wall fall?", answer: "1989. The Berlin Wall fell on November 9, 1989, marking the beginning of German reunification.", category: "History" },
  { id: 3, question: "What is the chemical symbol for gold?", answer: "Au (from the Latin 'aurum'). Gold has an atomic number of 79.", category: "Chemistry" },
  { id: 4, question: "What is the capital of Australia?", answer: "Canberra. It was selected as the capital in 1908 as a compromise between Sydney and Melbourne.", category: "Geography" },
  { id: 5, question: "What is the value of Pi to five decimal places?", answer: "3.14159. Pi is the ratio of a circle's circumference to its diameter and is an irrational number.", category: "Math" },
  { id: 6, question: "What does 'carpe diem' mean in English?", answer: "'Seize the day.' It is a Latin phrase from the Roman poet Horace, urging people to enjoy the present.", category: "Language" },
  { id: 7, question: "What planet is known as the Red Planet?", answer: "Mars. Its reddish appearance is due to iron oxide (rust) prevalent on its surface.", category: "Astronomy" },
  { id: 8, question: "Who painted the Mona Lisa?", answer: "Leonardo da Vinci. He began painting it around 1503 and it now hangs in the Louvre Museum in Paris.", category: "Art" },
  { id: 9, question: "What is the largest ocean on Earth?", answer: "The Pacific Ocean. It covers approximately 165.25 million square kilometers, more than all land area combined.", category: "Geography" },
  { id: 10, question: "What is the speed of light in a vacuum?", answer: "Approximately 299,792,458 meters per second (about 300,000 km/s or 186,000 miles per second).", category: "Physics" },
  { id: 11, question: "What is the Pythagorean theorem?", answer: "a\u00b2 + b\u00b2 = c\u00b2. In a right triangle, the square of the hypotenuse equals the sum of the squares of the other two sides.", category: "Math" },
  { id: 12, question: "What does DNA stand for?", answer: "Deoxyribonucleic acid. It is the molecule that carries the genetic instructions for the development and function of living organisms.", category: "Biology" },
  { id: 13, question: "What is the longest river in the world?", answer: "The Nile River at approximately 6,650 km (4,130 miles), flowing through northeastern Africa.", category: "Geography" },
  { id: 14, question: "Who developed the theory of general relativity?", answer: "Albert Einstein, published in 1915. It describes gravity as the curvature of spacetime caused by mass and energy.", category: "Physics" },
  { id: 15, question: "What is the boiling point of water at sea level in Celsius?", answer: "100\u00b0C (212\u00b0F). At higher altitudes, water boils at lower temperatures due to decreased atmospheric pressure.", category: "Chemistry" },
  { id: 16, question: "What does the Japanese word 'tsunami' literally mean?", answer: "'Harbor wave.' It comes from 'tsu' (harbor) and 'nami' (wave).", category: "Language" },
  { id: 17, question: "What year did World War I begin?", answer: "1914. The war was triggered by the assassination of Archduke Franz Ferdinand of Austria on June 28, 1914.", category: "History" },
  { id: 18, question: "What is the smallest prime number?", answer: "2. It is also the only even prime number, since all other even numbers are divisible by 2.", category: "Math" },
  { id: 19, question: "What is the hardest natural substance on Earth?", answer: "Diamond. It scores 10 on the Mohs hardness scale and is made of carbon atoms in a crystal structure.", category: "Science" },
  { id: 20, question: "What is the human body's largest organ?", answer: "The skin. It covers about 1.5 to 2 square meters in adults and accounts for roughly 15% of body weight.", category: "Biology" },
  { id: 21, question: "What is the square root of 144?", answer: "12. Since 12 \u00d7 12 = 144.", category: "Math" },
  { id: 22, question: "What is the French word for 'butterfly'?", answer: "Papillon. It is also a breed of dog named for its butterfly-shaped ears.", category: "Language" },
  { id: 23, question: "What is the tallest mountain in the world?", answer: "Mount Everest at 8,849 meters (29,032 feet) above sea level, located in the Himalayas on the Nepal-China border.", category: "Geography" },
  { id: 24, question: "What element does 'O' represent on the periodic table?", answer: "Oxygen. It has an atomic number of 8 and makes up about 21% of Earth's atmosphere.", category: "Chemistry" },
  { id: 25, question: "Who wrote 'Romeo and Juliet'?", answer: "William Shakespeare, written around 1594-1596. It is one of the most famous tragedies in the English language.", category: "Literature" },
];

const STORAGE_KEYS = {
  index: "bl_fc_index",
  scores: "bl_fc_scores",
  sessions: "bl_fc_sessions",
  last: "bl_fc_last",
};

const CATEGORY_COLORS: Record<string, string> = {
  Biology: "text-green-400",
  History: "text-amber-400",
  Chemistry: "text-orange-400",
  Geography: "text-blue-400",
  Math: "text-pink-400",
  Language: "text-violet-400",
  Astronomy: "text-indigo-400",
  Art: "text-rose-400",
  Physics: "text-cyan-400",
  Science: "text-emerald-400",
  Literature: "text-yellow-400",
};

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function Footer() {
  return (
    <footer className="w-full border-t border-white/5 mt-12 py-8 px-4">
      <div className="max-w-4xl mx-auto flex flex-col items-center gap-3 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-500/50" />
          <span className="font-medium text-slate-400">BrainLoop Flashcards</span>
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <span>NorwegianSpark SA</span>
          <span className="hidden sm:inline">|</span>
          <span>Org. 834 984 172</span>
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <a href="mailto:norwegianspark@gmail.com" className="hover:text-purple-400 transition-colors flex items-center gap-1">
            <Mail className="w-3 h-3" />
            norwegianspark@gmail.com
          </a>
          <span className="hidden sm:inline">|</span>
          <a href="tel:+4799737467" className="hover:text-purple-400 transition-colors flex items-center gap-1">
            <Phone className="w-3 h-3" />
            +47 99 73 74 67
          </a>
        </div>
        <div className="flex gap-4 mt-1">
          <Link href="/privacy" className="hover:text-purple-400 transition-colors">
            Privacy Policy
          </Link>
          <span>|</span>
          <Link href="/terms" className="hover:text-purple-400 transition-colors">
            Terms of Service
          </Link>
        </div>
      </div>
    </footer>
  );
}

export default function FlashcardApp() {
  const [cards, setCards] = useState<Flashcard[]>(FLASHCARDS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [scores, setScores] = useState<Scores>({ known: [], studyMore: [] });
  const [sessions, setSessions] = useState<SessionData>({ count: 0, totalStudied: 0, totalKnown: 0 });
  const [activeTab, setActiveTab] = useState<"study" | "progress">("study");
  const [isLoaded, setIsLoaded] = useState(false);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    try {
      const savedIndex = localStorage.getItem(STORAGE_KEYS.index);
      const savedScores = localStorage.getItem(STORAGE_KEYS.scores);
      const savedSessions = localStorage.getItem(STORAGE_KEYS.sessions);

      if (savedIndex !== null) setCurrentIndex(parseInt(savedIndex, 10));
      if (savedScores !== null) setScores(JSON.parse(savedScores));
      if (savedSessions !== null) setSessions(JSON.parse(savedSessions));

      const lastDate = localStorage.getItem(STORAGE_KEYS.last);
      const today = new Date().toDateString();
      if (lastDate !== today) {
        localStorage.setItem(STORAGE_KEYS.last, today);
        if (savedSessions !== null) {
          const prev = JSON.parse(savedSessions) as SessionData;
          const updated = { ...prev, count: prev.count + 1 };
          setSessions(updated);
          localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(updated));
        } else {
          const initial = { count: 1, totalStudied: 0, totalKnown: 0 };
          setSessions(initial);
          localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(initial));
          localStorage.setItem(STORAGE_KEYS.last, today);
        }
      }
    } catch {
      // localStorage unavailable
    }
    setIsLoaded(true);
  }, []);

  const saveScores = useCallback((newScores: Scores) => {
    setScores(newScores);
    try {
      localStorage.setItem(STORAGE_KEYS.scores, JSON.stringify(newScores));
    } catch {
      // ignore
    }
  }, []);

  const saveSessions = useCallback((newSessions: SessionData) => {
    setSessions(newSessions);
    try {
      localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(newSessions));
    } catch {
      // ignore
    }
  }, []);

  const saveIndex = useCallback((idx: number) => {
    setCurrentIndex(idx);
    try {
      localStorage.setItem(STORAGE_KEYS.index, idx.toString());
    } catch {
      // ignore
    }
  }, []);

  const handleFlip = () => setIsFlipped((prev) => !prev);

  const handleNext = () => {
    setIsFlipped(false);
    setDirection(1);
    const next = (currentIndex + 1) % cards.length;
    saveIndex(next);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setDirection(-1);
    const prev = (currentIndex - 1 + cards.length) % cards.length;
    saveIndex(prev);
  };

  const handleShuffle = () => {
    const shuffled = shuffleArray(cards);
    setCards(shuffled);
    setIsFlipped(false);
    saveIndex(0);
    toast.success("Deck shuffled!");
  };

  const handleKnowIt = () => {
    const cardId = cards[currentIndex].id;
    const newScores = {
      known: scores.known.includes(cardId) ? scores.known : [...scores.known, cardId],
      studyMore: scores.studyMore.filter((id) => id !== cardId),
    };
    saveScores(newScores);
    const newSessions = {
      ...sessions,
      totalStudied: sessions.totalStudied + 1,
      totalKnown: sessions.totalKnown + 1,
    };
    saveSessions(newSessions);
    toast.success("Marked as known!");
    setIsFlipped(false);
    setTimeout(() => {
      setDirection(1);
      saveIndex((currentIndex + 1) % cards.length);
    }, 300);
  };

  const handleStudyMore = () => {
    const cardId = cards[currentIndex].id;
    const newScores = {
      known: scores.known.filter((id) => id !== cardId),
      studyMore: scores.studyMore.includes(cardId) ? scores.studyMore : [...scores.studyMore, cardId],
    };
    saveScores(newScores);
    const newSessions = { ...sessions, totalStudied: sessions.totalStudied + 1 };
    saveSessions(newSessions);
    toast("Added to study list", { icon: "📚" });
    setIsFlipped(false);
    setTimeout(() => {
      setDirection(1);
      saveIndex((currentIndex + 1) % cards.length);
    }, 300);
  };

  const handleReset = () => {
    saveScores({ known: [], studyMore: [] });
    saveSessions({ count: sessions.count, totalStudied: 0, totalKnown: 0 });
    saveIndex(0);
    setCards(FLASHCARDS);
    setIsFlipped(false);
    toast.success("Progress reset!");
  };

  const currentCard = cards[currentIndex];
  const cardStatus = scores.known.includes(currentCard?.id)
    ? "known"
    : scores.studyMore.includes(currentCard?.id)
    ? "studyMore"
    : "unseen";

  const accuracy =
    sessions.totalStudied > 0
      ? Math.round((sessions.totalKnown / sessions.totalStudied) * 100)
      : 0;

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 flex flex-col items-center px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-8"
        >
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Brain className="w-8 h-8 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
              BrainLoop Flashcards
            </h1>
            <p className="text-sm text-slate-500">Tap a card to reveal the answer</p>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab("study")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === "study"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                : "text-slate-500 hover:text-slate-300 border border-transparent"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Study
          </button>
          <button
            onClick={() => setActiveTab("progress")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === "progress"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-500 hover:text-slate-300 border border-transparent"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Progress
          </button>
        </div>

        {activeTab === "study" ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-xl flex flex-col items-center"
          >
            {/* Card counter */}
            <div className="flex items-center justify-between w-full mb-4">
              <span className="text-sm text-slate-500">
                Card {currentIndex + 1} of {cards.length}
              </span>
              <div className="flex items-center gap-2">
                {cardStatus === "known" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                    Known
                  </span>
                )}
                {cardStatus === "studyMore" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Study More
                  </span>
                )}
                <span className={`text-xs font-medium ${CATEGORY_COLORS[currentCard.category] || "text-slate-400"}`}>
                  {currentCard.category}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-white/5 rounded-full mb-6 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-500"
                initial={false}
                animate={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>

            {/* 3D Flashcard */}
            <div className="perspective w-full h-72 sm:h-80 mb-6">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={currentCard.id}
                  initial={{ opacity: 0, x: direction * 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: direction * -50 }}
                  transition={{ duration: 0.25 }}
                  className="w-full h-full"
                >
                  <div
                    className={`card-inner cursor-pointer w-full h-full ${isFlipped ? "flipped" : ""}`}
                    onClick={handleFlip}
                  >
                    <div className="card-face card-front glow-purple">
                      <Sparkles className="w-5 h-5 text-purple-400/50 mb-3" />
                      <p className="text-lg sm:text-xl text-center font-medium text-slate-200 leading-relaxed">
                        {currentCard.question}
                      </p>
                      <p className="text-xs text-slate-600 mt-4">Click to reveal answer</p>
                    </div>
                    <div className="card-face card-back glow-cyan">
                      <CheckCircle2 className="w-5 h-5 text-cyan-400/50 mb-3" />
                      <p className="text-base sm:text-lg text-center text-slate-300 leading-relaxed">
                        {currentCard.answer}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Score buttons */}
            <div className="flex gap-3 w-full mb-6">
              <button
                onClick={handleStudyMore}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl glass text-amber-400 hover:bg-amber-500/10 transition-all text-sm font-medium"
              >
                <BookOpen className="w-4 h-4" />
                Study More
              </button>
              <button
                onClick={handleKnowIt}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl glass text-green-400 hover:bg-green-500/10 transition-all text-sm font-medium"
              >
                <CheckCircle2 className="w-4 h-4" />
                Know It
              </button>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-3 w-full">
              <button
                onClick={handlePrev}
                className="flex items-center justify-center w-12 h-12 rounded-xl glass hover:bg-white/5 transition-all"
                aria-label="Previous card"
              >
                <ChevronLeft className="w-5 h-5 text-slate-400" />
              </button>
              <button
                onClick={handleShuffle}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl glass hover:bg-white/5 transition-all text-sm text-slate-400"
              >
                <Shuffle className="w-4 h-4" />
                Shuffle Deck
              </button>
              <button
                onClick={handleNext}
                className="flex items-center justify-center w-12 h-12 rounded-xl glass hover:bg-white/5 transition-all"
                aria-label="Next card"
              >
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-xl"
          >
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="glass-strong rounded-xl p-5 glow-purple">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Cards Known</p>
                <p className="text-3xl font-bold text-purple-400">{scores.known.length}</p>
                <p className="text-xs text-slate-600 mt-1">of {FLASHCARDS.length} total</p>
              </div>
              <div className="glass-strong rounded-xl p-5 glow-cyan">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Study More</p>
                <p className="text-3xl font-bold text-cyan-400">{scores.studyMore.length}</p>
                <p className="text-xs text-slate-600 mt-1">cards to review</p>
              </div>
              <div className="glass-strong rounded-xl p-5">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Accuracy</p>
                <p className="text-3xl font-bold text-green-400">{accuracy}%</p>
                <p className="text-xs text-slate-600 mt-1">{sessions.totalStudied} answers total</p>
              </div>
              <div className="glass-strong rounded-xl p-5">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Sessions</p>
                <p className="text-3xl font-bold text-amber-400">{sessions.count}</p>
                <p className="text-xs text-slate-600 mt-1">study sessions</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="glass-strong rounded-xl p-5 mb-6">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-medium text-slate-300">Mastery Progress</p>
                <p className="text-sm text-purple-400 font-medium">
                  {Math.round((scores.known.length / FLASHCARDS.length) * 100)}%
                </p>
              </div>
              <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${(scores.known.length / FLASHCARDS.length) * 100}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-xs text-slate-600">{scores.known.length} known</span>
                <span className="text-xs text-slate-600">{FLASHCARDS.length - scores.known.length - scores.studyMore.length} unseen</span>
              </div>
            </div>

            {/* Category breakdown */}
            <div className="glass-strong rounded-xl p-5 mb-6">
              <p className="text-sm font-medium text-slate-300 mb-4">Category Breakdown</p>
              <div className="space-y-3">
                {Array.from(new Set(FLASHCARDS.map((c) => c.category))).map((category) => {
                  const catCards = FLASHCARDS.filter((c) => c.category === category);
                  const catKnown = catCards.filter((c) => scores.known.includes(c.id)).length;
                  return (
                    <div key={category}>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-xs font-medium ${CATEGORY_COLORS[category] || "text-slate-400"}`}>
                          {category}
                        </span>
                        <span className="text-xs text-slate-600">
                          {catKnown}/{catCards.length}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-purple-500/70 to-cyan-500/70 transition-all duration-500"
                          style={{ width: `${(catKnown / catCards.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reset button */}
            <button
              onClick={handleReset}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl glass text-red-400 hover:bg-red-500/10 transition-all text-sm font-medium"
            >
              <RotateCcw className="w-4 h-4" />
              Reset All Progress
            </button>
          </motion.div>
        )}
      </main>

      <Footer />
    </div>
  );
}
