"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";

interface Template {
  id: string;
  name: string;
  updatedAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Template | null>(null);
  const router = useRouter();

  function refresh() {
    return fetch("/api/admin/templates")
      .then((r) => r.json())
      .then((rows) => {
        setTemplates(rows);
        setLoading(false);
      });
  }

  useEffect(() => {
    refresh();
  }, []);

  async function createTemplate() {
    setCreating(true);
    const res = await fetch("/api/admin/templates", { method: "POST", body: JSON.stringify({}) });
    const row = await res.json();
    router.push(`/admin/templates/${row.id}`);
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    await fetch(`/api/admin/templates/${pendingDelete.id}`, { method: "DELETE" });
    setPendingDelete(null);
    refresh();
  }

  return (
    <div className="p-6 flex-1 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Templates</h1>
        <button
          onClick={createTemplate}
          disabled={creating}
          className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white disabled:opacity-50"
        >
          {creating ? "Creating…" : "New template"}
        </button>
      </div>
      <p className="text-sm text-[var(--muted)] mb-4">
        Templates are reusable starting points. Creating a new campaign from a template copies its
        content in — editing the template afterward doesn&apos;t change campaigns already created from it.
      </p>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No templates yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
              <th className="py-2">Name</th>
              <th className="py-2">Updated</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-[var(--border)] hover:bg-[var(--surface)]">
                <td className="py-2 cursor-pointer" onClick={() => router.push(`/admin/templates/${t.id}`)}>
                  {t.name || "(untitled template)"}
                </td>
                <td className="py-2 cursor-pointer" onClick={() => router.push(`/admin/templates/${t.id}`)}>
                  {new Date(t.updatedAt).toLocaleString()}
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(t);
                    }}
                    className="text-[var(--muted)] hover:text-red-500"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        message={`Delete "${pendingDelete?.name || "(untitled template)"}"? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
