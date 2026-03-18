"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import {
  Heart,
  Briefcase,
  Users,
  Palette,
  BookOpen,
  Send,
  ArrowLeft,
  Brain,
  Sparkles,
  Mail,
  Phone,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import Link from "next/link";

interface Message {
  id: string;
  role: "user" | "advisor";
  content: string;
  timestamp: number;
}

interface Persona {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  greeting: string;
}

const personas: Persona[] = [
  {
    id: "life-coach",
    name: "Life Coach",
    icon: Heart,
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
    borderColor: "border-orange-500/30",
    description:
      "Motivational and empowering guidance to help you unlock your full potential and live your best life.",
    greeting:
      "Welcome! I am your Life Coach, and I am here to help you unlock your full potential. What area of your life would you like to focus on today?",
  },
  {
    id: "career-strategist",
    name: "Career Strategist",
    icon: Briefcase,
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    borderColor: "border-blue-500/30",
    description:
      "Professional and strategic advice to accelerate your career growth and navigate workplace dynamics.",
    greeting:
      "Hello! I am your Career Strategist. Whether you are planning your next move or navigating a challenge, I am here with strategic insights. What is on your mind?",
  },
  {
    id: "relationship-guide",
    name: "Relationship Guide",
    icon: Users,
    color: "text-pink-400",
    bgColor: "bg-pink-500/20",
    borderColor: "border-pink-500/30",
    description:
      "Empathetic and insightful support for navigating all types of relationships with grace and understanding.",
    greeting:
      "Hi there! I am your Relationship Guide. Relationships shape our lives in profound ways. What connection would you like to explore or improve today?",
  },
  {
    id: "creative-muse",
    name: "Creative Muse",
    icon: Palette,
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
    borderColor: "border-purple-500/30",
    description:
      "Inspiring and artistic encouragement to fuel your creative expression and break through creative blocks.",
    greeting:
      "Greetings, fellow creator! I am your Creative Muse, here to spark inspiration and fan the flames of your imagination. What creative endeavor brings you here today?",
  },
  {
    id: "stoic-philosopher",
    name: "Stoic Philosopher",
    icon: BookOpen,
    color: "text-gray-300",
    bgColor: "bg-gray-500/20",
    borderColor: "border-gray-500/30",
    description:
      "Wise and measured reflections rooted in Stoic philosophy to help you find clarity and inner peace.",
    greeting:
      "Welcome, seeker of wisdom. I am the Stoic Philosopher, a guide in the tradition of Marcus Aurelius and Epictetus. What weighs upon your mind?",
  },
];

function getStorageKey(personaId: string) {
  return `brainloop-advisor-${personaId}`;
}

function loadMessages(personaId: string): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(getStorageKey(personaId));
    if (stored) return JSON.parse(stored);
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveMessages(personaId: string, messages: Message[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getStorageKey(personaId), JSON.stringify(messages));
  } catch {
    // Ignore storage errors
  }
}

export default function Home() {
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (selectedPersona) {
      inputRef.current?.focus();
    }
  }, [selectedPersona]);

  function selectPersona(persona: Persona) {
    const stored = loadMessages(persona.id);
    if (stored.length > 0) {
      setMessages(stored);
    } else {
      const greeting: Message = {
        id: crypto.randomUUID(),
        role: "advisor",
        content: persona.greeting,
        timestamp: Date.now(),
      };
      setMessages([greeting]);
      saveMessages(persona.id, [greeting]);
    }
    setSelectedPersona(persona);
  }

  function goBack() {
    setSelectedPersona(null);
    setMessages([]);
    setInput("");
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || !selectedPersona || isTyping) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    saveMessages(selectedPersona.id, newMessages);
    setInput("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: selectedPersona.id,
          message: userMessage.content,
        }),
      });

      if (!res.ok) throw new Error("Failed to get response");

      const data = await res.json();
      const advisorMessage: Message = {
        id: crypto.randomUUID(),
        role: "advisor",
        content: data.response,
        timestamp: Date.now(),
      };

      const updatedMessages = [...newMessages, advisorMessage];
      setMessages(updatedMessages);
      saveMessages(selectedPersona.id, updatedMessages);
    } catch {
      toast.error("Failed to get a response. Please try again.");
    } finally {
      setIsTyping(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-dark-600 bg-dark-800/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedPersona && (
              <button
                onClick={goBack}
                className="p-2 rounded-lg hover:bg-dark-600 transition-colors mr-1"
                aria-label="Switch Advisor"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <Brain className="w-7 h-7 text-rose-400" />
            <h1 className="text-lg font-bold">
              <span className="text-rose-400">BrainLoop</span>{" "}
              <span className="text-gray-300">AI Advisor</span>
            </h1>
          </div>
          {selectedPersona && (
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-lg ${selectedPersona.bgColor}`}
              >
                <selectedPersona.icon
                  className={`w-4 h-4 ${selectedPersona.color}`}
                />
              </div>
              <span className={`text-sm font-medium ${selectedPersona.color}`}>
                {selectedPersona.name}
              </span>
              <button
                onClick={goBack}
                className="ml-3 text-xs px-3 py-1.5 rounded-lg bg-dark-600 hover:bg-dark-500 transition-colors text-gray-300"
              >
                Switch Advisor
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          {!selectedPersona ? (
            <motion.div
              key="selection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center px-4 py-12"
            >
              <div className="text-center mb-10">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Sparkles className="w-6 h-6 text-rose-400" />
                  <h2 className="text-3xl font-bold text-white">
                    Choose Your Advisor
                  </h2>
                  <Sparkles className="w-6 h-6 text-rose-400" />
                </div>
                <p className="text-gray-400 max-w-md mx-auto">
                  Select an AI persona tailored to guide you through life&apos;s
                  questions with unique perspectives and expertise.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full">
                {personas.map((persona, index) => (
                  <motion.button
                    key={persona.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1, duration: 0.4 }}
                    onClick={() => selectPersona(persona)}
                    className={`group p-6 rounded-2xl border ${persona.borderColor} ${persona.bgColor} hover:scale-[1.03] transition-all duration-300 text-left`}
                  >
                    <div
                      className={`w-12 h-12 rounded-xl ${persona.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                    >
                      <persona.icon className={`w-6 h-6 ${persona.color}`} />
                    </div>
                    <h3 className={`text-lg font-semibold mb-2 ${persona.color}`}>
                      {persona.name}
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      {persona.description}
                    </p>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col max-w-3xl mx-auto w-full"
            >
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`flex items-start gap-3 max-w-[85%] ${
                          msg.role === "user" ? "flex-row-reverse" : "flex-row"
                        }`}
                      >
                        {msg.role === "advisor" && (
                          <div
                            className={`flex-shrink-0 w-8 h-8 rounded-lg ${selectedPersona.bgColor} flex items-center justify-center mt-1`}
                          >
                            <selectedPersona.icon
                              className={`w-4 h-4 ${selectedPersona.color}`}
                            />
                          </div>
                        )}
                        <div
                          className={`px-4 py-3 rounded-2xl ${
                            msg.role === "user"
                              ? "bg-rose-500/20 border border-rose-500/30 text-gray-100"
                              : `${selectedPersona.bgColor} border ${selectedPersona.borderColor} text-gray-200`
                          }`}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Typing indicator */}
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-lg ${selectedPersona.bgColor} flex items-center justify-center mt-1`}
                      >
                        <selectedPersona.icon
                          className={`w-4 h-4 ${selectedPersona.color}`}
                        />
                      </div>
                      <div
                        className={`px-5 py-4 rounded-2xl ${selectedPersona.bgColor} border ${selectedPersona.borderColor}`}
                      >
                        <div className="flex gap-1.5">
                          <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
                          <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
                          <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-dark-600 bg-dark-800/80 backdrop-blur-sm p-4">
                <form
                  onSubmit={handleSend}
                  className="flex items-center gap-3 max-w-3xl mx-auto"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={`Ask your ${selectedPersona.name}...`}
                    className="flex-1 bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/30 transition-all"
                    disabled={isTyping}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isTyping}
                    className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:bg-rose-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    aria-label="Send message"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-600 bg-dark-800/50 py-6 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
              <span className="font-medium text-gray-400">
                NorwegianSpark SA
              </span>
              <span className="hidden sm:inline">|</span>
              <span>Org. 834 984 172</span>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
              <a
                href="mailto:norwegianspark@gmail.com"
                className="flex items-center gap-1.5 hover:text-rose-400 transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                norwegianspark@gmail.com
              </a>
              <span className="hidden sm:inline">|</span>
              <a
                href="tel:+4799737467"
                className="flex items-center gap-1.5 hover:text-rose-400 transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                +47 99 73 74 67
              </a>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/privacy"
                className="hover:text-rose-400 transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="hover:text-rose-400 transition-colors"
              >
                Terms
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
