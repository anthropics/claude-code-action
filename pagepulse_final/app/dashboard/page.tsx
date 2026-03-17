"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import UsageBar from "@/components/UsageBar";

interface Analysis {
  id: string;
  url: string;
  scores: { seo: number; performance: number; accessibility: number };
  created_at: string;
}

export default function DashboardPage() {
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState({ used: 0, limit: 10 });

  useEffect(() => {
    async function fetchUsage() {
      try {
        const response = await fetch("/api/account");
        if (response.ok) {
          const data = await response.json();
          setUsage({ used: data.scans_used, limit: data.scans_limit });
        }
      } catch {
        // Fall back to defaults
      }
    }
    fetchUsage();
  }, []);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAnalyzing(true);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Analysis failed. Please try again.");
        return;
      }

      const result: Analysis = await response.json();
      setAnalyses((prev) => [result, ...prev]);
      setUsage((prev) => ({ ...prev, used: prev.used + 1 }));
      setUrl("");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  function scoreColor(score: number): string {
    if (score >= 90) return "text-green-400";
    if (score >= 70) return "text-amber-400";
    return "text-red-400";
  }

  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <Link
            href="/account"
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
          >
            Account Settings
          </Link>
        </div>

        <div className="mt-6">
          <UsageBar
            used={usage.used}
            limit={usage.limit}
            label="Analyses used this month"
          />
        </div>

        <form onSubmit={handleAnalyze} className="mt-8">
          <div className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={analyzing || !url.trim()}
              className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {analyzing ? "Analyzing..." : "Analyze"}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </form>

        <div className="mt-12">
          <h2 className="text-xl font-semibold text-white">Recent Analyses</h2>

          {analyses.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-gray-700 p-12 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-300">
                No analyses yet
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Enter a URL above to run your first analysis.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {analyses.map((analysis) => (
                <div
                  key={analysis.id}
                  className="rounded-xl border border-gray-800 bg-gray-900 p-6"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-white">{analysis.url}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {new Date(analysis.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div className="rounded-lg bg-gray-800 p-4 text-center">
                      <p className="text-xs uppercase text-gray-500">SEO</p>
                      <p
                        className={`mt-1 text-2xl font-bold ${scoreColor(analysis.scores.seo)}`}
                      >
                        {analysis.scores.seo}
                      </p>
                    </div>
                    <div className="rounded-lg bg-gray-800 p-4 text-center">
                      <p className="text-xs uppercase text-gray-500">
                        Performance
                      </p>
                      <p
                        className={`mt-1 text-2xl font-bold ${scoreColor(analysis.scores.performance)}`}
                      >
                        {analysis.scores.performance}
                      </p>
                    </div>
                    <div className="rounded-lg bg-gray-800 p-4 text-center">
                      <p className="text-xs uppercase text-gray-500">
                        Accessibility
                      </p>
                      <p
                        className={`mt-1 text-2xl font-bold ${scoreColor(analysis.scores.accessibility)}`}
                      >
                        {analysis.scores.accessibility}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
