"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";

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
  const [pendingDelete, setPendingDelete] = useState<Campaign | null>(null);
  const router = useRouter();

  function refresh() {
    return fetch("/api/admin/campaigns")
      .then((r) => r.json())
      .then((rows) => {
        setCampaigns(rows);
        setLoading(false);
      });
  }

  useEffect(() => {
    refresh();
  }, []);

  async function createDraft() {
    setCreating(true);
    const res = await fetch("/api/admin/campaigns", { method: "POST", body: JSON.stringify({}) });
    const row = await res.json();
    router.push(`/admin/campaigns/${row.id}`);
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    await fetch(`/api/admin/campaigns/${pendingDelete.id}`, { method: "DELETE" });
    setPendingDelete(null);
    refresh();
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
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b border-[var(--border)] hover:bg-[var(--surface)]">
                <td className="py-2 cursor-pointer" onClick={() => router.push(`/admin/campaigns/${c.id}`)}>
                  {c.title || "(untitled)"}
                </td>
                <td className="py-2 cursor-pointer" onClick={() => router.push(`/admin/campaigns/${c.id}`)}>
                  {c.status}
                </td>
                <td className="py-2 cursor-pointer" onClick={() => router.push(`/admin/campaigns/${c.id}`)}>
                  {new Date(c.updatedAt).toLocaleString()}
                </td>
                <td className="py-2 text-right">
                  {c.status === "draft" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(c);
                      }}
                      className="text-[var(--muted)] hover:text-red-500"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        message={`Delete "${pendingDelete?.title || "(untitled)"}"? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
