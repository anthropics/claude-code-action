"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<
    "loading" | "success" | "error" | "invalid"
  >("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      setMessage(
        "Missing unsubscribe token. Please use the link from your email.",
      );
      return;
    }

    async function unsubscribe() {
      try {
        const response = await fetch("/api/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (response.ok) {
          setStatus("success");
          setMessage(
            "You have been successfully unsubscribed from all marketing emails.",
          );
        } else {
          const data = await response.json();
          setStatus("error");
          setMessage(
            data.error || "Failed to unsubscribe. The link may have expired.",
          );
        }
      } catch {
        setStatus("error");
        setMessage("A network error occurred. Please try again later.");
      }
    }

    unsubscribe();
  }, [token]);

  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-lg text-center">
        {status === "loading" && (
          <>
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-700 border-t-brand-500" />
            <h1 className="mt-6 text-2xl font-bold text-white">
              Processing...
            </h1>
            <p className="mt-2 text-gray-400">
              Updating your email preferences.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-900/30">
              <svg
                className="h-8 w-8 text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="mt-6 text-2xl font-bold text-white">Unsubscribed</h1>
            <p className="mt-2 text-gray-400">{message}</p>
            <p className="mt-4 text-sm text-gray-500">
              You will still receive transactional emails such as password
              resets and billing notifications.
            </p>
          </>
        )}

        {(status === "error" || status === "invalid") && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-900/30">
              <svg
                className="h-8 w-8 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h1 className="mt-6 text-2xl font-bold text-white">
              {status === "invalid" ? "Invalid Link" : "Something Went Wrong"}
            </h1>
            <p className="mt-2 text-gray-400">{message}</p>
            <p className="mt-4 text-sm text-gray-500">
              If you continue to receive unwanted emails, contact us at{" "}
              <a
                href="mailto:norwegianspark@gmail.com"
                className="text-brand-400 hover:underline"
              >
                norwegianspark@gmail.com
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-24">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-700 border-t-brand-500" />
            <h1 className="mt-6 text-2xl font-bold text-white">Loading...</h1>
          </div>
        </div>
      }
    >
      <UnsubscribeContent />
    </Suspense>
  );
}
