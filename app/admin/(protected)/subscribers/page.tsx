"use client";

import { useEffect, useRef, useState } from "react";
import { parseSubscriberCsv, subscribersToCsv, triggerDownload } from "@/lib/csv";

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  status: string;
  source: string | null;
  createdAt: string;
}

export default function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setLoading(true);
    return fetch("/api/admin/subscribers")
      .then((r) => r.json())
      .then((rows) => {
        setSubscribers(rows);
        setLoading(false);
      });
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/subscribers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name }),
    });
    if (res.ok) {
      setEmail("");
      setName("");
      refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to add subscriber.");
    }
  }

  async function handleRemove(id: string) {
    await fetch(`/api/admin/subscribers/${id}`, { method: "DELETE" });
    refresh();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseSubscriberCsv(text);
    if (parsed.length === 0) {
      setImportMsg("No valid email rows found in that file.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const res = await fetch("/api/admin/subscribers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscribers: parsed }),
    });
    const body = await res.json();
    setImportMsg(`Imported ${body.imported} of ${body.submitted} rows (duplicates skipped).`);
    if (fileInputRef.current) fileInputRef.current.value = "";
    refresh();
  }

  function handleExport() {
    const csv = subscribersToCsv(subscribers);
    triggerDownload(csv, "pando-subscribers.csv", "text/csv");
  }

  return (
    <div className="p-6 flex-1 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Subscribers</h1>
        <div className="flex gap-2">
          <label className="px-3 py-1.5 text-sm border border-[var(--border)] rounded cursor-pointer">
            Import CSV
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} className="hidden" />
          </label>
          <button onClick={handleExport} className="px-3 py-1.5 text-sm border border-[var(--border)] rounded">
            Export CSV
          </button>
        </div>
      </div>

      {importMsg && <p className="text-sm text-[var(--muted)] mb-3">{importMsg}</p>}

      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          className="px-2 py-1 text-sm border border-[var(--border)] rounded bg-transparent"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="px-2 py-1 text-sm border border-[var(--border)] rounded bg-transparent"
        />
        <button type="submit" className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white">
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : subscribers.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No subscribers yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
              <th className="py-2">Email</th>
              <th className="py-2">Name</th>
              <th className="py-2">Status</th>
              <th className="py-2">Added</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {subscribers.map((s) => (
              <tr key={s.id} className="border-b border-[var(--border)]">
                <td className="py-2">{s.email}</td>
                <td className="py-2">{s.name || ""}</td>
                <td className="py-2">{s.status}</td>
                <td className="py-2">{new Date(s.createdAt).toLocaleDateString()}</td>
                <td className="py-2 text-right">
                  <button onClick={() => handleRemove(s.id)} className="text-[var(--muted)] hover:text-red-500">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
