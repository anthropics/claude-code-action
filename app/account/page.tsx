"use client";

import { useState } from "react";
import UsageBar from "@/components/UsageBar";
import DeleteAccountDialog from "@/components/DeleteAccountDialog";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
}

export default function AccountPage() {
  const [plan] = useState<"free" | "pro">("free");
  const [usage] = useState({ used: 3, limit: 10 });
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function handleUpgrade() {
    const response = await fetch("/api/billing/portal", {
      method: "POST",
    });
    if (response.ok) {
      const data = await response.json();
      window.location.href = data.url;
    }
  }

  async function handleBillingPortal() {
    const response = await fetch("/api/billing/portal", {
      method: "POST",
    });
    if (response.ok) {
      const data = await response.json();
      window.location.href = data.url;
    }
  }

  async function handleGenerateKey() {
    if (!newKeyName.trim()) return;
    setGenerating(true);
    try {
      const response = await fetch("/api/keys/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      if (response.ok) {
        const data = await response.json();
        setGeneratedKey(data.key);
        setApiKeys((prev) => [
          ...prev,
          {
            id: data.id,
            name: data.name,
            prefix: data.key.slice(0, 12) + "...",
            created_at: data.created_at,
          },
        ]);
        setNewKeyName("");
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevokeKey(keyId: string) {
    setRevoking(keyId);
    try {
      const response = await fetch(`/api/keys/generate?id=${keyId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
      }
    } finally {
      setRevoking(null);
    }
  }

  async function handleDeleteAccount() {
    const response = await fetch("/api/account", {
      method: "DELETE",
    });
    if (response.ok) {
      window.location.href = "/";
    }
  }

  async function handleEmailToggle() {
    const newValue = !emailNotifications;
    setEmailNotifications(newValue);
    await fetch("/api/account/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_notifications: newValue }),
    });
  }

  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-white">Account Settings</h1>

        <section className="mt-10 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-white">Plan &amp; Usage</h2>
          <div className="mt-4 flex items-center gap-3">
            <span className="rounded-full bg-brand-600/10 px-3 py-1 text-sm font-medium text-brand-400">
              {plan === "pro" ? "Pro" : "Free"} Plan
            </span>
            {plan === "free" && (
              <button
                onClick={handleUpgrade}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Upgrade to Pro
              </button>
            )}
          </div>
          <div className="mt-6">
            <UsageBar
              used={usage.used}
              limit={usage.limit}
              label="Analyses this month"
            />
          </div>
          <div className="mt-4 flex gap-3">
            {plan === "pro" && (
              <>
                <button
                  onClick={handleBillingPortal}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
                >
                  Manage Billing
                </button>
                <button
                  onClick={handleBillingPortal}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
                >
                  Cancel Subscription
                </button>
              </>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-white">
            Email Preferences
          </h2>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300">Marketing emails</p>
              <p className="text-xs text-gray-500">
                Product updates, tips, and monthly summaries
              </p>
            </div>
            <button
              onClick={handleEmailToggle}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                emailNotifications ? "bg-brand-600" : "bg-gray-700"
              }`}
              role="switch"
              aria-checked={emailNotifications}
              aria-label="Toggle email notifications"
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  emailNotifications ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-white">API Keys</h2>
          <p className="mt-1 text-sm text-gray-400">
            Generate keys to access the PagePulse API programmatically.
          </p>

          {generatedKey && (
            <div className="mt-4 rounded-lg border border-amber-800/50 bg-amber-950/30 p-4">
              <p className="text-sm font-medium text-amber-200">
                Save this key now — it won&apos;t be shown again:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 rounded bg-gray-950 px-3 py-2 text-sm text-green-400">
                  {generatedKey}
                </code>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(generatedKey);
                  }}
                  className="rounded border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:bg-gray-800"
                >
                  Copy
                </button>
              </div>
              <button
                onClick={() => setGeneratedKey(null)}
                className="mt-2 text-xs text-gray-500 hover:text-gray-300"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g., Production)"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              onClick={handleGenerateKey}
              disabled={!newKeyName.trim() || generating}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? "Generating..." : "Generate Key"}
            </button>
          </div>

          {apiKeys.length > 0 && (
            <div className="mt-4 divide-y divide-gray-800 rounded-lg border border-gray-800">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-300">
                      {key.name}
                    </p>
                    <p className="font-mono text-xs text-gray-500">
                      {key.prefix}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRevokeKey(key.id)}
                    disabled={revoking === key.id}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {revoking === key.id ? "Revoking..." : "Revoke"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {apiKeys.length === 0 && !generatedKey && (
            <p className="mt-4 text-sm text-gray-500">
              No API keys yet. Generate one above to get started.
            </p>
          )}
        </section>

        <section className="mt-8 rounded-xl border border-red-900/50 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>
          <p className="mt-2 text-sm text-gray-400">
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </p>
          <div className="mt-4">
            <DeleteAccountDialog onConfirm={handleDeleteAccount} />
          </div>
        </section>
      </div>
    </div>
  );
}
