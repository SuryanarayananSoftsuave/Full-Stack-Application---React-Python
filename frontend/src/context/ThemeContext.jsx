import { createContext, useState, useEffect, useCallback, useMemo } from "react";

// ── Theme system ────────────────────────────────────────────────────────────
// Three values are stored in state:
//   "light" | "dark"  — explicit user choice
//   "system"          — follow the OS preference
//
// We persist the *preference* (one of those three) to localStorage, but the
// *applied* theme is always "light" or "dark" because CSS variables only know
// about those two. Resolving "system" happens in resolveTheme().
//
// To avoid a "flash of the wrong theme" on page load, the actual data-theme
// attribute is set BEFORE React mounts by an inline script in index.html
// (see THEME_INIT_SCRIPT). This provider then takes over once React is alive
// and keeps things in sync from there.

export const ThemeContext = createContext(null);

const STORAGE_KEY = "theme-preference";
const VALID_PREFS = ["light", "dark", "system"];

function getSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStoredPreference() {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return VALID_PREFS.includes(stored) ? stored : "system";
  } catch {
    // localStorage can throw in private mode / SSR — fall back gracefully.
    return "system";
  }
}

function resolveTheme(preference) {
  return preference === "system" ? getSystemTheme() : preference;
}

function applyTheme(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }) {
  // `preference` is what the user chose (might be "system").
  // `theme` is what's actually applied to the DOM (always "light" or "dark").
  const [preference, setPreference] = useState(() => readStoredPreference());
  const [theme, setTheme] = useState(() => resolveTheme(readStoredPreference()));

  // Whenever the preference changes, recompute and apply the resolved theme.
  useEffect(() => {
    const resolved = resolveTheme(preference);
    setTheme(resolved);
    applyTheme(resolved);

    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // ignore — we just won't persist
    }
  }, [preference]);

  // If the user picks "system", listen for OS-level theme flips and react
  // live. The listener is installed only while preference === "system" so
  // we don't waste cycles when the user has an explicit choice.
  useEffect(() => {
    if (preference !== "system") return;
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => {
      const next = e.matches ? "dark" : "light";
      setTheme(next);
      applyTheme(next);
    };

    // Modern + legacy listener APIs (Safari < 14 needs addListener).
    if (mql.addEventListener) {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [preference]);

  // Convenience: a one-click toggle between the two visible themes.
  // If the user is currently on "system", we switch to the *opposite* of
  // whatever the OS is showing, so the click always feels like it did
  // something visible.
  const toggleTheme = useCallback(() => {
    setPreference((prev) => {
      const current = resolveTheme(prev);
      return current === "dark" ? "light" : "dark";
    });
  }, []);

  const value = useMemo(
    () => ({ theme, preference, setPreference, toggleTheme }),
    [theme, preference, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ── Inline init script ──────────────────────────────────────────────────────
// Exported as a string so it can be injected as <script> in index.html.
// This runs synchronously before React mounts and prevents the white flash
// when the user has dark mode enabled.
//
// Keep this in sync with the resolution logic above!
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme;
    if (stored === 'light' || stored === 'dark') {
      theme = stored;
    } else {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) { /* no-op */ }
})();
`;
