"use client";

import { useEffect, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";

interface ImageRow {
  id: string;
  url: string;
  alt: string | null;
  size: number;
  uploadedAt: string;
}

const BLOB_FREE_TIER_BYTES = 1024 * 1024 * 1024; // 1GB on Vercel's Hobby plan

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ImagesPage() {
  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<ImageRow | null>(null);

  function refresh() {
    return fetch("/api/admin/images")
      .then((r) => r.json())
      .then((rows) => {
        setImages(rows);
        setLoading(false);
      });
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDelete() {
    if (!pendingDelete) return;
    await fetch(`/api/admin/images/${pendingDelete.id}`, { method: "DELETE" });
    setPendingDelete(null);
    refresh();
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
  }

  const totalBytes = images.reduce((sum, img) => sum + img.size, 0);
  const percentUsed = Math.min(100, (totalBytes / BLOB_FREE_TIER_BYTES) * 100);

  return (
    <div className="p-6 flex-1 overflow-auto">
      <h1 className="text-lg font-semibold mb-2">Images</h1>
      <p className="text-sm text-[var(--muted)] mb-1">
        {formatBytes(totalBytes)} of 1 GB used ({percentUsed.toFixed(2)}%) on Vercel Blob&apos;s free tier.
      </p>
      <div className="h-1.5 w-full max-w-md bg-[var(--surface)] rounded overflow-hidden mb-6">
        <div className="h-full bg-[var(--accent)]" style={{ width: `${percentUsed}%` }} />
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : images.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No images uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {images.map((img) => (
            <div key={img.id} className="border border-[var(--border)] rounded overflow-hidden">
              <img src={img.url} alt={img.alt || ""} className="w-full h-28 object-cover" />
              <div className="p-2 text-xs text-[var(--muted)]">
                <div>{formatBytes(img.size)}</div>
                <div>{new Date(img.uploadedAt).toLocaleDateString()}</div>
                <div className="flex gap-2 mt-1">
                  <button onClick={() => copyUrl(img.url)} className="hover:text-[var(--text)]">
                    Copy URL
                  </button>
                  <button onClick={() => setPendingDelete(img)} className="hover:text-red-500">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        message="Delete this image? If it's still referenced in a sent campaign, that link will stop working. This can't be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
