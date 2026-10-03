"use client";

import { useEffect, useState } from "react";
import type { DashboardStats, Gauge } from "@/lib/dashboard";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatValue(g: Gauge, n: number): string {
  return g.unit === "bytes" ? formatBytes(n) : n.toLocaleString();
}

const LEVEL_COLOR: Record<Gauge["level"], string> = {
  ok: "var(--accent)",
  watch: "#c28a1e",
  high: "#c0392b",
};

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="border border-[var(--border)] rounded p-3">
      <div className="text-2xl font-semibold leading-tight">{value}</div>
      <div className="text-xs text-[var(--muted)] mt-1">{label}</div>
      {hint ? <div className="text-xs text-[var(--muted)] mt-0.5">{hint}</div> : null}
    </div>
  );
}

function GaugeRow({ g }: { g: Gauge }) {
  const width = Math.min(100, g.pct);
  return (
    <div className="mb-4 max-w-xl">
      <div className="flex justify-between text-sm">
        <span>{g.label}</span>
        <span className="text-[var(--muted)]">
          {formatValue(g, g.used)} of {formatValue(g, g.limit)} ({g.pct < 1 && g.pct > 0 ? "<1" : Math.round(g.pct)}%)
        </span>
      </div>
      <div className="h-1.5 w-full bg-[var(--surface)] rounded overflow-hidden mt-1">
        <div className="h-full" style={{ width: `${width}%`, background: LEVEL_COLOR[g.level] }} />
      </div>
      {g.note ? <div className="text-xs text-[var(--muted)] mt-1">{g.note}</div> : null}
    </div>
  );
}

function WeeklyBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const barW = 14;
  const gap = 4;
  const h = 40;
  return (
    <svg width={values.length * (barW + gap)} height={h + 2} role="img" aria-label="New subscribers per week, last 12 weeks">
      {values.map((v, i) => {
        const bh = v === 0 ? 1 : Math.max(2, (v / max) * h);
        return <rect key={i} x={i * (barW + gap)} y={h - bh + 1} width={barW} height={bh} fill="var(--accent)" opacity={v === 0 ? 0.35 : 1} />;
      })}
    </svg>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return <div className="p-6 text-sm text-red-500">Couldn&apos;t load the dashboard: {error}</div>;
  }
  if (!stats) {
    return <div className="p-6 text-sm text-[var(--muted)]">Loading…</div>;
  }

  const a = stats.audience;
  const net = a.joinedLast30 - a.leftLast30;
  const li = stats.lastIssue;

  return (
    <div className="p-6 flex-1 overflow-auto">
      <h1 className="text-lg font-semibold mb-4">Dashboard</h1>

      {stats.warnings.length > 0 && (
        <div className="mb-6 max-w-xl border border-[#c28a1e] rounded p-3 text-sm space-y-2">
          {stats.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      <h2 className="text-sm font-semibold mb-2">Audience</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mb-4">
        <Stat label="Active subscribers" value={a.subscribed.toLocaleString()} />
        <Stat
          label="Net change, last 30 days"
          value={`${net > 0 ? "+" : ""}${net}`}
          hint={`${a.joinedLast30} joined · ${a.leftLast30} left`}
        />
        <Stat label="Awaiting confirmation" value={a.pending.toLocaleString()} />
        <Stat label="Unsubscribed (all time)" value={a.unsubscribed.toLocaleString()} hint={`${a.bounced} bounced · ${a.complained} complained`} />
      </div>
      <div className="mb-2 text-xs text-[var(--muted)]">New subscribers per week, last 12 weeks</div>
      <div className="mb-3">
        <WeeklyBars values={a.weeklyJoins} />
      </div>
      {a.sources.length > 0 && (
        <p className="text-xs text-[var(--muted)] mb-8">
          Where active subscribers came from: {a.sources.map((s) => `${s.source} (${s.count})`).join(" · ")}
        </p>
      )}

      <h2 className="text-sm font-semibold mb-2">Last issue</h2>
      {li ? (
        <div className="mb-8 max-w-3xl">
          <p className="text-sm mb-2">
            {li.title}{" "}
            <span className="text-[var(--muted)]">
              {li.sentAt ? `· sent ${new Date(li.sentAt).toLocaleDateString()}` : "· still sending"}
            </span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Recipients" value={li.recipients.toLocaleString()} />
            <Stat label="Delivered" value={li.delivered.toLocaleString()} />
            <Stat label="Bounced / failed" value={`${li.bounced} / ${li.failed}`} />
            <Stat
              label="Unsubscribed within 7 days"
              value={li.unsubscribedWithin7Days === null ? "—" : li.unsubscribedWithin7Days}
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)] mb-8">Nothing sent yet.</p>
      )}

      <h2 className="text-sm font-semibold mb-2">Capacity (free plans)</h2>
      <p className="text-xs text-[var(--muted)] mb-3 max-w-xl">
        At your list size, a full send takes about {stats.daysToSendList} day{stats.daysToSendList === 1 ? "" : "s"} on the free
        Resend plan.
      </p>
      {stats.gauges.map((g) => (
        <GaugeRow key={g.key} g={g} />
      ))}

      <p className="text-xs text-[var(--muted)] mt-6">Updated {new Date(stats.generatedAt).toLocaleString()}</p>
    </div>
  );
}
