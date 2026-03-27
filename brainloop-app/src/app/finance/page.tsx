"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Wallet,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  UtensilsCrossed,
  Car,
  Film,
  ShoppingBag,
  Zap,
  Heart,
  GraduationCap,
  MoreHorizontal,
  Target,
  PieChart,
  Calendar,
  Mail,
  Phone,
} from "lucide-react";
import Link from "next/link";

interface Transaction {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  type: "income" | "expense";
}

interface BudgetSettings {
  monthlyBudget: number;
}

const CATEGORIES = [
  { id: "food", name: "Food & Dining", icon: UtensilsCrossed, color: "#f97316", bg: "rgba(249,115,22,0.15)" },
  { id: "transport", name: "Transport", icon: Car, color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  { id: "entertainment", name: "Entertainment", icon: Film, color: "#a855f7", bg: "rgba(168,85,247,0.15)" },
  { id: "shopping", name: "Shopping", icon: ShoppingBag, color: "#ec4899", bg: "rgba(236,72,153,0.15)" },
  { id: "bills", name: "Bills & Utilities", icon: Zap, color: "#eab308", bg: "rgba(234,179,8,0.15)" },
  { id: "health", name: "Health", icon: Heart, color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  { id: "education", name: "Education", icon: GraduationCap, color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  { id: "other", name: "Other", icon: MoreHorizontal, color: "#6b7280", bg: "rgba(107,114,128,0.15)" },
] as const;

const LS_TRANSACTIONS = "bl_finance";
const LS_BUDGET = "bl_budget";

function formatNOK(amount: number): string {
  return `kr ${amount.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getCategoryById(id: string) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[7];
}

function Footer() {
  return (
    <footer className="border-t border-dark-border mt-16 pt-8 pb-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-400">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <span className="font-semibold text-slate-300">NorwegianSpark SA</span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <span>Org. 834 984 172</span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <a
              href="mailto:norwegianspark@gmail.com"
              className="flex items-center gap-1.5 hover:text-orange-400 transition-colors"
            >
              <Mail size={14} />
              norwegianspark@gmail.com
            </a>
            <span className="hidden sm:inline text-slate-600">|</span>
            <a
              href="tel:+4799737467"
              className="flex items-center gap-1.5 hover:text-orange-400 transition-colors"
            >
              <Phone size={14} />
              +47 99 73 74 67
            </a>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-orange-400 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-orange-400 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
        <p className="text-center text-xs text-slate-500 mt-4">
          &copy; {new Date().getFullYear()} NorwegianSpark SA. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default function FinanceTracker() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budget, setBudget] = useState<BudgetSettings>({ monthlyBudget: 15000 });
  const [mounted, setMounted] = useState(false);

  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState("food");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formType, setFormType] = useState<"income" | "expense">("expense");
  const [budgetInput, setBudgetInput] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    try {
      const savedTx = localStorage.getItem(LS_TRANSACTIONS);
      if (savedTx) setTransactions(JSON.parse(savedTx));
      const savedBudget = localStorage.getItem(LS_BUDGET);
      if (savedBudget) {
        const parsed = JSON.parse(savedBudget);
        setBudget(parsed);
        setBudgetInput(String(parsed.monthlyBudget));
      } else {
        setBudgetInput("15000");
      }
    } catch {
      /* ignore parse errors */
    }
    setMounted(true);
  }, []);

  const saveTx = useCallback(
    (txs: Transaction[]) => {
      setTransactions(txs);
      localStorage.setItem(LS_TRANSACTIONS, JSON.stringify(txs));
    },
    []
  );

  const saveBudget = useCallback((b: BudgetSettings) => {
    setBudget(b);
    localStorage.setItem(LS_BUDGET, JSON.stringify(b));
  }, []);

  const handleAddTransaction = () => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!formDescription.trim()) {
      toast.error("Please enter a description");
      return;
    }
    const tx: Transaction = {
      id: crypto.randomUUID(),
      amount,
      category: formCategory,
      description: formDescription.trim(),
      date: formDate,
      type: formType,
    };
    saveTx([tx, ...transactions]);
    setFormAmount("");
    setFormDescription("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setShowForm(false);
    toast.success(
      formType === "income" ? "Income added successfully" : "Expense added successfully"
    );
  };

  const handleDelete = (id: string) => {
    saveTx(transactions.filter((t) => t.id !== id));
    toast.success("Transaction deleted");
  };

  const handleBudgetUpdate = () => {
    const val = parseFloat(budgetInput);
    if (!val || val <= 0) {
      toast.error("Please enter a valid budget amount");
      return;
    }
    saveBudget({ monthlyBudget: val });
    toast.success("Monthly budget updated");
  };

  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpenses;

  const now = new Date();
  const currentMonthExpenses = transactions
    .filter((t) => {
      if (t.type !== "expense") return false;
      const d = new Date(t.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, t) => s + t.amount, 0);

  const budgetPercent =
    budget.monthlyBudget > 0
      ? Math.min((currentMonthExpenses / budget.monthlyBudget) * 100, 100)
      : 0;
  const budgetColor =
    budgetPercent < 60 ? "#22c55e" : budgetPercent < 85 ? "#eab308" : "#ef4444";

  const categoryBreakdown = CATEGORIES.map((cat) => {
    const spent = transactions
      .filter((t) => t.type === "expense" && t.category === cat.id)
      .reduce((s, t) => s + t.amount, 0);
    return { ...cat, spent };
  }).filter((c) => c.spent > 0);

  const maxCategorySpent = Math.max(...categoryBreakdown.map((c) => c.spent), 1);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-8"
        >
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500">
            <Wallet size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
              BrainLoop Finance
            </h1>
            <p className="text-sm text-slate-400">Personal Finance Tracker</p>
          </div>
        </motion.div>

        {/* Balance Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6 mb-6"
        >
          <p className="text-sm text-slate-400 mb-1">Total Balance</p>
          <p
            className={`text-4xl md:text-5xl font-bold ${
              balance >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {formatNOK(balance)}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10">
              <TrendingUp size={20} className="text-green-400" />
              <div>
                <p className="text-xs text-slate-400">Total Income</p>
                <p className="text-lg font-semibold text-green-400">{formatNOK(totalIncome)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10">
              <TrendingDown size={20} className="text-red-400" />
              <div>
                <p className="text-xs text-slate-400">Total Expenses</p>
                <p className="text-lg font-semibold text-red-400">{formatNOK(totalExpenses)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/10">
              <ArrowUpDown size={20} className="text-orange-400" />
              <div>
                <p className="text-xs text-slate-400">Net Balance</p>
                <p
                  className={`text-lg font-semibold ${
                    balance >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {formatNOK(balance)}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Budget Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6 mb-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Target size={20} className="text-amber-400" />
            <h2 className="text-lg font-semibold">Monthly Budget</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                  kr
                </span>
                <input
                  type="number"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  placeholder="15000"
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-dark-bg border border-dark-border text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
                />
              </div>
              <button
                onClick={handleBudgetUpdate}
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium hover:from-orange-600 hover:to-amber-600 transition-all"
              >
                Set
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">
                Spent this month: <span className="text-white font-medium">{formatNOK(currentMonthExpenses)}</span>
              </span>
              <span className="text-slate-400">
                Budget: <span className="text-white font-medium">{formatNOK(budget.monthlyBudget)}</span>
              </span>
            </div>
            <div className="w-full h-4 rounded-full bg-dark-bg overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${budgetPercent}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ backgroundColor: budgetColor }}
              />
            </div>
            <p className="text-xs text-slate-400 text-right">
              {budgetPercent.toFixed(1)}% used
              {budget.monthlyBudget - currentMonthExpenses > 0
                ? ` \u2022 ${formatNOK(budget.monthlyBudget - currentMonthExpenses)} remaining`
                : currentMonthExpenses > budget.monthlyBudget
                ? ` \u2022 ${formatNOK(currentMonthExpenses - budget.monthlyBudget)} over budget`
                : ""}
            </p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Add Transaction */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card p-6"
            >
              <button
                onClick={() => setShowForm(!showForm)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium hover:from-orange-600 hover:to-amber-600 transition-all"
              >
                <Plus size={20} />
                Add Transaction
              </button>
              <AnimatePresence>
                {showForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-5 space-y-4">
                      {/* Type Toggle */}
                      <div className="flex rounded-lg overflow-hidden border border-dark-border">
                        <button
                          onClick={() => setFormType("expense")}
                          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                            formType === "expense"
                              ? "bg-red-500/20 text-red-400 border-r border-dark-border"
                              : "bg-dark-bg text-slate-400 border-r border-dark-border hover:text-slate-300"
                          }`}
                        >
                          Expense
                        </button>
                        <button
                          onClick={() => setFormType("income")}
                          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                            formType === "income"
                              ? "bg-green-500/20 text-green-400"
                              : "bg-dark-bg text-slate-400 hover:text-slate-300"
                          }`}
                        >
                          Income
                        </button>
                      </div>
                      {/* Amount */}
                      <div>
                        <label className="block text-sm text-slate-400 mb-1.5">Amount (kr)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                            kr
                          </span>
                          <input
                            type="number"
                            value={formAmount}
                            onChange={(e) => setFormAmount(e.target.value)}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-dark-bg border border-dark-border text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
                          />
                        </div>
                      </div>
                      {/* Category */}
                      <div>
                        <label className="block text-sm text-slate-400 mb-1.5">Category</label>
                        <select
                          value={formCategory}
                          onChange={(e) => setFormCategory(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-lg bg-dark-bg border border-dark-border text-white focus:outline-none focus:border-orange-500 transition-colors appearance-none cursor-pointer"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {/* Description */}
                      <div>
                        <label className="block text-sm text-slate-400 mb-1.5">Description</label>
                        <input
                          type="text"
                          value={formDescription}
                          onChange={(e) => setFormDescription(e.target.value)}
                          placeholder="e.g., Grocery shopping"
                          className="w-full px-4 py-2.5 rounded-lg bg-dark-bg border border-dark-border text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
                        />
                      </div>
                      {/* Date */}
                      <div>
                        <label className="block text-sm text-slate-400 mb-1.5">Date</label>
                        <div className="relative">
                          <Calendar
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          />
                          <input
                            type="date"
                            value={formDate}
                            onChange={(e) => setFormDate(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-dark-bg border border-dark-border text-white focus:outline-none focus:border-orange-500 transition-colors"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleAddTransaction}
                        className="w-full py-3 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium hover:from-orange-600 hover:to-amber-600 transition-all"
                      >
                        {formType === "income" ? "Add Income" : "Add Expense"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Category Breakdown */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="glass-card p-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <PieChart size={20} className="text-amber-400" />
                <h2 className="text-lg font-semibold">Spending by Category</h2>
              </div>
              {categoryBreakdown.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  No expenses recorded yet
                </p>
              ) : (
                <div className="space-y-3">
                  {categoryBreakdown
                    .sort((a, b) => b.spent - a.spent)
                    .map((cat) => {
                      const Icon = cat.icon;
                      const pct = (cat.spent / maxCategorySpent) * 100;
                      const totalPct =
                        totalExpenses > 0
                          ? ((cat.spent / totalExpenses) * 100).toFixed(1)
                          : "0";
                      return (
                        <div key={cat.id} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className="p-1.5 rounded-md"
                                style={{ backgroundColor: cat.bg }}
                              >
                                <Icon size={14} style={{ color: cat.color }} />
                              </div>
                              <span className="text-sm text-slate-300">{cat.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-medium">{formatNOK(cat.spent)}</span>
                              <span className="text-xs text-slate-400 ml-2">{totalPct}%</span>
                            </div>
                          </div>
                          <div className="w-full h-2 rounded-full bg-dark-bg overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </motion.div>
          </div>

          {/* Right Column - Transaction List */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-card p-6"
          >
            <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
            {transactions.length === 0 ? (
              <div className="text-center py-12">
                <Wallet size={40} className="mx-auto text-slate-600 mb-3" />
                <p className="text-slate-400">No transactions yet</p>
                <p className="text-sm text-slate-500">Add your first transaction to get started</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                <AnimatePresence>
                  {transactions.map((tx) => {
                    const cat = getCategoryById(tx.category);
                    const Icon = cat.icon;
                    return (
                      <motion.div
                        key={tx.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex items-center gap-3 p-3 rounded-lg bg-dark-bg/50 border border-dark-border hover:border-orange-500/30 transition-colors group"
                      >
                        <div
                          className="p-2 rounded-lg shrink-0"
                          style={{ backgroundColor: cat.bg }}
                        >
                          <Icon size={18} style={{ color: cat.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{tx.description}</p>
                          <p className="text-xs text-slate-400">
                            {cat.name} &bull; {new Date(tx.date).toLocaleDateString("nb-NO")}
                          </p>
                        </div>
                        <p
                          className={`text-sm font-semibold shrink-0 ${
                            tx.type === "income" ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {tx.type === "income" ? "+" : "-"}
                          {formatNOK(tx.amount)}
                        </p>
                        <button
                          onClick={() => handleDelete(tx.id)}
                          className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                          aria-label="Delete transaction"
                        >
                          <Trash2 size={16} />
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
