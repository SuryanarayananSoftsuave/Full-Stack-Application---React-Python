# Learn React with Your Own App

Welcome! This series teaches you React from zero, using **the exact app you've been building** as the textbook. Every concept is grounded in real code from your project, so you'll understand not just *what* React does but *why* we built things the way we did.

---

## How to use this series

1. **Read in order.** Each chapter builds on the previous one. Skipping ahead will leave gaps.
2. **Keep the app open.** When a chapter cites a file like [frontend/src/App.jsx](../frontend/src/App.jsx), open it in your editor and read along. The code is the textbook.
3. **Run the app while you read.** `cd frontend && npm run dev` — make small changes and see what breaks. Breaking things is the fastest way to learn.
4. **Do the "Try it yourself" exercises.** They're tiny. They cement the idea in your head.
5. **Don't memorize. Understand.** If you understand *why* something works, you can always look up the syntax.

---

## Prerequisites

You should be comfortable with the following JavaScript basics:

- Variables (`const`, `let`)
- Functions (regular and arrow: `() => {}`)
- Arrays (`map`, `filter`, `find`)
- Objects and destructuring (`const { x } = obj`)
- Template literals (`` `Hello ${name}` ``)
- `async` / `await` and Promises (basic understanding is fine)
- `import` / `export`

If any of these feel shaky, do a quick refresher on [MDN's JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide) before starting.

You do **not** need:

- Prior React experience
- Knowledge of TypeScript
- Knowledge of any other framework

---

## What you need installed

- **Node.js 18+** ([nodejs.org](https://nodejs.org/))
- **npm** (comes with Node)
- An editor — VS Code or Cursor are great
- The backend running (separate concern, covered briefly in Chapter 14)

To run the frontend at any time:

```bash
cd frontend
npm install   # only the first time
npm run dev   # starts the dev server on http://localhost:3000
```

---

## How each chapter is structured

Every chapter follows the same shape, so you always know what to expect:

| Section | What it does |
| --- | --- |
| **What you'll learn** | 3-5 bullet learning goals at the top |
| **Concepts** | The React idea explained in plain English with tiny standalone examples |
| **In our app** | Walking through real code from your project, line by line |
| **Why it's done this way** | Design decisions, alternatives, gotchas |
| **Try it yourself** | A small hands-on exercise |
| **Cheat sheet** | Quick reference table at the end |
| **What's next** | Link to the next chapter |

---

## Full curriculum

Status legend: **READY** = chapter exists, **TODO** = will be written when you ask.

### Part A — Foundations

| # | Chapter | Status |
| --- | --- | --- |
| 1 | [What is React, JSX, and our project structure](./01-what-is-react-and-this-project.md) | READY |
| 2 | [Components & Props (using `KpiCard`, `ChartCard`, `Toast`)](./02-components-and-props.md) | READY |
| 3 | [JSX deep dive — expressions, conditionals, lists, fragments](./03-jsx-deep-dive.md) | READY |

### Part B — State & Hooks

| # | Chapter | Status |
| --- | --- | --- |
| 4 | [`useState` and controlled inputs (`LoginPage`, `CreateTaskModal`)](./04-useState-and-controlled-inputs.md) | READY |
| 5 | [`useEffect` — side effects, dependencies, cleanup (`AuthContext`, debounce)](./05-useEffect-side-effects.md) | READY |
| 6 | [`useCallback` and `useMemo` — re-render control (Dashboard aggregations)](./06-useCallback-and-useMemo.md) | READY |
| 7 | [`useRef` — DOM refs and mutable values (action menu click-outside)](./07-useRef-dom-and-mutable-values.md) | READY |
| 8 | [Rules of hooks & common pitfalls (stale closures, missing deps)](./08-rules-of-hooks-and-pitfalls.md) | READY |

### Part C — Application Architecture

| # | Chapter | Status |
| --- | --- | --- |
| 9 | [Theming — light & dark mode end-to-end (`ThemeContext`, CSS variables)](./09-theming-light-and-dark.md) | READY |
| 10 | [Dashboard end-to-end — request → state → `useMemo` → Recharts](./10-dashboard-end-to-end.md) | READY |
| 11 | Routing — `react-router-dom` (`App.jsx`, `Sidebar`) | TODO |
| 12 | `ProtectedRoute` / `GuestRoute` and `<Outlet />` | TODO |
| 13 | Context API + custom hooks (`AuthContext`, `useAuth`) | TODO |
| 14 | Layout composition (Sidebar + Navbar + content) | TODO |

### Part D — API & Forms

| # | Chapter | Status |
| --- | --- | --- |
| 15 | Axios client, interceptors, refresh token flow | TODO |
| 16 | API modules (`auth.js`, `tasks.js`, `users.js`) | TODO |
| 17 | Forms — controlled inputs, submit, errors (`Registerpage`) | TODO |
| 18 | Toast notifications & error UX | TODO |

### Part E — Advanced UI Patterns

| # | Chapter | Status |
| --- | --- | --- |
| 19 | Modals — open/close, body scroll, click-outside | TODO |
| 20 | Lists, filtering, pagination, debounce (`TasksList`) | TODO |
| 21 | Action menus, dropdowns, click-outside detection | TODO |
| 22 | Drag and drop with `@dnd-kit` (Sprint Board) | TODO |

### Part F — Data Visualization

| # | Chapter | Status |
| --- | --- | --- |
| 23 | Recharts crash course (Dashboard charts) | TODO |
| 24 | Aggregating data client-side with `useMemo` (Dashboard) | TODO |

### Part G — Styling

| # | Chapter | Status |
| --- | --- | --- |
| 25 | CSS Modules — scoped styles, class composition, design tokens | TODO |
| 26 | Responsive layouts (CSS Grid, sidebar interactions) | TODO |

### Part H — Wrap-up

| # | Chapter | Status |
| --- | --- | --- |
| 27 | Full request lifecycle — click to render, traced end-to-end | TODO |
| 28 | React mental models cheat sheet | TODO |

> Just say **"give me Chapter N"** in chat and I'll write that chapter following this exact roadmap.

---

## Glossary (terms you'll meet often)

These appear repeatedly. Bookmark this section.

| Term | One-line definition |
| --- | --- |
| **Component** | A JavaScript function that returns JSX (UI). The basic building block of React. |
| **JSX** | HTML-like syntax inside JavaScript. `<div>Hi</div>` is JSX, not HTML. |
| **Props** | Inputs to a component, passed like HTML attributes: `<KpiCard label="Total" />`. |
| **State** | Data that belongs to a component and can change over time. Triggers a re-render when changed. |
| **Render** | React calling your component function to produce UI. Happens on first mount and whenever state/props change. |
| **Re-render** | React re-running a component function because its state or props changed. |
| **Hook** | A special React function that starts with `use` (e.g., `useState`, `useEffect`). Lets components have state and side effects. |
| **Side effect** | Anything outside React's normal "data in, JSX out" flow: API calls, timers, subscriptions, DOM manipulation. Lives in `useEffect`. |
| **Virtual DOM** | An in-memory representation of the UI that React diffs against the real DOM to apply minimal updates. You rarely think about it directly. |
| **Mount** | When a component first appears on screen. |
| **Unmount** | When a component is removed from the screen. |
| **Dependency array** | The `[ ]` at the end of `useEffect`/`useCallback`/`useMemo`. Tells React when to re-run the effect or recompute the value. |
| **Reconciliation** | React's process of figuring out what changed in the virtual DOM and applying minimal updates to the real DOM. |
| **Key** | A unique `key={...}` prop you put on items in a list so React can tell them apart between renders. |
| **Controlled input** | A form input whose value comes from React state (not the DOM). You read and write the value through state. |
| **Context** | A way to share data (like the logged-in user) across components without passing it through every prop. |
| **Custom hook** | A regular function whose name starts with `use` and which calls other hooks inside. Lets you reuse stateful logic. |
| **Fragment** | `<> ... </>` — lets you return multiple elements from a component without wrapping them in an extra `<div>`. |
| **Lifting state up** | Moving state from a child component into a shared parent so siblings can both read/write it. |

---

## Ready?

Start here: **[Chapter 1 — What is React, JSX, and our project structure](./01-what-is-react-and-this-project.md)**

See you on the other side.
