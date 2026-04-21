# Chapter 9 — Theming: Light & Dark Mode End-to-End

> **What you'll learn**
> - Why theming with **CSS variables + a single `data-*` attribute** beats every other approach
> - How to design a **token system** (surfaces, text, borders, badges, alerts) instead of one-off colors
> - How to build a **`ThemeContext` + `useTheme()` hook** that persists to `localStorage` and follows the OS preference
> - How to prevent the dreaded **"flash of wrong theme"** on hard refresh with a tiny pre-hydration script
> - How to theme third-party components (Recharts) that **can't read CSS variables**
> - The exact files we touched in this app and the reasoning behind every decision

This chapter is a real walkthrough of the dark/light mode we shipped in this project. By the end you'll be able to implement the same pattern in any React app, and (more importantly) you'll know *why* each piece is there.

---

## 1. The big idea (60 seconds)

There are three ways apps usually do dark mode. Two are bad.

| Approach | How it works | Verdict |
| --- | --- | --- |
| **Duplicate stylesheets** | Ship a `light.css` and `dark.css`, swap the `<link>` | Slow, flashes, doubles your CSS payload |
| **Class-based variants** | Write `.card { background: white } .dark .card { background: #111 }` everywhere | Doubles every selector, becomes unmaintainable, leaks into JS |
| **CSS variables + data attribute** ✅ | Define tokens once, override under `[data-theme="dark"]`, components consume `var(--token)` | Single source of truth, instant swap, zero re-renders, no JS in the hot path |

We picked option 3. The whole theming system boils down to:

```
1. <html data-theme="dark">             ← the only thing JS does
2. CSS variables on :root re-resolve    ← browser handles this for free
3. Every component already uses var()   ← no component code changes
```

Flipping that one attribute re-themes the entire app in one paint frame. No re-renders. No flash. No JS doing per-component styling.

---

## 2. Designing the token system

The temptation when adding dark mode is to reach for `color-mode: dark` and start sprinkling `#0f172a` everywhere. Resist it.

A good theme system has **two layers**:

```
Layer 1: PRIMITIVE tokens   →  --slate-50, --slate-900, --indigo-500
Layer 2: SEMANTIC tokens    →  --color-surface, --color-text, --color-border
```

Components only ever consume **semantic** tokens. The primitive layer is implementation detail. This means:

- Renaming `--color-text` from "near-black" to "near-white" in dark mode is a one-line change
- A button that says `color: var(--color-text)` does the right thing in **both** themes automatically
- Adding a third theme later (high-contrast, sepia, brand-themed) is just another `[data-theme="..."]` block

### The categories we ended up with

Open [frontend/src/styles/global.css](../frontend/src/styles/global.css) and you'll see these groups:

| Group | Examples | Why a group? |
| --- | --- | --- |
| **Brand** | `--color-primary`, `--color-primary-hover`, `--color-primary-soft` | Buttons, links, focus rings — change brand color in one place |
| **Text** | `--color-text-strong`, `--color-text`, `--color-text-light`, `--color-text-muted` | Four levels of hierarchy, not 400 hex codes |
| **Surfaces** | `--color-bg`, `--color-surface`, `--color-surface-2`, `--color-surface-hover` | Layered like cards: page → card → raised |
| **Borders** | `--color-border`, `--color-border-soft`, `--color-border-strong` | Hairlines vs structural borders |
| **Status badges** | `--badge-todo-bg/-fg`, `--badge-in-progress-bg/-fg`, … | Each badge is a *pair* (background + text) so it stays legible in both themes |
| **Alerts** | `--alert-success-bg/-fg/-border`, `--alert-error-…` | Toasts, form errors |
| **Chrome** | `--shadow`, `--shadow-lg`, `--color-backdrop`, `--focus-ring` | Effects that need different alpha values on dark backgrounds |

> **Rule of thumb**: if you've used the same hex code in two places, it should be a token.

### Light vs dark — the actual definitions

```19:35:frontend/src/styles/global.css
:root,
[data-theme="light"] {
  /* Brand */
  --color-primary: #4f46e5;
  --color-primary-hover: #4338ca;
  --color-primary-soft: #eef2ff;
  --color-primary-soft-text: #4338ca;
  --color-danger: #dc2626;
```

```115:148:frontend/src/styles/global.css
[data-theme="dark"] {
  /* Brand */
  --color-primary: #818cf8;          /* indigo-400 — pops on dark */
  --color-primary-hover: #6366f1;
  --color-primary-soft: rgba(129, 140, 248, 0.16);
  --color-primary-soft-text: #c7d2fe;
  --color-danger: #f87171;
```

A few subtle decisions worth noticing:

1. **Brand color shifts lighter in dark mode.** `#4f46e5` (indigo-600) is hard to read on a dark background. We bump it up to `#818cf8` (indigo-400). The tokens hide this detail from components — they just say `var(--color-primary)`.

2. **"Soft" variants use `rgba()` in dark mode.** A solid `#eef2ff` would look like a bright lavender stain on dark surfaces. A translucent indigo at 16% alpha looks like a gentle wash that picks up the surface beneath it. Same intent, different mechanism.

3. **Status badges use translucent fills in dark mode.**

   ```163:170:frontend/src/styles/global.css
     /* Status badges — translucent tint over surface */
     --badge-todo-bg: rgba(148, 163, 184, 0.18);   --badge-todo-fg: #cbd5e1;
     --badge-in-progress-bg: rgba(59, 130, 246, 0.22); --badge-in-progress-fg: #93c5fd;
     --badge-in-review-bg: rgba(245, 158, 11, 0.22);   --badge-in-review-fg: #fcd34d;
     --badge-done-bg: rgba(16, 185, 129, 0.22);        --badge-done-fg: #6ee7b7;
   ```

   Solid pastel fills (`#dbeafe` blue) look great on white but become glowing patches on dark. Translucent over a dark surface stays the same hue but loses brightness — exactly what you want.

4. **Shadows get heavier alpha in dark mode.**

   ```57:62:frontend/src/styles/global.css
     --shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
     --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
     --shadow-md: 0 1px 4px rgba(15, 23, 42, 0.06);
     --shadow-lg: 0 4px 12px rgba(15, 23, 42, 0.08);
     --shadow-xl: 0 24px 64px rgba(0, 0, 0, 0.22);
   ```

   `rgba(0,0,0,0.08)` on white is a clear shadow. `rgba(0,0,0,0.08)` on `#0b1220` is invisible. Dark mode bumps these to 0.4–0.6 alpha so cards still feel raised.

5. **`--color-white` is a legacy alias.** Some older CSS modules say `background: var(--color-white)`. We could rename them all, but it's much less risky to remap the variable in dark mode:

   ```43:43:frontend/src/styles/global.css
     --color-white: #ffffff;       /* legacy alias used in many modules */
   ```

   ```138:138:frontend/src/styles/global.css
     --color-white: #111827;            /* legacy alias remapped */
   ```

   Now any `var(--color-white)` automatically becomes a dark surface in dark mode. **No component changes needed.** This is the superpower of token systems — you can refactor without touching consumers.

---

## 3. The runtime: `ThemeContext`

CSS handles the visual swap. JavaScript only has to do one thing: **decide what the current theme should be and set `data-theme` on `<html>`**.

That logic lives in [frontend/src/context/ThemeContext.jsx](../frontend/src/context/ThemeContext.jsx).

### Three values, not two

You might think "light or dark" is enough. It isn't. We track three states:

| Value | Meaning |
| --- | --- |
| `"light"` | User explicitly chose light |
| `"dark"` | User explicitly chose dark |
| `"system"` | Follow the OS — and react live when the OS flips |

`"system"` is the **default** for new visitors. It's the modern, polite default.

Internally we store two things:

- `preference` — what the user *chose* (one of the three)
- `theme` — what's actually *applied* (always `"light"` or `"dark"` — CSS only knows those)

`theme` is derived from `preference` via `resolveTheme()`:

```44:46:frontend/src/context/ThemeContext.jsx
function resolveTheme(preference) {
  return preference === "system" ? getSystemTheme() : preference;
}
```

### Two effects, two responsibilities

Inside `ThemeProvider` we use two `useEffect`s, each doing exactly one thing:

**Effect 1 — sync state to the DOM and `localStorage`:**

```56:66:frontend/src/context/ThemeContext.jsx
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
```

**Effect 2 — listen to OS changes (only when in `"system"` mode):**

```70:90:frontend/src/context/ThemeContext.jsx
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
```

Two key React patterns are at work here:

- **Single-responsibility effects.** Each `useEffect` does one job. We could squish them into one, but then changing preference logic would risk breaking the OS-listener logic and vice versa.
- **Conditional listener installation.** The OS listener is only mounted when it's actually needed. If the user's chosen `"light"` explicitly, we don't subscribe to OS changes — the OS flipping shouldn't override their choice.

### The toggle UX

`toggleTheme()` looks tiny but has a thoughtful detail:

```95:103:frontend/src/context/ThemeContext.jsx
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
```

If the user is on `"system"` and the OS is dark, clicking toggle should switch to **light** — the screen visibly changes. If we just flipped `"system"` to `"light"`, nothing would happen visually (still dark) and the user would think the button is broken. So we resolve first, then flip the *resolved* theme.

This is the kind of detail that separates "works" from "feels right."

### `useTheme()` — the consumer hook

Standard pattern, mirrors `useAuth`:

```1:15:frontend/src/hooks/useTheme.js
import { useContext } from "react";
import { ThemeContext } from "../context/ThemeContext";

export function useTheme() {
  const context = useContext(ThemeContext);

  // Same guard pattern as useAuth: if a component calls useTheme() without
  // a ThemeProvider above it, fail loudly with a useful message instead of
  // crashing later on a destructure of `null`.
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
```

Why throw instead of returning `null`? Because the alternative is destructuring `null` somewhere downstream and getting a cryptic `Cannot read properties of null (reading 'theme')`. Throwing here points right at the bug.

---

## 4. Killing the flash — the pre-hydration script

This is the most important UX detail in the whole feature.

### The problem

Without intervention, here's what happens on a hard refresh when the user has dark mode saved:

```
t=0ms    HTML loads, CSS applies → page is white (default theme)
t=80ms   JS bundle parses
t=120ms  React mounts, ThemeProvider runs
t=121ms  ThemeProvider sets data-theme="dark" → page goes dark
```

The user sees a **white flash for ~120ms**. It's jarring, looks unprofessional, and worst of all it gets *worse* on slow connections.

### The fix

Run the theme-resolution logic *before* React even loads, as a synchronous inline script in `<head>`:

```9:25:frontend/index.html
    <script>
      // Apply the saved (or system) theme BEFORE React renders so users
      // never see a flash of the wrong theme on hard refresh. Mirrors the
      // resolution logic in src/context/ThemeContext.jsx.
      (function () {
        try {
          var stored = localStorage.getItem('theme-preference');
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
    </script>
```

Things to notice:

- It's an **IIFE** so it doesn't pollute global scope.
- It's wrapped in `try/catch` because `localStorage` can throw in private mode or sandboxed iframes.
- It's plain ES5 (`var`, no arrow functions) so it works even in really old browsers without transpilation.
- It runs **synchronously** — the browser blocks rendering until it finishes. That's exactly what we want here. The script is ~15 lines; the cost is negligible.
- It must be **placed before any CSS-affecting content**. We put it in `<head>` before the `<body>`.

### The duplication trade-off

You'll notice this script duplicates the resolution logic from `ThemeContext.jsx`. That's intentional. The alternatives are worse:

- Importing the logic from a module → can't, this runs *before* the bundle loads
- Generating it at build time → adds Vite plugin complexity
- Inlining a templated version from JS → same problem

Fifteen lines of duplication is the cheapest, most reliable solution. We just leave a comment ("Mirrors the resolution logic in `ThemeContext.jsx`") so future-you remembers to update both if you change the storage key.

---

## 5. The toggle UI

The toggle component is intentionally small:

```44:60:frontend/src/components/ThemeToggle.jsx
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
```

A few UX conventions baked in:

| Decision | Why |
| --- | --- |
| Show the icon of what you'll **get**, not what you **have** | Sun while in dark mode (= "click to get sunshine"). This is the convention every major app uses (GitHub, Twitter, VS Code). |
| `aria-label` matches `title` | Screen readers hear the same thing your hover tooltip shows. |
| Inline SVG, not an icon library | Zero network cost, pure CSS coloring via `currentColor`. |
| `type="button"` | Prevents accidental form submission if the toggle is ever placed inside a `<form>`. |

The placement matters too. We put it in:

1. The **Navbar** — for authenticated users (the main usage).
2. The **top-right corner of Login/Register** — so users can switch themes *before* signing in. New users decide whether they like the look on first impression.

---

## 6. Theming third-party components (Recharts)

Here's where pure CSS variables hit a wall. **Recharts SVGs render their own elements** and need actual color values passed as props — they can't read `var(--chart-axis)` from the surrounding CSS.

This is a common problem with any chart library, animation library, or canvas-based component. The solution is the same everywhere: **derive a JS-readable palette from the current theme**.

```146:163:frontend/src/pages/Dashboard/DashboardPage.jsx
export function DashboardPage() {
  const { user } = useAuth();
  const userId = user?.id || user?._id;
  const { theme } = useTheme();

  // Recharts SVGs can't read CSS variables directly, so we derive a small
  // palette from the active theme. Memoised on `theme` so it only recomputes
  // when the user actually flips the toggle.
  const chartColors = useMemo(() => {
    const isDark = theme === "dark";
    return {
      axis: isDark ? "#64748b" : "#94a3b8",
      axisStrong: isDark ? "#94a3b8" : "#475569",
      grid: isDark ? "#1f2a3d" : "#e2e8f0",
      pieStroke: isDark ? "#111827" : "#ffffff",   // matches --color-surface
      cursorFill: isDark
        ? "rgba(148, 163, 184, 0.10)"
        : "rgba(148, 163, 184, 0.08)",
      legend: isDark ? "#94a3b8" : "#475569",
    };
  }, [theme]);
```

Then the chart elements consume these:

```399:404:frontend/src/pages/Dashboard/DashboardPage.jsx
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartColors.grid} />
              <XAxis type="number" stroke={chartColors.axis} fontSize={12} />
              <YAxis type="category" dataKey="name" stroke={chartColors.axisStrong} fontSize={13} width={70} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: chartColors.cursorFill }} /></code>
```

Two important React patterns at work:

1. **`useMemo` keyed on `theme`.** The `chartColors` object only recomputes when the theme actually flips, not on every render. Otherwise we'd allocate a fresh object every render, which would in turn cause Recharts to re-mount (because props are reference-compared).

2. **One palette object, not five `useMemo`s.** Grouping related values into a single memoized object is cleaner and more efficient than memoizing each color separately.

> **Note**: For pure CSS vector or canvas elements, an alternative is to read computed styles via `getComputedStyle(document.documentElement).getPropertyValue('--chart-axis')`. That works but you have to manually re-read on theme change. Going via `useTheme()` is much cleaner because React handles the re-render for you.

---

## 7. Provider order in `App.jsx`

```26:47:frontend/src/App.jsx
function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            {/* Guest routes: only accessible when NOT logged in */}
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>
```

`ThemeProvider` sits **above** `AuthProvider`. Why?

- The toggle appears on the Login page (which is shown when there is *no* auth)
- We want the theme to persist across login/logout boundaries
- Theming has no dependency on auth state, but auth state has no dependency on theme either — so the order is determined by which one needs to be available in *more* places. Theme wins because it's used on every screen including the unauthenticated ones.

`BrowserRouter` is outermost because both providers might want to call routing hooks in the future.

> **General rule**: providers should be ordered from "most universal" (outermost) to "most specific" (innermost).

---

## 8. The migration that wasn't

When we added dark mode, we touched **~20 CSS files**, but the changes were almost all mechanical:

- Replace `#fff` with `var(--color-surface)` (or kept `var(--color-white)` as the legacy alias)
- Replace `#f8fafc` with `var(--color-surface-hover)`
- Replace status/priority badge hex codes with `var(--badge-*)`
- Replace modal backdrops `rgba(15,23,42,0.55)` with `var(--color-backdrop)`

**Zero component logic changed.** Not one `.jsx` file (other than the Dashboard, for the Recharts reasons above) needed touching to support dark mode. That's the dividend of the variable-based approach: a one-time refactor of styles, then dark mode is essentially "free" forever.

If you're starting a new project, **use design tokens from day one**, even if you don't have a dark mode planned. When the dark mode request inevitably arrives, you'll already be 90% done.

---

## 9. Why we did it this way (alternatives we rejected)

| Alternative | Why we didn't pick it |
| --- | --- |
| Tailwind's `dark:` variant | We already had CSS modules with hand-rolled tokens; bolting Tailwind on for one feature would have been heavy. |
| `prefers-color-scheme` only (no toggle) | Users want override capability. Forcing them to change their OS to use a different theme in your app is hostile UX. |
| Theming via Context + inline styles | Defeats the point — every component re-renders to switch theme, instead of letting CSS do it for free. |
| A theming library (e.g. `next-themes`) | One file of our own (~120 lines) covers everything we need. Pulling in a dependency for that is over-engineering. |
| Storing the **resolved** theme (`light`/`dark`) in localStorage instead of the **preference** | Then `"system"` is unrepresentable. Users who want OS-following can't have it. |

---

## 10. How to add a new themable thing

Say you want to add a `<Tooltip>` component with a background, text color, and a subtle border. Follow this checklist:

1. **Use semantic tokens, not raw hex.**
   ```css
   .tooltip {
     background: var(--tooltip-bg);
     color: var(--tooltip-fg);
     border: 1px solid var(--color-border);
   }
   ```
2. **If you need a token that doesn't exist yet, add it to *both* themes** in `global.css`. Add it to `[data-theme="light"]` first, then add the dark equivalent immediately. Never add a token to just one theme — it will be `undefined` in the other and your component will look broken.
3. **Test the swap.** Open the page, click the toggle, and check both themes look right. Pay extra attention to:
   - Hover states (you set them too?)
   - Focus rings (still visible on both surfaces?)
   - Shadows (still visible on dark, not too heavy on light?)
   - Disabled states (still readable but clearly inactive?)

---

## Try it yourself

Pick one and do it:

1. **Add a "system" option** to the toggle. Right now it's a single-icon toggle that flips between light and dark. Replace it with a three-way switch (Sun / Moon / Monitor icon) that lets the user pick `"light"`, `"dark"`, or `"system"` explicitly. The state plumbing is already there — `setPreference` accepts all three values.
2. **Add a third theme.** Create `[data-theme="sepia"]` in `global.css` with warm parchment colors. Add a button somewhere to set `preference: "sepia"`. Notice that **no component code has to change** — this is the whole point.
3. **Add a "high contrast" mode.** Same as above but with maximum-contrast colors and thicker borders for accessibility. Bonus: gate it on `@media (prefers-contrast: more)` so it auto-applies for users who request it.
4. **Theme an inline-style component.** Find a JSX file that uses `style={{ color: "..." }}` and refactor it to use a memoized palette derived from `useTheme()`, like we did for Recharts.

---

## Cheat sheet

| Concept | One-liner |
| --- | --- |
| **The whole pattern** | CSS variables on `:root`, override under `[data-theme="dark"]`, JS just sets the attribute |
| **Token layers** | Primitive (raw colors) → Semantic (`--color-text`) → Components only use semantic |
| **Three preferences** | `"light"`, `"dark"`, `"system"` — store the preference, derive the theme |
| **Avoid the flash** | Inline `<script>` in `<head>` that sets `data-theme` before React boots |
| **Toggle convention** | Show the icon of what you'll *get*, not what you *have* |
| **Live OS sync** | `matchMedia("(prefers-color-scheme: dark)")` + `addEventListener("change", …)` — only when in `"system"` mode |
| **Persisting** | `localStorage.setItem("theme-preference", preference)` — wrap in `try/catch` for private mode |
| **Third-party libs** | `useMemo` a palette object keyed on `theme`, pass values as props |
| **Provider order** | More universal → more specific. `ThemeProvider` above `AuthProvider`. |
| **Adding a token** | Add it to `[data-theme="light"]` AND `[data-theme="dark"]` in the same commit. Never one without the other. |

---

## Files in this app

| File | Role |
| --- | --- |
| [`frontend/src/styles/global.css`](../frontend/src/styles/global.css) | All theme tokens for both themes |
| [`frontend/src/context/ThemeContext.jsx`](../frontend/src/context/ThemeContext.jsx) | `ThemeProvider`, OS listener, persistence |
| [`frontend/src/hooks/useTheme.js`](../frontend/src/hooks/useTheme.js) | Consumer hook with the standard guard |
| [`frontend/src/components/ThemeToggle.jsx`](../frontend/src/components/ThemeToggle.jsx) | The Sun/Moon button |
| [`frontend/src/components/ThemeToggle.module.css`](../frontend/src/components/ThemeToggle.module.css) | Toggle styles |
| [`frontend/index.html`](../frontend/index.html) | Pre-hydration script that prevents the flash |
| [`frontend/src/App.jsx`](../frontend/src/App.jsx) | Wraps the tree in `ThemeProvider` |
| [`frontend/src/components/layout/Navbar.jsx`](../frontend/src/components/layout/Navbar.jsx) | Hosts the toggle in the app shell |
| [`frontend/src/pages/Login/LoginPage.jsx`](../frontend/src/pages/Login/LoginPage.jsx) | Hosts the toggle pre-auth |
| [`frontend/src/pages/Dashboard/DashboardPage.jsx`](../frontend/src/pages/Dashboard/DashboardPage.jsx) | Theme-aware Recharts palette via `useMemo` |

---

## What's next

You now know how to ship one of the most-requested features in modern web apps in a way that scales to ten themes if you ever need them. The same pattern (data attribute + CSS variables + a tiny context) generalizes to:

- **Tenant theming** (each customer gets their brand colors via `[data-tenant="acme"]`)
- **Density modes** (compact vs comfortable spacing — vary `--space-1` etc.)
- **RTL support** (`[dir="rtl"]` flips margin/padding tokens)

The pattern is universal. Master it once, reach for it forever.

→ Up next: **Chapter 10 — Routing with `react-router-dom`** (when you're ready, just ask).
