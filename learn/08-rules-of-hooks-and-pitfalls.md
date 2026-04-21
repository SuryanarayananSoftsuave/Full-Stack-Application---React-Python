# Chapter 8 — Rules of Hooks & Common Pitfalls

> **What you'll learn**
> - The two **Rules of Hooks** — stated, explained, and *why* they exist (it's not arbitrary)
> - How React actually tracks which `useState`/`useEffect` is which (the position trick)
> - The **stale closure** trap — your callback captured an old `count` and never let go
> - Missing dependencies — what ESLint's `exhaustive-deps` warning really means
> - The four flavors of infinite loop and how to spot each
> - **StrictMode** double-effects in dev — why they're a feature, not a bug
> - Common error messages decoded: *"Cannot update a component while rendering"*, *"Rendered fewer hooks than expected"*, *"Maximum update depth exceeded"*
> - A debugging checklist you can actually run when something is weird

This is a synthesis chapter. Everything here is a consequence of what you already learned in Chapters 4–7. The point is to surface the things that *will* trip you up, name them, and give you a vocabulary for fixing them. Treat this as the "dangers manual" for hooks.

---

## 1. The two Rules of Hooks

Every hook (`useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`, custom hooks, all of them) obeys two rules. They're enforced by the `eslint-plugin-react-hooks` package.

### Rule 1 — Only call hooks at the top level

Hooks must be called:

- ✅ At the top of a function component, before any `return`, `if`, `for`, or `while`.
- ❌ Not inside conditions, loops, or after early returns.
- ❌ Not inside event handlers, regular functions, or `try`/`catch` blocks.

```jsx
// ❌ WRONG
function Profile({ user }) {
  if (!user) return null;
  const [name, setName] = useState(user.name);  // hook after early return
  // ...
}

// ✅ RIGHT
function Profile({ user }) {
  const [name, setName] = useState(user?.name ?? "");  // always called
  if (!user) return null;
  // ...
}
```

### Rule 2 — Only call hooks from React functions

Hooks can only be called from:

- ✅ Function components (functions whose name starts with a capital letter and that return JSX).
- ✅ Other hooks (functions whose name starts with `use`).

Not from regular JavaScript functions, not from class components, not from event handlers.

```jsx
// ❌ WRONG
function loadData() {
  const [data, setData] = useState(null);   // not a component, not a hook
}

// ✅ RIGHT
function useData() {
  const [data, setData] = useState(null);   // custom hook (name starts with `use`)
  return data;
}
```

These two rules are universal. If you violate them, ESLint screams. If you ignore the screaming, your app breaks in subtle ways.

---

## 2. Why these rules exist — the position trick

This is the most important section in the chapter. Understanding *why* the rules exist makes them feel obvious instead of arbitrary.

React stores your component's hooks in a list, indexed by **call order**, not by name. There's no magic — React doesn't know what `count` or `setCount` mean. It just knows "hook #1 returned `[0, fn]`, hook #2 returned `[null, fn]`, hook #3 was an effect".

A simplified mental model:

```
Render 1:  hooks = [
  useState(0),       // index 0
  useState(""),      // index 1
  useEffect(fn, [])  // index 2
]
```

On render 2, React expects the **exact same call sequence in the exact same order**:

```
Render 2:  hooks = [
  useState,    // must be at index 0  → returns the stored count
  useState,    // must be at index 1  → returns the stored string
  useEffect    // must be at index 2  → checks deps, maybe re-runs
]
```

Now imagine this:

```jsx
function Bad({ flag }) {
  if (flag) {
    const [a, setA] = useState(0);  // hook only sometimes called
  }
  const [b, setB] = useState("");
  // ...
}
```

- Render 1, `flag = true`: hooks called in order `useState(0)`, `useState("")`. React stores `[0, ""]`.
- Render 2, `flag = false`: hooks called in order `useState("")`. React asks for index 0, gets the second `useState`, returns `0` for `b`. **Total chaos.**

The error you'll see in the console is unmistakable:

> *"Rendered fewer hooks than expected. This may be caused by an accidental early return statement."*

Or:

> *"React has detected a change in the order of Hooks called by Bad."*

**The cure: never put a hook behind a condition.** Always call them at the top of the component. If you need conditional behavior, do it *inside* the hook callback or in plain JS:

```jsx
function Good({ flag }) {
  const [a, setA] = useState(0);     // always called
  const [b, setB] = useState("");    // always called
  if (!flag) return null;            // early return AFTER hooks
  // ...
}
```

This is also why "hooks at the top, JSX/early-returns at the bottom" is the standard component layout.

---

## 3. The stale closure trap

This is the single most common bug in hook-based React code. It bites everybody at least once.

### The setup

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      console.log(count);            // logs what?
      setCount(count + 1);           // increments to what?
    }, 1000);
    return () => clearInterval(id);
  }, []);   // empty deps

  return <p>{count}</p>;
}
```

What you might expect: every second, log the current count and increment it.

What actually happens: the console logs `0`, `0`, `0`, `0`, ... forever. The number on screen never changes past `1`.

### Why?

When the effect runs (once, because of `[]`), it captures the current `count` — which is `0`. The function passed to `setInterval` keeps a closure reference to *that* `0` forever. It can never see new values of `count` because no one ever re-runs the effect to update the closure.

`setCount(count + 1)` becomes `setCount(0 + 1)`, which sets state to `1`. Next tick: `setCount(0 + 1)` again — same value, no re-render. Stuck.

### The two fixes

**Fix 1 — Functional updater (Chapter 4):**

```jsx
useEffect(() => {
  const id = setInterval(() => setCount((c) => c + 1), 1000);
  return () => clearInterval(id);
}, []);
```

Now we don't read the captured `count` at all. We let React hand us the latest value and we return `value + 1`. No stale closure problem.

**Fix 2 — List `count` in the deps:**

```jsx
useEffect(() => {
  const id = setInterval(() => setCount(count + 1), 1000);
  return () => clearInterval(id);
}, [count]);
```

Now the effect re-runs every time `count` changes — tearing down the old interval and creating a new one with a fresh closure. Works, but wasteful (we destroy and re-create the timer every second).

**The rule:** prefer fix 1. Whenever a callback inside an effect uses state, ask "does it really need the captured value?" If not, use the functional form. It eliminates the closure problem entirely.

### A second flavor of the same bug — event handlers in old renders

```jsx
function Search({ onSearch }) {
  const [text, setText] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => onSearch(text), 500);
    return () => clearTimeout(timer);
  }, [text]);  // forgot onSearch

  return <input value={text} onChange={(e) => setText(e.target.value)} />;
}
```

If `onSearch` is recreated by the parent (no `useCallback`), every parent re-render gives us a new `onSearch` reference. But our effect only re-runs on `text` changes — so it keeps calling the *old* `onSearch` from the first render. Stale.

Fix: include `onSearch` in deps (and have the parent wrap it in `useCallback`):

```jsx
useEffect(() => {
  const timer = setTimeout(() => onSearch(text), 500);
  return () => clearTimeout(timer);
}, [text, onSearch]);
```

ESLint's `exhaustive-deps` would have caught this immediately. Listen to it.

---

## 4. Missing dependencies and `exhaustive-deps`

The ESLint rule `react-hooks/exhaustive-deps` is the most useful (and most ignored) lint rule in any React codebase. The rule says:

> Every value from your component's scope that is used inside the effect/callback/memo body must appear in the dependency array.

When you violate it, you get a warning like:

> *React Hook useEffect has a missing dependency: 'fetchUser'. Either include it or remove the dependency array.*

### Why the rule is correct

If you use `fetchUser` inside the effect but don't list it as a dep, the effect runs only on mount — using whatever `fetchUser` looked like at mount. If `fetchUser` changes (because, say, a prop it depends on changed), the effect doesn't notice. You're using stale logic.

So the rule isn't pedantic. It's keeping your code honest.

### What to do when adding the dep makes things worse

Sometimes adding the dep causes your effect to run too often (because the value gets recreated each render). The fix is **never** to suppress the lint. The fix is to make that value stable:

| Symptom | Real cause | Fix |
| --- | --- | --- |
| Effect re-fires every render | A function dep is recreated each render | Wrap it in `useCallback` |
| Effect re-fires every render | An object/array dep is recreated each render | Wrap it in `useMemo` or move it inside the effect |
| Effect re-fires when X "shouldn't" matter | X actually does matter — your mental model is wrong | Read the dep list as the contract; usually you've conflated two concepts |

Example from our app:

```45:47:frontend/src/context/AuthContext.jsx
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);
```

`fetchUser` is in the deps and it's stable (because of `useCallback([])` above). The effect runs once. No suppression, no stale closure. This is the disciplined version.

### When it's truly OK to suppress

Vanishingly rare. The honest cases are:

- A one-time imperative side effect on mount that explicitly should not re-run (e.g. `analytics.track("page_loaded")`).
- A truly stable function from a library that can't be wrapped in `useCallback`.

Even then, prefer to refactor first. A blanket `// eslint-disable-next-line react-hooks/exhaustive-deps` is almost always covering a bug-in-waiting.

---

## 5. The four flavors of infinite loop

If your CPU fan suddenly spins up and the React DevTools profiler turns into a Christmas tree, you're in a loop. The four common causes:

### Loop type A — Effect updates the state it depends on

```jsx
useEffect(() => { setX(x + 1); }, [x]);
```

Effect reads `x`, writes `x`, has `x` in deps. Re-runs forever.

**Fix:** functional updater AND remove `x` from deps if you only mean "increment once":

```jsx
useEffect(() => { setX((p) => p + 1); }, []);
```

### Loop type B — Object/array dep recreated each render

```jsx
function Page() {
  const filters = { status: "todo" };           // new object every render
  useEffect(() => { fetch(filters); }, [filters]);
}
```

`filters` has a new reference every render → effect always re-fires → setState inside `fetch` → re-render → new `filters` → loop.

**Fix:**

```jsx
const filters = useMemo(() => ({ status: "todo" }), []);
```

Or: build the object inside the effect and remove it from deps.

### Loop type C — Setting state during render

```jsx
function Bad({ items }) {
  const [count, setCount] = useState(0);
  if (items.length > count) setCount(items.length);   // ❌ during render
  return <p>{count}</p>;
}
```

Calling `setCount` during render schedules a re-render, which calls the function again, which calls `setCount`, ... loop. React will catch this and throw:

> *"Too many re-renders. React limits the number of renders to prevent an infinite loop."*

**Fix:** put the update in an effect:

```jsx
useEffect(() => { setCount(items.length); }, [items.length]);
```

Or — if it's purely derived — don't store it at all (`const count = items.length;`).

### Loop type D — Two effects feeding each other

```jsx
useEffect(() => { setA(b + 1); }, [b]);
useEffect(() => { setB(a + 1); }, [a]);
```

Each effect triggers the other. Classic.

**Fix:** rethink. There's almost always a single source of truth and one effect is wrong.

### How to spot them

1. Open the React DevTools Profiler.
2. Record a 3-second session.
3. If you see hundreds of renders for one component, you have a loop.
4. Read the "why did this render?" hint in the profiler.
5. Trace the effect that's writing the state that's appearing in someone's deps.

---

## 6. StrictMode double effects in development

You'll notice that your `console.log("mounted")` appears **twice** in dev. This is intentional and only happens in development.

[frontend/src/main.jsx](../frontend/src/main.jsx) wraps the app:

```jsx
<React.StrictMode>
  <App />
</React.StrictMode>
```

`StrictMode` deliberately:

1. Mounts every component.
2. Unmounts it (running cleanup).
3. Re-mounts it.

All in fast succession on the very first render. The point is to **prove your effects are clean**. If your effect leaves a listener attached without cleaning up, you'll see two listeners after this — that's the bug surfacing instantly instead of in production six months later.

**Rules:**

- If StrictMode breaks your code, you almost certainly forgot a cleanup. Add `return () => ...`.
- If you just don't like seeing `console.log` twice, put it in an event handler or remove the log.
- Production builds run effects once. StrictMode's double-run is dev-only.

Don't disable StrictMode "because it's annoying". It's saving you from a future production bug.

---

## 7. Setting state on an unmounted component

Less common in React 18+, but you may see it:

> *"Can't perform a React state update on an unmounted component."*

The classic shape:

```jsx
useEffect(() => {
  fetchData().then((data) => setData(data));   // what if we unmount before this resolves?
}, []);
```

In React 18 the warning is gone, but the *real* problem still exists: you might overwrite state with **stale data** if the user navigates away and comes back.

The standard fix — a cancellation flag in cleanup:

```jsx
useEffect(() => {
  let cancelled = false;
  fetchData().then((data) => { if (!cancelled) setData(data); });
  return () => { cancelled = true; };
}, []);
```

For multiple consecutive calls (e.g. typing in a search box), use `AbortController`:

```jsx
useEffect(() => {
  const ctrl = new AbortController();
  fetchData({ signal: ctrl.signal }).then(setData).catch(() => {});
  return () => ctrl.abort();
}, [query]);
```

We don't do this in our app yet because none of our requests are long enough to matter. As you add slower endpoints, this pattern becomes important.

---

## 8. Common error messages decoded

### *"Rendered more hooks than during the previous render."*

You added a hook behind a condition. Find the new `useState`/`useEffect`/`useMemo`/`useCallback`/`useRef` that's only sometimes called. Move it to the top of the component.

### *"Rendered fewer hooks than expected."*

Same root cause as above — your hook count differs between renders. Usually because of an early `return` placed before some hooks.

### *"Cannot update a component while rendering a different component."*

You called `setX` of component A from inside the render body of component B. Move that update to an effect or an event handler.

### *"Maximum update depth exceeded."*

You're in an infinite loop (Section 5). Find the effect or render-time setState that triggers itself.

### *"Functions are not valid as a React child."*

You wrote `{handleClick}` inside JSX where you meant `{handleClick()}` — or you forgot the `return` in a render-prop callback.

### *"Each child in a list should have a unique 'key' prop."*

You `.map`'d an array without giving each element a `key`. Re-read Chapter 3 section 4. Use a stable, unique ID — never the array index when items can be added/removed/reordered.

### *"Objects are not valid as a React child."*

You tried to render an object directly: `{user}`. JSX can render strings/numbers/JSX/arrays — not raw objects. Render a property: `{user.name}`.

### *"You provided a 'value' prop to a form field without an 'onChange' handler."*

You made an input controlled (`value={x}`) but forgot to write back to state. Either add `onChange` or use `defaultValue` for an uncontrolled input.

---

## 9. A debugging checklist

When something feels wrong with a hook, walk this list in order:

1. **Read the warning.** React's modern errors are very specific — don't dismiss them.
2. **Check ESLint.** Open the file in your editor. Is there an `exhaustive-deps` warning? Fix it.
3. **Look at the dep arrays.** Are there functions or objects in there? Could they be unstable references? Wrap in `useCallback`/`useMemo` if so.
4. **Look for state writes inside render.** Anything that calls `setX` outside an effect or handler is suspect.
5. **Look for stale closures.** Any `setState((prev) => ...)` you should be using? Any `useRef` you could use to always read "the latest"?
6. **Open DevTools Profiler.** Record. Look at "why did this render?" hints. Find the rogue dep change.
7. **Add `console.log` at the top of the component.** Watch the render count. If a click triggers 100 renders, you have a loop.
8. **Comment out things temporarily.** Remove the suspicious effect. Does the bug stop? Now you've localized it.

---

## 10. The "anti-stale" toolbox

To recap the techniques that defeat stale closures and missing-dep cycles, in one place:

| Technique | When to use |
| --- | --- |
| `setX((prev) => ...)` functional updater | Whenever the next state depends on the previous |
| `useCallback(fn, deps)` | Whenever a function is a dep of another hook |
| `useMemo(() => obj, deps)` | Whenever an object/array is a dep of another hook |
| `useRef(value)` for "latest callback" | When you need to read "current" inside an interval or other long-lived thing |
| Build object dep *inside* the effect | When the object is only used inside the effect |
| Move state up | When two effects keep fighting, often the state should live in the parent |
| Derived value (no hook) | When a value can be computed from existing state |

Almost every "I have weird state behavior" bug is one of these in disguise.

---

## 11. Try it yourself

### Exercise 1 — Find the rule violation

```jsx
function Profile({ id }) {
  if (!id) return null;
  const [user, setUser] = useState(null);
  useEffect(() => { api.user(id).then(setUser); }, [id]);
  return user ? <p>{user.name}</p> : <p>Loading...</p>;
}
```

<details>
<summary>Answer</summary>

Hooks are called *after* the early return. On the very first render with `id` truthy, hooks 0 and 1 are `useState` and `useEffect`. If `id` becomes `null` on a later render, no hooks are called → React errors.

Fix:

```jsx
function Profile({ id }) {
  const [user, setUser] = useState(null);
  useEffect(() => { if (id) api.user(id).then(setUser); }, [id]);
  if (!id) return null;
  return user ? <p>{user.name}</p> : <p>Loading...</p>;
}
```
</details>

### Exercise 2 — Spot the stale closure

```jsx
function Stopwatch() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds(seconds + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <p>{seconds}</p>;
}
```

What's wrong, and what's the minimum-touch fix?

<details>
<summary>Answer</summary>

`seconds` is captured at mount as `0` and never updated. The display goes 0 → 1 → 1 → 1 → ... forever.

Fix:
```jsx
setSeconds((s) => s + 1);
```

One change, no other deps needed.
</details>

### Exercise 3 — Decode the error

You see in the console:

> *"Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate."*

What are the three most likely causes?

<details>
<summary>Answer</summary>

1. An effect that updates state listed in its own deps (Loop type A).
2. A `setState` called directly in the render body (Loop type C).
3. An object/array recreated each render and used as a dep, where the effect ends up calling `setState` (Loop type B).

Open DevTools Profiler, find the rogue effect, fix the dep.
</details>

### Exercise 4 — Refactor to eliminate the warning

ESLint warns *"missing dependency: 'config'"*. The component is:

```jsx
function Widget({ config }) {
  useEffect(() => {
    init(config);
    return () => destroy();
  }, []);
  return <div />;
}
```

You don't want `init/destroy` to fire every render. What are your options?

<details>
<summary>Answer</summary>

Three reasonable options, in order of preference:

1. **List the dep and stabilize the parent's `config`.** Have the parent wrap `config` in `useMemo`. The effect now re-runs only when config truly changes.
2. **Compare config inside the effect.** Use a ref to store the previous config; only re-init if it's different.
3. **Decide the contract is "init once with first config".** Document it explicitly:

```jsx
// We deliberately initialize with the first `config` and ignore later changes.
// Callers must remount the widget to apply a new config.
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => { init(config); return () => destroy(); }, []);
```

Option 3 is the only legitimate use of the disable comment, and only when accompanied by a comment explaining the contract.
</details>

---

## 12. Cheat sheet

| Rule / Pitfall | One-liner |
| --- | --- |
| Rule 1 | Hooks at the top, never inside `if`/`for`/early returns |
| Rule 2 | Hooks only inside components or other hooks (name starts with `use`) |
| Why the rules | React tracks hooks by call order, not name |
| Stale closure | Effect/callback captured an old value; use functional updater or fix deps |
| Missing dep | Trust ESLint; fix by adding the dep, then stabilize references with `useCallback`/`useMemo` |
| Loop A | Effect updates state in its own deps → use functional updater + correct deps |
| Loop B | Object/array dep recreated each render → `useMemo` or move inside effect |
| Loop C | Setting state during render → move into effect |
| Loop D | Two effects feeding each other → re-think source of truth |
| StrictMode 2× | Dev-only sanity check; if it breaks code, you forgot cleanup |
| Unmounted setState | React 18 silenced the warning; fix with cancellation flag or `AbortController` |
| Functions as child | You forgot `()` after the function name |
| Objects as child | Render a property of the object, not the object |
| Maximum update depth | You're in a loop; profile, find the rogue effect |

---

## 13. What's next

This concludes **Part B — State & Hooks**. You've covered:

- 4 — `useState` and controlled inputs
- 5 — `useEffect`, deps, and cleanup
- 6 — `useCallback`/`useMemo` and reference identity
- 7 — `useRef` for DOM and mutable values
- 8 — The rules and pitfalls (this chapter)

You can now read any hook-based React component and predict how it behaves. You've seen the underlying machinery. The rest of React isn't *new primitives* — it's **patterns built on these five hooks**.

**Part C — Application Architecture** picks up from here:

- **Chapter 9** — Routing with `react-router-dom`. We'll trace exactly what happens when the user clicks "Sprint Board" in the sidebar — how the URL changes, which component mounts, and what `Outlet` is doing.
- **Chapter 10** — `ProtectedRoute`/`GuestRoute` and the auth-aware layout pattern.
- **Chapter 11** — The Context API and the `useAuth` custom hook (now you understand exactly why every callback there is wrapped).
- **Chapter 12** — Layout composition: how Sidebar + Navbar + content area fit together.

When you're ready, ask for **Chapter 9 — Routing with React Router**.

You've made it through the hardest part of React. Everything else is "the same primitives, in different shapes."
