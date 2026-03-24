import type { Metadata } from "next";
import CopyButton from "@/components/CopyButton";

export const metadata: Metadata = {
  title: "API Documentation",
  description:
    "PagePulse API reference — endpoints, authentication, code examples, and rate limits.",
  openGraph: {
    title: "API Documentation | PagePulse",
    description: "Complete API reference for PagePulse web analysis.",
  },
};

const endpoints = [
  {
    method: "POST",
    path: "/api/analyze",
    description:
      "Analyze a webpage and return SEO, performance, and accessibility data.",
    auth: true,
    body: `{
  "url": "https://example.com",
  "checks": ["seo", "performance", "accessibility"]
}`,
    response: `{
  "id": "analysis_abc123",
  "url": "https://example.com",
  "scores": {
    "seo": 87,
    "performance": 92,
    "accessibility": 78
  },
  "created_at": "2026-03-16T10:00:00Z"
}`,
  },
  {
    method: "GET",
    path: "/api/analyze/:id",
    description: "Retrieve a previous analysis by ID.",
    auth: true,
    body: null,
    response: `{
  "id": "analysis_abc123",
  "url": "https://example.com",
  "scores": { "seo": 87, "performance": 92, "accessibility": 78 },
  "details": { ... },
  "created_at": "2026-03-16T10:00:00Z"
}`,
  },
  {
    method: "GET",
    path: "/api/usage",
    description: "Get your current month's usage and limits.",
    auth: true,
    body: null,
    response: `{
  "plan": "pro",
  "analyses_used": 142,
  "analyses_limit": 1000,
  "period_start": "2026-03-01",
  "period_end": "2026-03-31"
}`,
  },
  {
    method: "POST",
    path: "/api/keys/generate",
    description:
      "Generate a new API key. The plaintext key is only shown once.",
    auth: true,
    body: `{
  "name": "Production Key"
}`,
    response: `{
  "id": "key_xyz789",
  "name": "Production Key",
  "key": "pp_live_abc123...",
  "created_at": "2026-03-16T10:00:00Z"
}`,
  },
];

const curlExample = `curl -X POST https://pagepulse.app/api/analyze \\
  -H "Authorization: Bearer pp_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com"}'`;

const jsExample = `const response = await fetch("https://pagepulse.app/api/analyze", {
  method: "POST",
  headers: {
    "Authorization": "Bearer pp_live_your_api_key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ url: "https://example.com" }),
});

const analysis = await response.json();`;

const pythonExample = `import requests

response = requests.post(
    "https://pagepulse.app/api/analyze",
    headers={"Authorization": "Bearer pp_live_your_api_key"},
    json={"url": "https://example.com"},
)

analysis = response.json()`;

export default function ApiDocsPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-4xl font-bold text-white">API Documentation</h1>
        <p className="mt-4 text-lg text-gray-400">
          Integrate PagePulse analysis into your workflow with our REST API.
        </p>

        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white">Authentication</h2>
          <p className="mt-4 text-gray-400">
            All API requests require authentication via a Bearer token. Generate
            an API key from your{" "}
            <a href="/account" className="text-brand-400 hover:underline">
              account settings
            </a>
            .
          </p>
          <div className="mt-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center justify-between">
              <code className="text-sm text-gray-300">
                Authorization: Bearer pp_live_your_api_key
              </code>
              <CopyButton text="Authorization: Bearer pp_live_your_api_key" />
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-amber-800/50 bg-amber-950/30 p-4">
            <p className="text-sm text-amber-200">
              <strong>Keep your API keys secret.</strong> Never expose them in
              client-side code or public repositories. If a key is compromised,
              revoke it immediately from your account settings.
            </p>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white">Rate Limits</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900">
                  <th className="px-4 py-3 text-left text-gray-400">Plan</th>
                  <th className="px-4 py-3 text-left text-gray-400">
                    Analyses/Month
                  </th>
                  <th className="px-4 py-3 text-left text-gray-400">
                    Requests/Minute
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-800">
                  <td className="px-4 py-3 text-gray-300">Free</td>
                  <td className="px-4 py-3 text-gray-300">10</td>
                  <td className="px-4 py-3 text-gray-300">5</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-300">Pro</td>
                  <td className="px-4 py-3 text-gray-300">1,000</td>
                  <td className="px-4 py-3 text-gray-300">60</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white">Quick Start</h2>
          <div className="mt-6 space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-400">cURL</h3>
              <div className="relative rounded-lg border border-gray-800 bg-gray-900 p-4">
                <pre className="overflow-x-auto text-sm text-gray-300">
                  <code>{curlExample}</code>
                </pre>
                <div className="absolute right-3 top-3">
                  <CopyButton text={curlExample} />
                </div>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-400">
                JavaScript
              </h3>
              <div className="relative rounded-lg border border-gray-800 bg-gray-900 p-4">
                <pre className="overflow-x-auto text-sm text-gray-300">
                  <code>{jsExample}</code>
                </pre>
                <div className="absolute right-3 top-3">
                  <CopyButton text={jsExample} />
                </div>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-400">Python</h3>
              <div className="relative rounded-lg border border-gray-800 bg-gray-900 p-4">
                <pre className="overflow-x-auto text-sm text-gray-300">
                  <code>{pythonExample}</code>
                </pre>
                <div className="absolute right-3 top-3">
                  <CopyButton text={pythonExample} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white">Endpoints</h2>
          <div className="mt-6 space-y-8">
            {endpoints.map((endpoint) => (
              <div
                key={`${endpoint.method}-${endpoint.path}`}
                className="rounded-xl border border-gray-800 bg-gray-900 p-6"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded px-2 py-1 text-xs font-bold ${
                      endpoint.method === "POST"
                        ? "bg-green-900/50 text-green-400"
                        : "bg-blue-900/50 text-blue-400"
                    }`}
                  >
                    {endpoint.method}
                  </span>
                  <code className="text-sm text-white">{endpoint.path}</code>
                  {endpoint.auth && (
                    <span className="rounded bg-amber-900/30 px-2 py-0.5 text-xs text-amber-400">
                      Auth Required
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm text-gray-400">
                  {endpoint.description}
                </p>

                {endpoint.body && (
                  <div className="mt-4">
                    <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">
                      Request Body
                    </h4>
                    <div className="relative rounded-lg border border-gray-800 bg-gray-950 p-4">
                      <pre className="overflow-x-auto text-sm text-gray-300">
                        <code>{endpoint.body}</code>
                      </pre>
                      <div className="absolute right-3 top-3">
                        <CopyButton text={endpoint.body} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">
                    Response
                  </h4>
                  <div className="relative rounded-lg border border-gray-800 bg-gray-950 p-4">
                    <pre className="overflow-x-auto text-sm text-gray-300">
                      <code>{endpoint.response}</code>
                    </pre>
                    <div className="absolute right-3 top-3">
                      <CopyButton text={endpoint.response} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white">Error Codes</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900">
                  <th className="px-4 py-3 text-left text-gray-400">Code</th>
                  <th className="px-4 py-3 text-left text-gray-400">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["400", "Bad Request — invalid URL or parameters"],
                  ["401", "Unauthorized — missing or invalid API key"],
                  ["403", "Forbidden — insufficient plan for this endpoint"],
                  ["429", "Rate limit exceeded — slow down"],
                  ["500", "Internal server error — contact support"],
                ].map(([code, meaning]) => (
                  <tr key={code} className="border-b border-gray-800">
                    <td className="px-4 py-3 font-mono text-red-400">{code}</td>
                    <td className="px-4 py-3 text-gray-300">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
