"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import Link from "next/link";
import {
  Brain,
  Users,
  Play,
  Trophy,
  Timer,
  Flame,
  Star,
  RotateCcw,
  ChevronRight,
  Plus,
  Minus,
  Beaker,
  Landmark,
  Globe,
  Clapperboard,
  Dumbbell,
  Cpu,
  Crown,
  Zap,
  Mail,
  Phone,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────── */

interface Question {
  question: string;
  options: string[];
  correct: number;
}

interface CategoryData {
  name: string;
  icon: React.ReactNode;
  color: string;
  questions: Question[];
}

interface Player {
  name: string;
  score: number;
  streak: number;
  correctAnswers: number;
  totalAnswers: number;
}

interface HighScoreEntry {
  name: string;
  score: number;
  date: string;
}

type GamePhase = "setup" | "category" | "playing" | "result" | "gameover";

/* ─── Question Bank ──────────────────────────────────────────────── */

const CATEGORIES: Record<string, CategoryData> = {
  science: {
    name: "Science",
    icon: <Beaker className="h-6 w-6" />,
    color: "from-emerald-500 to-teal-600",
    questions: [
      { question: "What is the chemical symbol for gold?", options: ["Go", "Au", "Ag", "Gd"], correct: 1 },
      { question: "How many bones are in the adult human body?", options: ["186", "206", "226", "246"], correct: 1 },
      { question: "What planet is known as the Red Planet?", options: ["Venus", "Jupiter", "Mars", "Saturn"], correct: 2 },
      { question: "What is the powerhouse of the cell?", options: ["Nucleus", "Ribosome", "Mitochondria", "Golgi body"], correct: 2 },
      { question: "What gas do plants absorb from the atmosphere?", options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], correct: 2 },
      { question: "What is the speed of light approximately?", options: ["300,000 km/s", "150,000 km/s", "500,000 km/s", "100,000 km/s"], correct: 0 },
      { question: "What is the hardest natural substance on Earth?", options: ["Quartz", "Topaz", "Diamond", "Corundum"], correct: 2 },
      { question: "Which element has the atomic number 1?", options: ["Helium", "Hydrogen", "Lithium", "Carbon"], correct: 1 },
      { question: "What is the largest organ in the human body?", options: ["Liver", "Brain", "Skin", "Lungs"], correct: 2 },
      { question: "How many chromosomes do humans have?", options: ["23", "44", "46", "48"], correct: 2 },
      { question: "What type of bond involves the sharing of electrons?", options: ["Ionic", "Covalent", "Metallic", "Hydrogen"], correct: 1 },
      { question: "What is the most abundant gas in Earth's atmosphere?", options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Argon"], correct: 2 },
    ],
  },
  history: {
    name: "History",
    icon: <Landmark className="h-6 w-6" />,
    color: "from-orange-500 to-red-600",
    questions: [
      { question: "In what year did World War II end?", options: ["1943", "1944", "1945", "1946"], correct: 2 },
      { question: "Who was the first President of the United States?", options: ["John Adams", "Thomas Jefferson", "George Washington", "Benjamin Franklin"], correct: 2 },
      { question: "Which ancient civilization built the pyramids at Giza?", options: ["Roman", "Greek", "Egyptian", "Mesopotamian"], correct: 2 },
      { question: "What year did the Berlin Wall fall?", options: ["1987", "1988", "1989", "1990"], correct: 2 },
      { question: "Who discovered America in 1492?", options: ["Vasco da Gama", "Ferdinand Magellan", "Christopher Columbus", "Amerigo Vespucci"], correct: 2 },
      { question: "The Renaissance began in which country?", options: ["France", "England", "Italy", "Spain"], correct: 2 },
      { question: "Who was the first emperor of Rome?", options: ["Julius Caesar", "Augustus", "Nero", "Caligula"], correct: 1 },
      { question: "What was the longest war in history?", options: ["Hundred Years' War", "Thirty Years' War", "Reconquista", "Seven Years' War"], correct: 2 },
      { question: "Which empire was ruled by Genghis Khan?", options: ["Ottoman", "Mongol", "Persian", "Byzantine"], correct: 1 },
      { question: "In what year did the Titanic sink?", options: ["1910", "1911", "1912", "1913"], correct: 2 },
      { question: "Who wrote the Declaration of Independence?", options: ["Benjamin Franklin", "John Adams", "Thomas Jefferson", "James Madison"], correct: 2 },
      { question: "What ancient city was destroyed by Mount Vesuvius in 79 AD?", options: ["Rome", "Athens", "Pompeii", "Carthage"], correct: 2 },
    ],
  },
  geography: {
    name: "Geography",
    icon: <Globe className="h-6 w-6" />,
    color: "from-blue-500 to-cyan-600",
    questions: [
      { question: "What is the largest continent by area?", options: ["Africa", "North America", "Asia", "Europe"], correct: 2 },
      { question: "Which country has the most people?", options: ["India", "United States", "China", "Indonesia"], correct: 0 },
      { question: "What is the longest river in the world?", options: ["Amazon", "Nile", "Mississippi", "Yangtze"], correct: 1 },
      { question: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Brisbane"], correct: 2 },
      { question: "Which desert is the largest in the world?", options: ["Gobi", "Sahara", "Antarctic", "Arabian"], correct: 2 },
      { question: "What is the smallest country in the world?", options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], correct: 1 },
      { question: "Which ocean is the deepest?", options: ["Atlantic", "Indian", "Pacific", "Arctic"], correct: 2 },
      { question: "Mount Everest is located in which mountain range?", options: ["Andes", "Alps", "Himalayas", "Rockies"], correct: 2 },
      { question: "What is the capital of Canada?", options: ["Toronto", "Vancouver", "Ottawa", "Montreal"], correct: 2 },
      { question: "Which African country was formerly known as Abyssinia?", options: ["Kenya", "Somalia", "Ethiopia", "Sudan"], correct: 2 },
      { question: "What is the largest island in the world?", options: ["Borneo", "Madagascar", "Greenland", "New Guinea"], correct: 2 },
      { question: "Which strait separates Europe from Africa?", options: ["Strait of Hormuz", "Strait of Gibraltar", "Strait of Malacca", "Bosphorus"], correct: 1 },
    ],
  },
  entertainment: {
    name: "Entertainment",
    icon: <Clapperboard className="h-6 w-6" />,
    color: "from-purple-500 to-pink-600",
    questions: [
      { question: "Who directed the movie 'Inception'?", options: ["Steven Spielberg", "Christopher Nolan", "James Cameron", "Ridley Scott"], correct: 1 },
      { question: "What is the highest-grossing film of all time (unadjusted)?", options: ["Avengers: Endgame", "Avatar", "Titanic", "Star Wars: The Force Awakens"], correct: 1 },
      { question: "Which band released the album 'Abbey Road'?", options: ["The Rolling Stones", "The Who", "The Beatles", "Led Zeppelin"], correct: 2 },
      { question: "In 'The Lord of the Rings', what is the name of Frodo's home?", options: ["Rivendell", "The Shire", "Rohan", "Gondor"], correct: 1 },
      { question: "Who played Jack Dawson in 'Titanic'?", options: ["Brad Pitt", "Leonardo DiCaprio", "Matt Damon", "Tom Cruise"], correct: 1 },
      { question: "What year was the first 'Star Wars' film released?", options: ["1975", "1977", "1979", "1980"], correct: 1 },
      { question: "Which artist painted the Mona Lisa?", options: ["Michelangelo", "Raphael", "Leonardo da Vinci", "Donatello"], correct: 2 },
      { question: "What is the name of the wizarding school in Harry Potter?", options: ["Durmstrang", "Beauxbatons", "Hogwarts", "Ilvermorny"], correct: 2 },
      { question: "Who created the TV series 'Breaking Bad'?", options: ["David Chase", "Vince Gilligan", "Matthew Weiner", "Shonda Rhimes"], correct: 1 },
      { question: "What instrument does a pianist play?", options: ["Organ", "Piano", "Harpsichord", "Synthesizer"], correct: 1 },
      { question: "Which superhero is known as the 'Dark Knight'?", options: ["Superman", "Spider-Man", "Batman", "Iron Man"], correct: 2 },
      { question: "What is the name of the fictional kingdom in 'Frozen'?", options: ["Arendelle", "Corona", "Agrabah", "DunBroch"], correct: 0 },
    ],
  },
  sports: {
    name: "Sports",
    icon: <Dumbbell className="h-6 w-6" />,
    color: "from-red-500 to-rose-600",
    questions: [
      { question: "How many players are on a standard soccer team on the field?", options: ["9", "10", "11", "12"], correct: 2 },
      { question: "In which sport is the term 'love' used for a score of zero?", options: ["Badminton", "Tennis", "Table Tennis", "Squash"], correct: 1 },
      { question: "Which country has won the most FIFA World Cups?", options: ["Germany", "Argentina", "Italy", "Brazil"], correct: 3 },
      { question: "How many rings are on the Olympic flag?", options: ["4", "5", "6", "7"], correct: 1 },
      { question: "What is the maximum score in a single frame of bowling?", options: ["10", "20", "30", "50"], correct: 2 },
      { question: "Which sport uses a shuttlecock?", options: ["Tennis", "Badminton", "Squash", "Table Tennis"], correct: 1 },
      { question: "In basketball, how many points is a shot behind the arc worth?", options: ["1", "2", "3", "4"], correct: 2 },
      { question: "Which country hosted the 2016 Summer Olympics?", options: ["China", "UK", "Brazil", "Japan"], correct: 2 },
      { question: "What is the national sport of Japan?", options: ["Judo", "Karate", "Sumo", "Kendo"], correct: 2 },
      { question: "How long is a marathon in kilometers approximately?", options: ["36.2 km", "38.2 km", "40.2 km", "42.2 km"], correct: 3 },
      { question: "Which tennis Grand Slam is played on clay courts?", options: ["Wimbledon", "US Open", "French Open", "Australian Open"], correct: 2 },
      { question: "In cricket, how many balls are in a standard over?", options: ["4", "5", "6", "8"], correct: 2 },
    ],
  },
  technology: {
    name: "Technology",
    icon: <Cpu className="h-6 w-6" />,
    color: "from-cyan-500 to-blue-600",
    questions: [
      { question: "Who co-founded Apple Inc. with Steve Wozniak?", options: ["Bill Gates", "Steve Jobs", "Elon Musk", "Jeff Bezos"], correct: 1 },
      { question: "What does HTML stand for?", options: ["Hyper Text Markup Language", "High Tech Modern Language", "Hyper Transfer Markup Language", "Home Tool Markup Language"], correct: 0 },
      { question: "In what year was the iPhone first released?", options: ["2005", "2006", "2007", "2008"], correct: 2 },
      { question: "What programming language is known as the 'language of the web'?", options: ["Python", "Java", "JavaScript", "C++"], correct: 2 },
      { question: "What does CPU stand for?", options: ["Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Core Processing Unit"], correct: 0 },
      { question: "Which company developed the Android operating system?", options: ["Apple", "Microsoft", "Google", "Samsung"], correct: 2 },
      { question: "What is the binary representation of the decimal number 10?", options: ["1010", "1100", "1001", "1110"], correct: 0 },
      { question: "Who is considered the father of computer science?", options: ["John von Neumann", "Alan Turing", "Charles Babbage", "Ada Lovelace"], correct: 1 },
      { question: "What does 'URL' stand for?", options: ["Uniform Resource Locator", "Universal Reference Link", "Unified Resource Language", "Universal Resource Locator"], correct: 0 },
      { question: "Which company created the first commercially successful personal computer?", options: ["IBM", "Apple", "Microsoft", "Commodore"], correct: 1 },
      { question: "What does 'GPU' stand for?", options: ["General Processing Unit", "Graphics Processing Unit", "Global Processing Unit", "Graphical Performance Unit"], correct: 1 },
      { question: "What year was the World Wide Web invented?", options: ["1985", "1989", "1991", "1993"], correct: 1 },
    ],
  },
};

const QUESTIONS_PER_GAME = 10;
const TIMER_DURATION = 15;
const BASE_POINTS = 100;

/* ─── Helper: Circular Timer ─────────────────────────────────────── */

function CircularTimer({ timeLeft, total }: { timeLeft: number; total: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = (timeLeft / total) * circumference;
  const isLow = timeLeft <= 5;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="100" height="100" className="timer-circle">
        <circle cx="50" cy="50" r={radius} className="timer-circle-track" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className="timer-circle-progress"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: circumference - progress,
            stroke: isLow ? "#ef4444" : "#f59e0b",
          }}
        />
      </svg>
      <span
        className={`absolute text-2xl font-bold ${
          isLow ? "text-red-400 animate-timer-pulse" : "text-amber-400"
        }`}
      >
        {timeLeft}
      </span>
    </div>
  );
}

/* ─── Helper: Footer ─────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-gray-800/50 bg-[#0a0a0f] py-8 mt-12">
      <div className="mx-auto max-w-5xl px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-amber-400" />
            <span className="font-semibold text-white">BrainLoop</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-400">
            <span>NorwegianSpark SA</span>
            <span>Org. 834 984 172</span>
            <a
              href="mailto:norwegianspark@gmail.com"
              className="inline-flex items-center gap-1 hover:text-amber-400 transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              norwegianspark@gmail.com
            </a>
            <a
              href="tel:+4799737467"
              className="inline-flex items-center gap-1 hover:text-amber-400 transition-colors"
            >
              <Phone className="h-3.5 w-3.5" />
              +47 99 73 74 67
            </a>
          </div>
          <div className="flex gap-4 text-sm">
            <Link href="/privacy" className="text-gray-500 hover:text-amber-400 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-gray-500 hover:text-amber-400 transition-colors">
              Terms of Service
            </Link>
          </div>
          <p className="text-xs text-gray-600">
            &copy; {new Date().getFullYear()} NorwegianSpark SA. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */

export default function TriviaGame() {
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [playerCount, setPlayerCount] = useState(1);
  const [playerNames, setPlayerNames] = useState<string[]>(["Player 1"]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [highScores, setHighScores] = useState<HighScoreEntry[]>([]);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load high scores from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("brainloop-trivia-highscores");
      if (stored) {
        setHighScores(JSON.parse(stored));
      }
    } catch {
      // localStorage not available
    }
  }, []);

  const saveHighScores = useCallback((scores: HighScoreEntry[]) => {
    const sorted = scores.sort((a, b) => b.score - a.score).slice(0, 10);
    setHighScores(sorted);
    try {
      localStorage.setItem("brainloop-trivia-highscores", JSON.stringify(sorted));
    } catch {
      // localStorage not available
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    setTimeLeft(TIMER_DURATION);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  // Handle time running out
  useEffect(() => {
    if (timeLeft === 0 && phase === "playing" && !showResult) {
      handleAnswer(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase, showResult]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  function shuffleArray<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function handlePlayerCountChange(delta: number) {
    const newCount = Math.max(1, Math.min(4, playerCount + delta));
    setPlayerCount(newCount);
    setPlayerNames((prev) => {
      const names = [...prev];
      while (names.length < newCount) names.push(`Player ${names.length + 1}`);
      return names.slice(0, newCount);
    });
  }

  function handleNameChange(index: number, name: string) {
    setPlayerNames((prev) => {
      const names = [...prev];
      names[index] = name;
      return names;
    });
  }

  function startGame() {
    const validNames = playerNames.map((n, i) => n.trim() || `Player ${i + 1}`);
    const newPlayers: Player[] = validNames.map((name) => ({
      name,
      score: 0,
      streak: 0,
      correctAnswers: 0,
      totalAnswers: 0,
    }));
    setPlayers(newPlayers);
    setCurrentPlayerIndex(0);
    setQuestionsAnswered(0);
    setPhase("category");
    toast.success("Game started! Choose a category.");
  }

  function selectCategory(cat: string) {
    setSelectedCategory(cat);
    const catQuestions = shuffleArray(CATEGORIES[cat].questions).slice(0, QUESTIONS_PER_GAME);
    setQuestions(catQuestions);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setPhase("playing");
    startTimer();
  }

  function handleAnswer(answerIndex: number) {
    if (showResult) return;
    clearTimer();
    setSelectedAnswer(answerIndex);
    setShowResult(true);

    const question = questions[currentQuestionIndex];
    const isCorrect = answerIndex === question.correct;

    setPlayers((prev) => {
      const updated = [...prev];
      const player = { ...updated[currentPlayerIndex] };
      player.totalAnswers += 1;

      if (isCorrect) {
        player.streak += 1;
        player.correctAnswers += 1;
        let multiplier = 1;
        if (player.streak >= 3) multiplier = 2;
        else if (player.streak === 2) multiplier = 1.5;
        const points = Math.round(BASE_POINTS * multiplier);
        player.score += points;

        if (multiplier > 1) {
          toast.success(`${multiplier}x streak bonus! +${points} points`);
        } else {
          toast.success(`Correct! +${points} points`);
        }
      } else {
        player.streak = 0;
        if (answerIndex === -1) {
          toast.error("Time's up!");
        } else {
          toast.error("Wrong answer!");
        }
      }

      updated[currentPlayerIndex] = player;
      return updated;
    });

    setQuestionsAnswered((prev) => prev + 1);
  }

  function nextQuestion() {
    const totalQuestionsInGame = QUESTIONS_PER_GAME * players.length;

    if (questionsAnswered + 1 > totalQuestionsInGame) {
      endGame();
      return;
    }

    // Move to next player
    const nextPlayer = (currentPlayerIndex + 1) % players.length;
    setCurrentPlayerIndex(nextPlayer);

    if (nextPlayer === 0) {
      // All players answered this question index, advance question
      const nextQ = currentQuestionIndex + 1;
      if (nextQ >= questions.length) {
        endGame();
        return;
      }
      setCurrentQuestionIndex(nextQ);
    }

    setSelectedAnswer(null);
    setShowResult(false);
    startTimer();
  }

  function endGame() {
    clearTimer();
    setPhase("gameover");
    // Save all player scores to high scores
    const newEntries: HighScoreEntry[] = players.map((p) => ({
      name: p.name,
      score: p.score,
      date: new Date().toISOString().split("T")[0],
    }));
    saveHighScores([...highScores, ...newEntries]);
    toast.success("Game Over!");
  }

  function resetGame() {
    clearTimer();
    setPhase("setup");
    setPlayers([]);
    setCurrentPlayerIndex(0);
    setSelectedCategory("");
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setTimeLeft(TIMER_DURATION);
    setSelectedAnswer(null);
    setShowResult(false);
    setQuestionsAnswered(0);
  }

  /* ─── Render: Setup ───────────────────────────────────────────── */

  if (phase === "setup") {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">
          <div className="mx-auto max-w-2xl px-4 py-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-12"
            >
              <div className="inline-flex items-center justify-center rounded-full bg-amber-500/10 p-4 mb-6 glow-amber">
                <Brain className="h-12 w-12 text-amber-400" />
              </div>
              <h1 className="text-5xl font-bold text-white mb-3">
                Brain<span className="text-gradient-amber">Loop</span>
              </h1>
              <p className="text-xl text-gray-400">Trivia Battle</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="card-dark p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <Users className="h-5 w-5 text-amber-400" />
                <h2 className="text-lg font-semibold text-white">Player Setup</h2>
              </div>

              <div className="flex items-center justify-center gap-4 mb-8">
                <button
                  onClick={() => handlePlayerCountChange(-1)}
                  disabled={playerCount <= 1}
                  className="rounded-full bg-gray-800 p-2 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <div className="text-center">
                  <span className="text-4xl font-bold text-amber-400">{playerCount}</span>
                  <p className="text-sm text-gray-500 mt-1">
                    {playerCount === 1 ? "Player" : "Players"}
                  </p>
                </div>
                <button
                  onClick={() => handlePlayerCountChange(1)}
                  disabled={playerCount >= 4}
                  className="rounded-full bg-gray-800 p-2 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 mb-8">
                {playerNames.map((name, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <label className="block text-sm text-gray-400 mb-1">
                      Player {index + 1}
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => handleNameChange(index, e.target.value)}
                      placeholder={`Player ${index + 1}`}
                      maxLength={20}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                    />
                  </motion.div>
                ))}
              </div>

              <p className="text-center text-sm text-gray-500 mb-6">
                Hot-seat mode: Players take turns answering questions
              </p>

              <button
                onClick={startGame}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 py-4 text-lg font-bold text-gray-900 hover:from-amber-400 hover:to-yellow-400 transition-all glow-amber-sm flex items-center justify-center gap-2"
              >
                <Play className="h-5 w-5" />
                Start Game
              </button>
            </motion.div>

            {highScores.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="card-dark p-6 mt-6"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="h-5 w-5 text-amber-400" />
                  <h3 className="font-semibold text-white">High Scores</h3>
                </div>
                <div className="space-y-2">
                  {highScores.slice(0, 5).map((entry, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-gray-800/30 px-4 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-amber-400">
                          #{i + 1}
                        </span>
                        <span className="text-gray-300">{entry.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-white">
                          {entry.score.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-500">{entry.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  /* ─── Render: Category Selection ──────────────────────────────── */

  if (phase === "category") {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">
          <div className="mx-auto max-w-3xl px-4 py-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-10"
            >
              <h2 className="text-3xl font-bold text-white mb-2">Choose a Category</h2>
              <p className="text-gray-400">
                {players[currentPlayerIndex]?.name}, pick a topic for the game
              </p>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(CATEGORIES).map(([key, cat], index) => (
                <motion.button
                  key={key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => selectCategory(key)}
                  className="card-dark p-6 text-left hover:border-amber-500/50 hover:bg-gray-800/50 transition-all group"
                >
                  <div
                    className={`inline-flex rounded-xl bg-gradient-to-br ${cat.color} p-3 mb-4 group-hover:scale-110 transition-transform`}
                  >
                    {cat.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-1">{cat.name}</h3>
                  <p className="text-sm text-gray-500">
                    {cat.questions.length} questions
                  </p>
                </motion.button>
              ))}
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  /* ─── Render: Playing ─────────────────────────────────────────── */

  if (phase === "playing") {
    const question = questions[currentQuestionIndex];
    const currentPlayer = players[currentPlayerIndex];

    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">
          <div className="mx-auto max-w-3xl px-4 py-8">
            {/* Header bar */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-sm text-gray-500">
                  {CATEGORIES[selectedCategory]?.name} &middot; Question{" "}
                  {currentQuestionIndex + 1}/{questions.length}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-semibold text-amber-400">
                    {currentPlayer.name}
                  </span>
                  {currentPlayer.streak >= 2 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-bold text-orange-400">
                      <Flame className="h-3 w-3" />
                      {currentPlayer.streak}x streak
                    </span>
                  )}
                </div>
              </div>
              <CircularTimer timeLeft={timeLeft} total={TIMER_DURATION} />
            </div>

            {/* Score strip */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              {players.map((p, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap ${
                    i === currentPlayerIndex
                      ? "bg-amber-500/20 border border-amber-500/40"
                      : "bg-gray-800/50 border border-gray-800"
                  }`}
                >
                  <Star
                    className={`h-3.5 w-3.5 ${
                      i === currentPlayerIndex ? "text-amber-400" : "text-gray-600"
                    }`}
                  />
                  <span className={i === currentPlayerIndex ? "text-amber-300" : "text-gray-400"}>
                    {p.name}
                  </span>
                  <span className="font-bold text-white">{p.score}</span>
                </div>
              ))}
            </div>

            {/* Question */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentQuestionIndex}-${currentPlayerIndex}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.3 }}
              >
                <div className="card-dark p-8 mb-6">
                  <h2 className="text-xl md:text-2xl font-bold text-white leading-relaxed">
                    {question.question}
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {question.options.map((option, index) => {
                    let btnClass =
                      "card-dark p-4 text-left transition-all cursor-pointer hover:border-amber-500/50 hover:bg-gray-800/50";

                    if (showResult) {
                      if (index === question.correct) {
                        btnClass =
                          "rounded-2xl border border-emerald-500/50 bg-emerald-900/30 p-4 text-left";
                      } else if (index === selectedAnswer && index !== question.correct) {
                        btnClass =
                          "rounded-2xl border border-red-500/50 bg-red-900/30 p-4 text-left";
                      } else {
                        btnClass =
                          "rounded-2xl border border-gray-800/50 bg-gray-900/30 p-4 text-left opacity-50";
                      }
                    }

                    return (
                      <motion.button
                        key={index}
                        whileHover={!showResult ? { scale: 1.02 } : {}}
                        whileTap={!showResult ? { scale: 0.98 } : {}}
                        onClick={() => !showResult && handleAnswer(index)}
                        disabled={showResult}
                        className={`${btnClass} w-full`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-800 text-sm font-bold text-amber-400">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <span className="text-gray-200">{option}</span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {showResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 flex justify-center"
                  >
                    <button
                      onClick={nextQuestion}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-8 py-3 font-bold text-gray-900 hover:from-amber-400 hover:to-yellow-400 transition-all"
                    >
                      {questionsAnswered >= QUESTIONS_PER_GAME * players.length
                        ? "View Results"
                        : "Next Question"}
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  /* ─── Render: Game Over ───────────────────────────────────────── */

  if (phase === "gameover") {
    const sorted = [...players].sort((a, b) => b.score - a.score);

    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">
          <div className="mx-auto max-w-2xl px-4 py-12">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center mb-10"
            >
              <div className="inline-flex items-center justify-center rounded-full bg-amber-500/10 p-4 mb-4 glow-amber">
                <Trophy className="h-10 w-10 text-amber-400" />
              </div>
              <h2 className="text-4xl font-bold text-white mb-2">Game Over!</h2>
              <p className="text-gray-400">
                {CATEGORIES[selectedCategory]?.name} Challenge Complete
              </p>
            </motion.div>

            <div className="space-y-4 mb-8">
              {sorted.map((player, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.15 }}
                  className={`card-dark p-6 ${
                    index === 0 ? "border-amber-500/50 glow-amber-sm" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-full ${
                          index === 0
                            ? "bg-gradient-to-br from-amber-400 to-yellow-500"
                            : index === 1
                            ? "bg-gradient-to-br from-gray-300 to-gray-400"
                            : index === 2
                            ? "bg-gradient-to-br from-orange-600 to-orange-700"
                            : "bg-gray-700"
                        }`}
                      >
                        {index === 0 ? (
                          <Crown className="h-6 w-6 text-gray-900" />
                        ) : (
                          <span className="text-lg font-bold text-white">
                            #{index + 1}
                          </span>
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">{player.name}</h3>
                        <div className="flex items-center gap-3 text-sm text-gray-400">
                          <span>
                            {player.correctAnswers}/{player.totalAnswers} correct
                          </span>
                          <span>
                            {player.totalAnswers > 0
                              ? Math.round(
                                  (player.correctAnswers / player.totalAnswers) * 100
                                )
                              : 0}
                            % accuracy
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <Zap className="h-4 w-4 text-amber-400" />
                        <span className="text-2xl font-bold text-amber-400">
                          {player.score.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">points</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-3 justify-center"
            >
              <button
                onClick={resetGame}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-8 py-3 font-bold text-gray-900 hover:from-amber-400 hover:to-yellow-400 transition-all"
              >
                <RotateCcw className="h-5 w-5" />
                Play Again
              </button>
            </motion.div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return null;
}
