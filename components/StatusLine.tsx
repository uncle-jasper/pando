"use client";

interface StatusLineProps {
  message: string | null;
  tone?: "info" | "error" | "success";
}

export default function StatusLine({ message, tone = "info" }: StatusLineProps) {
  if (!message) return null;
  const color = tone === "error" ? "text-red-500" : tone === "success" ? "text-green-600" : "text-[var(--muted)]";
  return <span className={`text-xs ${color}`}>{message}</span>;
}
