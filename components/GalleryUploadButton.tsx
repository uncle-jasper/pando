"use client";

import { useRef, useState } from "react";
import { resizeImageFile } from "@/lib/client-image-resize";

interface GalleryUploadButtonProps {
  onUploaded: (urls: string[]) => void;
}

export default function GalleryUploadButton({ onUploaded }: GalleryUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);

    const urls: string[] = [];
    for (const file of files) {
      try {
        const resized = await resizeImageFile(file);
        const formData = new FormData();
        formData.append("file", resized);
        const res = await fetch("/api/admin/uploads", { method: "POST", body: formData });
        if (res.ok) {
          const row = await res.json();
          urls.push(row.url);
        } else {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "Upload failed.");
        }
      } catch {
        setError("One or more images failed to upload. Try a smaller image or a different format.");
      }
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (urls.length > 0) onUploaded(urls);
  }

  return (
    <span>
      <label className="px-2 py-1 text-sm border border-[var(--border)] rounded cursor-pointer inline-block">
        {uploading ? "Uploading…" : "Insert gallery"}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={handleChange}
          className="hidden"
          disabled={uploading}
        />
      </label>
      {error && <span className="text-xs text-red-500 ml-2">{error}</span>}
    </span>
  );
}
