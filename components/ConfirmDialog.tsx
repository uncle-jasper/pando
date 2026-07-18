"use client";

// Confirm-overlay pattern forked from tree's wp-confirm-overlay (index.html ~4780-4791):
// a simple yes/no modal that closes on backdrop click or "No".
interface ConfirmDialogProps {
  open: boolean;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, message, confirmLabel = "Yes", onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 max-w-sm">
        <p className="text-sm mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm border border-[var(--border)] rounded">
            No
          </button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
