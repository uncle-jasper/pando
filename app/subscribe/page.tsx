"use client";

import { useState } from "react";
import Footer from "@/components/Footer";

export default function SubscribePage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name }),
    });
    if (res.ok) {
      setStatus("done");
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold mb-2">Subscribe</h1>
          {status === "done" ? (
            <p className="text-sm text-[var(--muted)]">
              Almost there — check your inbox for a confirmation link.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="px-3 py-2 border border-[var(--border)] rounded bg-transparent"
              />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (optional)"
                className="px-3 py-2 border border-[var(--border)] rounded bg-transparent"
              />
              <button
                type="submit"
                disabled={status === "sending"}
                className="py-2 rounded bg-[var(--accent)] text-white disabled:opacity-50"
              >
                {status === "sending" ? "Submitting…" : "Subscribe"}
              </button>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </form>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
