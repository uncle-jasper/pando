"use client";

import { useEffect, useState } from "react";

interface Settings {
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  physicalMailingAddress: string;
  fontFamily: string;
  lightBg: string;
  lightText: string;
  lightMuted: string;
  darkBg: string;
  darkText: string;
  darkMuted: string;
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-sm flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 border border-[var(--border)] rounded" />
      <span className="flex-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 px-2 py-1 text-xs border border-[var(--border)] rounded bg-transparent"
      />
    </label>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [previewDark, setPreviewDark] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then(setSettings);
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  if (!settings) {
    return <p className="p-6 text-sm text-[var(--muted)]">Loading…</p>;
  }

  const bg = previewDark ? settings.darkBg : settings.lightBg;
  const text = previewDark ? settings.darkText : settings.lightText;
  const muted = previewDark ? settings.darkMuted : settings.lightMuted;

  return (
    <div className="p-6 flex-1 overflow-auto flex gap-10 flex-wrap">
      <form onSubmit={handleSave} className="flex flex-col gap-3 max-w-lg">
        <h1 className="text-lg font-semibold mb-1">Settings</h1>
        <p className="text-sm text-[var(--muted)] mb-3">
          This sending identity appears in every email and its compliance footer (required by
          CAN-SPAM/GDPR).
        </p>
        <label className="text-sm">
          From name
          <input
            value={settings.fromName}
            onChange={(e) => setSettings({ ...settings, fromName: e.target.value })}
            className="w-full mt-1 px-2 py-1 border border-[var(--border)] rounded bg-transparent"
          />
        </label>
        <label className="text-sm">
          From email
          <input
            value={settings.fromEmail}
            onChange={(e) => setSettings({ ...settings, fromEmail: e.target.value })}
            placeholder="newsletter@pando.danbenson.me"
            className="w-full mt-1 px-2 py-1 border border-[var(--border)] rounded bg-transparent"
          />
        </label>
        <label className="text-sm">
          Reply-to (optional)
          <input
            value={settings.replyTo || ""}
            onChange={(e) => setSettings({ ...settings, replyTo: e.target.value || null })}
            className="w-full mt-1 px-2 py-1 border border-[var(--border)] rounded bg-transparent"
          />
        </label>
        <label className="text-sm">
          Physical mailing address
          <input
            value={settings.physicalMailingAddress}
            onChange={(e) => setSettings({ ...settings, physicalMailingAddress: e.target.value })}
            className="w-full mt-1 px-2 py-1 border border-[var(--border)] rounded bg-transparent"
          />
        </label>

        <h2 className="text-sm font-semibold mt-4">Branding</h2>
        <p className="text-xs text-[var(--muted)] mb-1">
          Matched to danbenson.me. Emails use the light palette by default and switch to the dark
          palette automatically in mail clients that support it (Apple Mail, Outlook.com, etc).
        </p>
        <label className="text-sm">
          Font family
          <input
            value={settings.fontFamily}
            onChange={(e) => setSettings({ ...settings, fontFamily: e.target.value })}
            className="w-full mt-1 px-2 py-1 border border-[var(--border)] rounded bg-transparent"
          />
        </label>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
          <span className="text-xs text-[var(--muted)] col-span-2">Light mode</span>
          <ColorField label="Background" value={settings.lightBg} onChange={(v) => setSettings({ ...settings, lightBg: v })} />
          <ColorField label="Text" value={settings.lightText} onChange={(v) => setSettings({ ...settings, lightText: v })} />
          <ColorField label="Muted" value={settings.lightMuted} onChange={(v) => setSettings({ ...settings, lightMuted: v })} />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
          <span className="text-xs text-[var(--muted)] col-span-2">Dark mode</span>
          <ColorField label="Background" value={settings.darkBg} onChange={(v) => setSettings({ ...settings, darkBg: v })} />
          <ColorField label="Text" value={settings.darkText} onChange={(v) => setSettings({ ...settings, darkText: v })} />
          <ColorField label="Muted" value={settings.darkMuted} onChange={(v) => setSettings({ ...settings, darkMuted: v })} />
        </div>

        <button type="submit" className="self-start mt-3 px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white">
          {saved ? "Saved" : "Save"}
        </button>
      </form>

      <div className="w-72">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Preview</h2>
          <button
            type="button"
            onClick={() => setPreviewDark(!previewDark)}
            className="text-xs px-2 py-1 border border-[var(--border)] rounded"
          >
            {previewDark ? "Dark" : "Light"}
          </button>
        </div>
        <div
          style={{ background: bg, color: text, fontFamily: settings.fontFamily }}
          className="rounded-lg p-5 text-sm"
        >
          <p style={{ fontWeight: 700, fontSize: "18px", marginBottom: "8px" }}>Your newsletter title</p>
          <p style={{ marginBottom: "10px" }}>This is what your campaign emails will look like.</p>
          <p style={{ color: muted, fontSize: "12px" }}>
            {settings.fromName || "Sender name"} · {settings.physicalMailingAddress || "Mailing address"}
          </p>
        </div>
      </div>
    </div>
  );
}
