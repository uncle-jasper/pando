"use client";

import { useEffect, useState } from "react";

export interface PickedImage {
  url: string;
  width: number | null;
  height: number | null;
}

interface ImageRow {
  id: string;
  url: string;
  alt: string | null;
  size: number;
  width: number | null;
  height: number | null;
  uploadedAt: string;
}

interface ImagePickerModalProps {
  // "single" picks one image and closes immediately (hero / inline insert).
  // "multi" lets several be toggled on, with an explicit "Insert" button (gallery insert).
  mode: "single" | "multi";
  onSelect: (images: PickedImage[]) => void;
  onClose: () => void;
}

// Reuses the same grid-of-thumbnails pattern as /admin/images, scoped down to a modal picker
// for inserting already-uploaded photos (Vercel Blob library) into a campaign/template instead
// of only ever uploading a new file from disk.
export default function ImagePickerModal({ mode, onSelect, onClose }: ImagePickerModalProps) {
  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/admin/images")
      .then((r) => r.json())
      .then((rows: ImageRow[]) => {
        setImages(rows);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function toImage(row: ImageRow): PickedImage {
    return { url: row.url, width: row.width, height: row.height };
  }

  function handleClick(row: ImageRow) {
    if (mode === "single") {
      onSelect([toImage(row)]);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }

  function confirmMulti() {
    const chosen = images.filter((row) => selected.has(row.id)).map(toImage);
    if (chosen.length > 0) onSelect(chosen);
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg w-full max-w-2xl h-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
          <span className="text-sm font-semibold">
            {mode === "multi" ? "Choose photos for gallery" : "Choose an image"}
          </span>
          <button onClick={onClose} className="text-sm px-2 py-1">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : images.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No images uploaded yet — upload one first and it&apos;ll show up here next time.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {images.map((row) => {
                const isSelected = selected.has(row.id);
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => handleClick(row)}
                    className={`relative border rounded overflow-hidden ${
                      isSelected ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-[var(--border)]"
                    }`}
                  >
                    <img src={row.url} alt={row.alt || ""} className="w-full h-24 object-cover block" />
                    {mode === "multi" && isSelected && (
                      <span className="absolute top-1 right-1 bg-[var(--accent)] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {mode === "multi" && (
          <div className="p-3 border-t border-[var(--border)] flex justify-end">
            <button
              onClick={confirmMulti}
              disabled={selected.size === 0}
              className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white disabled:opacity-50"
            >
              Insert {selected.size || ""} photo{selected.size === 1 ? "" : "s"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
