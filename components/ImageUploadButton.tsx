"use client";

import { useRef, useState } from "react";

interface ImageUploadButtonProps {
  label: string;
  onUploaded: (url: string) => void;
  className?: string;
}

export default function ImageUploadButton({ label, onUploaded, className }: ImageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/admin/uploads", { method: "POST", body: formData });
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";

    if (res.ok) {
      const row = await res.json();
      onUploaded(row.url);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Upload failed.");
    }
  }

  return (
    <span>
      <label className={className || "px-2 py-1 text-sm border border-[var(--border)] rounded cursor-pointer inline-block"}>
        {uploading ? "Uploading…" : label}
        <input
          ref={inputRef}
          type="file"
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
