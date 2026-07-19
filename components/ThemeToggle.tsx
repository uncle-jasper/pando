"use client";

import { useEffect, useState } from "react";

type Theme = "auto" | "light" | "dark";
const STORAGE_KEY = "pando-theme";
const NEXT: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };
const LABEL: Record<Theme, string> = { auto: "Theme: Auto", light: "Theme: Light", dark: "Theme: Dark" };

export default function ThemeToggle() {
  // Starts "auto" on the server and every first client render (avoids a hydration mismatch),
  // then syncs to the real stored value once mounted — the beforeInteractive script in
  // app/layout.tsx has already applied it visually by then, so there's no flash either way.
  const [theme, setTheme] = useState<Theme>("auto");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") setTheme(stored);
  }, []);

  function cycle() {
    const next = NEXT[theme];
    setTheme(next);
    if (next === "auto") {
      localStorage.removeItem(STORAGE_KEY);
      document.documentElement.removeAttribute("data-theme");
    } else {
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.setAttribute("data-theme", next);
    }
  }

  return (
    <button onClick={cycle} className="text-[var(--muted)] hover:text-[var(--text)]">
      {LABEL[theme]}
    </button>
  );
}
