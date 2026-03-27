"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, Eye, Moon, Stars, Flame, Wind } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface Message {
  id: string;
  role: "user" | "oracle";
  content: string;
  timestamp: string;
}

const QUICK_QUESTIONS = [
  { text: "What does the future hold?", icon: Eye },
  { text: "Tell me about my destiny", icon: Stars },
  { text: "What should I focus on?", icon: Flame },
  { text: "Reveal a hidden truth", icon: Moon },
  { text: "What energy surrounds me?", icon: Wind },
];

const STORAGE_KEY = "brainloop-oracle-history";

function TypingText({ text, onComplete }: { text: string; onComplete: () => void }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
        setDone(true);
        onComplete();
      }
    }, 22);
    return () => clearInterval(interval);
  }, [text, onComplete]);

  return (
    <span>
      {displayed}
      {!done && <span className="typing-cursor" />}
    </span>
  );
}

export default function OraclePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [typingId, setTypingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      // ignore corrupted storage
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      } catch {
        // storage full
      }
    }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingId]);

  const handleTypingComplete = useCallback(() => {
    setTypingId(null);
  }, []);

  const sendQuestion = async (question: string) => {
    if (!question.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/oracle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "The oracle is silent.");
      }

      const data = await res.json();

      const oracleMessage: Message = {
        id: crypto.randomUUID(),
        role: "oracle",
        content: data.answer,
        timestamp: data.timestamp,
      };

      setMessages((prev) => [...prev, oracleMessage]);
      setTypingId(oracleMessage.id);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "The cosmic connection has been disrupted."
      );
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuestion(input);
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    toast.success("The oracle's memory has been cleansed.");
  };

  return (
    <div className="relative min-h-screen flex flex-col nebula-gradient">
      {/* Starfield */}
      <div className="starfield">
        <div className="stars-layer stars-layer-1" />
        <div className="stars-layer stars-layer-2" />
        <div className="stars-layer stars-layer-3" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-mystic-border bg-mystic-bg/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-mystic-purple to-mystic-gold flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold oracle-glow text-mystic-purple-light">
                BrainLoop Oracle
              </h1>
              <p className="text-xs text-gray-500">Ancient Cosmic Divination</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-xs text-gray-500 hover:text-mystic-purple-light transition-colors px-3 py-1.5 rounded-lg border border-mystic-border hover:border-mystic-purple/30"
            >
              Clear History
            </button>
          )}
        </div>
      </header>

      {/* Messages area */}
      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              >
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-mystic-purple/30 to-mystic-gold/20 flex items-center justify-center border border-mystic-purple/30">
                  <Sparkles className="w-12 h-12 text-mystic-purple-light" />
                </div>
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="text-2xl md:text-3xl font-semibold gold-glow text-mystic-gold-light mb-3"
              >
                The Oracle Awaits
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="text-gray-400 max-w-md mb-10 leading-relaxed"
              >
                Speak your question into the cosmic void, and the ancient oracle shall
                divine the hidden truths that surround your path.
              </motion.p>

              {/* Quick-start questions */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.6 }}
                className="flex flex-wrap justify-center gap-3 max-w-2xl"
              >
                {QUICK_QUESTIONS.map((q) => {
                  const Icon = q.icon;
                  return (
                    <button
                      key={q.text}
                      onClick={() => sendQuestion(q.text)}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-mystic-border bg-mystic-surface/60 hover:bg-mystic-surface hover:border-mystic-purple/40 text-sm text-gray-300 hover:text-mystic-purple-light transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Icon className="w-4 h-4" />
                      {q.text}
                    </button>
                  );
                })}
              </motion.div>
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 16, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "oracle" && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-mystic-purple to-mystic-gold flex items-center justify-center mr-3 mt-1 flex-shrink-0">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-5 py-3.5 ${
                        msg.role === "user"
                          ? "user-bubble text-gray-200"
                          : "oracle-bubble text-gray-200"
                      }`}
                    >
                      {msg.role === "oracle" && typingId === msg.id ? (
                        <TypingText text={msg.content} onComplete={handleTypingComplete} />
                      ) : (
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      )}
                      <p className="text-[10px] text-gray-500 mt-2">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-mystic-purple to-mystic-gold flex items-center justify-center mr-3 mt-1 flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-white animate-spin" />
                  </div>
                  <div className="oracle-bubble rounded-2xl px-5 py-3.5">
                    <div className="flex items-center gap-2 text-mystic-purple-light text-sm">
                      <span>The oracle gazes into the cosmic void</span>
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-mystic-purple-light animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-mystic-purple-light animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-mystic-purple-light animate-bounce" style={{ animationDelay: "300ms" }} />
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />

              {/* Quick questions when conversation exists */}
              {!isLoading && messages.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-wrap gap-2 pt-2"
                >
                  {QUICK_QUESTIONS.slice(0, 3).map((q) => {
                    const Icon = q.icon;
                    return (
                      <button
                        key={q.text}
                        onClick={() => sendQuestion(q.text)}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-mystic-border/50 bg-mystic-surface/40 hover:bg-mystic-surface hover:border-mystic-purple/30 text-xs text-gray-400 hover:text-mystic-purple-light transition-all duration-300"
                      >
                        <Icon className="w-3 h-3" />
                        {q.text}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Input area */}
      <div className="relative z-10 border-t border-mystic-border bg-mystic-bg/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the oracle a question..."
              disabled={isLoading}
              maxLength={1000}
              className="flex-1 bg-mystic-surface border border-mystic-border rounded-xl px-4 py-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-mystic-purple/50 focus:ring-1 focus:ring-mystic-purple/30 transition-all duration-300 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-gradient-to-r from-mystic-purple to-mystic-purple-light hover:from-mystic-purple-light hover:to-mystic-purple text-white rounded-xl px-5 py-3 flex items-center gap-2 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Ask</span>
            </button>
          </form>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-mystic-border bg-mystic-bg/90">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-500">
            <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
              <span className="font-medium text-gray-400">NorwegianSpark SA</span>
              <span className="hidden md:inline">|</span>
              <span>Org. 834 984 172</span>
              <span className="hidden md:inline">|</span>
              <a
                href="mailto:norwegianspark@gmail.com"
                className="hover:text-mystic-purple-light transition-colors"
              >
                norwegianspark@gmail.com
              </a>
              <span className="hidden md:inline">|</span>
              <a
                href="tel:+4799737467"
                className="hover:text-mystic-purple-light transition-colors"
              >
                +47 99 73 74 67
              </a>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/privacy"
                className="hover:text-mystic-purple-light transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="hover:text-mystic-purple-light transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
