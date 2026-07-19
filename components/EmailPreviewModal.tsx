"use client";

import { useState } from "react";

interface EmailPreviewModalProps {
  campaignId: string;
  onClose: () => void;
}

export default function EmailPreviewModal({ campaignId, onClose }: EmailPreviewModalProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg w-full max-w-2xl h-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
          <div className="flex gap-1">
            <button
              onClick={() => setTheme("light")}
              className={`px-2 py-1 text-sm rounded ${theme === "light" ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}
            >
              Light
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`px-2 py-1 text-sm rounded ${theme === "dark" ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}
            >
              Dark
            </button>
          </div>
          <span className="text-xs text-[var(--muted)]">
            This is the actual email HTML — both are always sent; the recipient&apos;s mail client picks one.
          </span>
          <button onClick={onClose} className="text-sm px-2 py-1">
            Close
          </button>
        </div>
        <iframe
          key={theme}
          src={`/api/admin/campaigns/${campaignId}/preview?theme=${theme}`}
          className="flex-1 w-full bg-white"
          title="Email preview"
        />
      </div>
    </div>
  );
}
