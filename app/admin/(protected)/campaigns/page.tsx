"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Campaign {
  id: string;
  title: string;
  subject: string;
  status: "draft" | "sending" | "sent";
  updatedAt: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/admin/campaigns")
      .then((r) => r.json())
      .then((rows) => {
        setCampaigns(rows);
        setLoading(false);
      });
  }, []);

  async function createDraft() {
    setCreating(true);
    const res = await fetch("/api/admin/campaigns", { method: "POST", body: JSON.stringify({}) });
    const row = await res.json();
    router.push(`/admin/campaigns/${row.id}`);
  }

  return (
    <div className="p-6 flex-1 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Campaigns</h1>
        <button
          onClick={createDraft}
          disabled={creating}
          className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white disabled:opacity-50"
        >
          {creating ? "Creating…" : "New draft"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No campaigns yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
              <th className="py-2">Title</th>
              <th className="py-2">Status</th>
              <th className="py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr
                key={c.id}
                className="border-b border-[var(--border)] cursor-pointer hover:bg-[var(--surface)]"
                onClick={() => router.push(`/admin/campaigns/${c.id}`)}
              >
                <td className="py-2">{c.title || "(untitled)"}</td>
                <td className="py-2">{c.status}</td>
                <td className="py-2">{new Date(c.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
