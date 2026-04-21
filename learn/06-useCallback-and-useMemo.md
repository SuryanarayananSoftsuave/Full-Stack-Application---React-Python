# Chapter 6 — `useCallback` and `useMemo`: The Memoization Hooks

> **What you'll learn**
> - The "fresh on every render" problem — why React keeps rebuilding the same things
> - **Reference identity** vs. value equality — and why React only sees references
> - `useMemo` — cache a computed **value** until its dependencies change
> - `useCallback` — cache a **function reference** until its dependencies change
> - Why every callback in `AuthContext` is wrapped, and how that ripples through the whole app
> - The Dashboard's seven `useMemo` chains, walked through one by one
> - When **not** to memoize (memoization isn't free, and the wrong defaults make code slower and noisier)
> - The mental model: "memoize the things that other hooks depend on"

This chapter gets a reputation for being scary because the word *memoization* sounds academic. It isn't. It's just "remember the answer so we don't redo the math." Once you see the two concrete problems these hooks solve, they're obvious.

---

## 1. The problem — why React keeps doing redundant work

Remember Chapter 4: **every render of a component is a fresh call to that function**.

Consider this innocent-looking component:

```jsx
function Page({ tasks }) {
  const total = tasks.length;
  const overdue = tasks.filter((t) => isOverdue(t)).length;
  const handleClick = () => console.log("hi");

  return <Child onClick={handleClick} />;
}
```

Every time `Page` renders:

1. `tasks.filter(...)` runs again, even if `tasks` didn't change.
2. `handleClick` is created as a brand-new function (new reference).
3. `<Child>` receives a new `onClick` prop reference, so React re-renders `<Child>`, even though the behavior is identical.

For tiny computations and small components, none of this matters. But three real problems creep in as your app grows:

1. **Expensive computations re-running.** That `tasks.filter` is fine for 50 tasks. With 5,000 it becomes noticeable. Doing it on every keystroke is wasteful.
2. **Effects re-running too often.** Remember `useEffect(fn, [deps])`? If one of those deps is a function or object created fresh each render, the effect re-runs on every render. Hello, infinite-loop scenarios.
3. **Child components re-rendering for no reason.** If a child is wrapped in `React.memo` (or is a Recharts chart, etc.), it skips re-renders when props are the same — *but only if the references are the same*.

These three problems all point at the same root cause: **JavaScript creates fresh objects, arrays, and functions on every line that defines them, with new identities even when their contents are identical.**

`useMemo` and `useCallback` are React's tools for keeping references stable across renders.

---

## 2. Reference identity — the one rule that explains everything

```js
{} === {}              // false (two different objects)
[] === []              // false
(() => 1) === (() => 1)  // false
1 === 1                // true (primitives compare by value)
"hi" === "hi"          // true
```

Objects, arrays, and functions are compared by **reference** — by their location in memory — not by their contents. Two objects with identical contents are still different objects.

React's dependency-array check uses `Object.is`, which behaves like `===` for our purposes. So when you write:

```js
useEffect(() => { ... }, [filters]);
```

…and `filters` is `{ status: "todo" }` defined inline above, React sees a *new* object every render. Different reference. Effect runs every render.

The two memoization hooks have one job: **return the same reference until something meaningful changes**.

---

## 3. `useMemo` — cache a computed value

```js
const value = useMemo(() => expensiveComputation(a, b), [a, b]);
```

What this does:

- On the first render: run the function, remember the result, return it.
- On every subsequent render: if `a` and `b` are unchanged (reference-equal), **skip the function entirely** and return the previous result.
- If `a` or `b` changed: run the function again, remember the new result.

It's `useEffect`'s sibling for synchronous values: same dependency-array idea, but instead of running side effects, it computes and caches a value.

### Tiny example

```jsx
const filtered = useMemo(
  () => tasks.filter((t) => t.priority === "critical"),
  [tasks]
);
```

If a parent re-renders and passes the same `tasks` array reference, `filtered` is reused as-is. If `tasks` is a new array reference, the filter runs again.

> **Important**: `useMemo` only helps if its dependency *itself* has stable identity. If `tasks` is rebuilt every render in the parent, the memo is useless. References travel down — fix them at the source.

---

## 4. `useCallback` — cache a function reference

```js
const handler = useCallback((arg) => doStuff(arg, a, b), [a, b]);
```

Just sugar for `useMemo`:

```js
const handler = useMemo(() => (arg) => doStuff(arg, a, b), [a, b]);
```

Both produce the same result. `useCallback` exists purely because passing functions around is so common that React gave it a dedicated wrapper.

> **The mental model**: `useCallback` is for **identity stability of functions you pass to other hooks or memo'd children**. It does **not** make the function faster.

---

## 5. In our app — `AuthContext`'s wall of `useCallback`

Look at [frontend/src/context/AuthContext.jsx](../frontend/src/context/AuthContext.jsx) — every action function is wrapped:

```27:39:frontend/src/context/AuthContext.jsx
  const fetchUser = useCallback(async () => {
    try {
      const data = await authApi.getMe();
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
```

```49:58:frontend/src/context/AuthContext.jsx
  const login = useCallback(
    async (email, password) => {
      await authApi.login(email, password);
      await fetchUser();
    },
    [fetchUser]
  );
```

```60:66:frontend/src/context/AuthContext.jsx
  const register = useCallback(async (email, password, fullName, department) => {
    const data = await authApi.register(email, password, fullName, department);
    return data;
  }, []);
```

```68:74:frontend/src/context/AuthContext.jsx
  const logout = useCallback(async () => {
    await authApi.logout();
    localStorage.removeItem("access_token");
    setUser(null);
  }, []);
```

Why all this ceremony? Three concrete reasons.

### Reason 1 — Effects depending on these functions don't re-fire

Recall the mount-only fetch from Chapter 5:

```45:47:frontend/src/context/AuthContext.jsx
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);
```

If `fetchUser` were defined as a plain function (not memoized), it would be a new reference on every render of `AuthProvider`. Every state change anywhere in the tree (a single keystroke!) would re-trigger this effect → another `/auth/me` call → re-render → loop.

`useCallback(fetchUser, [])` fixes the reference for the lifetime of the component, and the effect runs exactly once.

### Reason 2 — `login` recomputes only when its dependency does

```49:58:frontend/src/context/AuthContext.jsx
  const login = useCallback(
    async (email, password) => {
      await authApi.login(email, password);
      await fetchUser();
    },
    [fetchUser]
  );
```

`login` uses `fetchUser`. Since `fetchUser` is itself stable (`[]` deps), `[fetchUser]` is effectively also stable. So `login` keeps the same reference too. The chain is intentional.

> **Rule**: when a memoized function uses another memoized function, list the inner one as a dep. Stability cascades upward.

### Reason 3 — Context consumers don't see "new" values

`AuthContext` provides a `value` object:

```76:86:frontend/src/context/AuthContext.jsx
  const value = {
    user,
    loading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
```

Every consumer of `useAuth()` re-renders whenever `value` changes (by reference). Because `login`/`register`/`logout` are memoized, they don't break the chain. Consumers only re-render when `user` or `loading` changes — exactly what you want.

(`value` itself is still a fresh object every render, which is *technically* a tiny perf miss. The honest fix would be to wrap it in `useMemo([user, loading, login, register, logout])`. We don't bother because consumers are few and they'll re-render on `user` changes anyway. This is a real-world tradeoff: don't optimize what isn't measurably slow.)

### The mental model for the entire context file

> "These functions are passed everywhere through context, and consumed inside `useEffect` deps. They MUST be reference-stable, or the whole app re-renders/re-fetches needlessly. Wrap them all."

That single rule explains every `useCallback` in `AuthContext`.

---

## 6. In our app — the Dashboard's seven `useMemo` chains

Open [frontend/src/pages/Dashboard/DashboardPage.jsx](../frontend/src/pages/Dashboard/DashboardPage.jsx). It's the densest concentration of `useMemo` in the project. Why? Because:

1. The component fetches a list of tasks once.
2. From that list, it derives **seven** different aggregations (KPIs, status breakdown, priority breakdown, sprint workload, type mix, completion trend, upcoming deadlines).
3. Each aggregation feeds a Recharts component.
4. Recharts is internally optimized — it skips re-rendering charts when the input data reference is unchanged.

If we recomputed every aggregation on every render, every chart would re-render every time the user clicks a button on the page. With memoization, the charts stay perfectly still until `tasks` actually changes.

Let's walk through them.

### 6a — `kpis` (the top row of cards)

```175:196:frontend/src/pages/Dashboard/DashboardPage.jsx
  const kpis = useMemo(() => {
    const now = new Date();
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    const last7 = new Date();
    last7.setDate(last7.getDate() - 7);

    return {
      total: tasks.length,
      inProgress: tasks.filter((t) => t.status === "in_progress").length,
      dueSoon: tasks.filter(
        (t) =>
          t.status !== "done" &&
          t.due_date &&
          new Date(t.due_date) >= startOfDay(now) &&
          new Date(t.due_date) <= in7
      ).length,
      completedThisWeek: tasks.filter(
        (t) => t.status === "done" && t.updated_at && new Date(t.updated_at) >= last7
      ).length,
    };
  }, [tasks]);
```

Four metrics in one object:
- `total` — array length.
- `inProgress` — count of tasks whose status is "in_progress".
- `dueSoon` — non-done tasks with a due date in the next 7 days.
- `completedThisWeek` — done tasks updated in the last 7 days (we use `updated_at` as a stand-in because the API doesn't track `completed_at`).

All four iterate the same `tasks` array. Without `useMemo`, three full filter passes would happen on every render of the page (e.g., when a tooltip appears and updates internal state). With `useMemo`, they happen exactly once per `tasks` change.

### 6b — `statusData` (the donut chart)

```198:209:frontend/src/pages/Dashboard/DashboardPage.jsx
  const statusData = useMemo(() => {
    const counts = { todo: 0, in_progress: 0, in_review: 0, done: 0 };
    tasks.forEach((t) => {
      if (counts[t.status] !== undefined) counts[t.status] += 1;
    });
    return Object.entries(counts).map(([k, v]) => ({
      key: k,
      name: STATUS_LABELS[k],
      value: v,
      color: STATUS_COLORS[k],
    }));
  }, [tasks]);
```

Standard "tally then map" pattern:

1. Initialize a counter object with all status keys at `0` (so empty buckets still show up in the chart).
2. Walk the tasks once — `forEach` is faster and more readable than `filter` four times.
3. Convert the counts object to the array shape Recharts wants: `[{ key, name, value, color }, ...]`.

The output array is what Recharts compares for re-render. By memoizing it, we hand Recharts the **same reference** until `tasks` changes — and Recharts skips redrawing the donut.

### 6c — `priorityData` (the horizontal bar chart)

```211:221:frontend/src/pages/Dashboard/DashboardPage.jsx
  const priorityData = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    tasks.forEach((t) => {
      if (counts[t.priority] !== undefined) counts[t.priority] += 1;
    });
    return ["critical", "high", "medium", "low"].map((k) => ({
      name: PRIORITY_LABELS[k],
      value: counts[k],
      color: PRIORITY_COLORS[k],
    }));
  }, [tasks]);
```

Same pattern. The hard-coded array `["critical", "high", "medium", "low"]` enforces the order in the chart (critical at the top, low at the bottom). `Object.entries(counts)` would have given an order based on insertion order, which is fragile.

### 6d — `sprintData` (the stacked bar chart)

```223:231:frontend/src/pages/Dashboard/DashboardPage.jsx
  const sprintData = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      const key = t.sprint || "No Sprint";
      if (!map[key]) map[key] = { name: key, todo: 0, in_progress: 0, in_review: 0, done: 0 };
      if (map[key][t.status] !== undefined) map[key][t.status] += 1;
    });
    return Object.values(map).slice(0, 8);
  }, [tasks]);
```

A two-dimensional aggregation: tally tasks per `(sprint, status)`. The output shape is `[{ name: "Sprint 4", todo: 2, in_progress: 1, in_review: 0, done: 5 }, ...]` — exactly what Recharts' `<Bar dataKey="todo" stackId="s" />` syntax expects.

`.slice(0, 8)` caps the chart at 8 sprints so it stays readable.

### 6e — `typeData` (the radial bar chart)

```233:245:frontend/src/pages/Dashboard/DashboardPage.jsx
  const typeData = useMemo(() => {
    const counts = { task: 0, bug: 0, user_story: 0 };
    tasks.forEach((t) => {
      if (counts[t.task_type] !== undefined) counts[t.task_type] += 1;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({
        name: TYPE_LABELS[k],
        value: v,
        fill: TYPE_COLORS[k],
      }));
  }, [tasks]);
```

Same idea, with one extra step: `.filter(([, v]) => v > 0)` removes empty type buckets. The radial chart looks weird with a zero-value slice; this hides them.

The `[, v]` destructure looks odd — it's "skip the first item of the entry pair (the key), take the second (the count)".

### 6f — `trendData` (the 14-day completion area chart)

```248:263:frontend/src/pages/Dashboard/DashboardPage.jsx
  const trendData = useMemo(() => {
    const today = startOfDay(new Date());
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({ date: d, key: d.toISOString().slice(0, 10), label: formatShortDate(d), completed: 0 });
    }
    const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
    tasks.forEach((t) => {
      if (t.status !== "done" || !t.updated_at) return;
      const k = new Date(t.updated_at).toISOString().slice(0, 10);
      if (byKey[k]) byKey[k].completed += 1;
    });
    return days;
  }, [tasks]);
```

The most algorithmic of the bunch. Walk through it:

1. **Build a 14-day skeleton.** Iterate from 13 days ago to today. Each entry has a `date`, a string `key` like `"2026-04-21"`, a friendly `label` like `"Apr 21"`, and a `completed: 0` counter.
2. **Build a lookup table** `byKey` so we can find a day by its date string in O(1) instead of searching the array every time.
3. **Walk the tasks once.** For each "done" task, compute the date key from `updated_at`. If that day is one of our 14 days, increment its counter.
4. Return the original `days` array (now mutated with counts).

> Wait, did we just mutate the entries? Yes — and that's fine, because they were freshly created inside this memo. The "never mutate" rule applies to **state** owned by React. Local objects you just made are yours to modify.

The skeleton-first approach guarantees we get a continuous 14-day range even on quiet days (so the chart doesn't have gaps).

### 6g — `upcomingDeadlines` (the bottom list)

```265:287:frontend/src/pages/Dashboard/DashboardPage.jsx
  const upcomingDeadlines = useMemo(() => {
    const now = startOfDay(new Date());
    return tasks
      .filter((t) => t.status !== "done" && t.due_date)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 7)
      .map((t) => {
        const due = new Date(t.due_date);
        const diff = daysBetween(due, now);
        let badgeClass = styles.deadlineNormal;
        let badgeText = `In ${diff} day${diff === 1 ? "" : "s"}`;
        if (diff < 0) {
          badgeClass = styles.deadlineOverdue;
          badgeText = `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} overdue`;
        } else if (diff === 0) {
          badgeClass = styles.deadlineToday;
          badgeText = "Due today";
        } else if (diff <= 3) {
          badgeClass = styles.deadlineSoon;
        }
        return { task: t, diff, badgeClass, badgeText };
      });
  }, [tasks]);
```

A textbook fluent chain:
- `.filter` → drop completed and date-less tasks.
- `.sort` → soonest deadline first.
- `.slice(0, 7)` → keep just the most urgent seven.
- `.map` → enrich each one with display data (`badgeClass`, `badgeText`).

Three notes:

1. We compute `diff` once and reuse it for the badge logic. That's much cleaner than computing it per branch.
2. The pluralization (`"day" + (diff === 1 ? "" : "s")`) is the same Chapter-3 trick.
3. **`.sort()` mutates the array it's called on.** If `tasks` were the original state array, this would silently corrupt it. But here `.filter` returned a new array first, so `.sort` is only mutating that intermediate array. Safe.

### 6h — `greeting` (a one-time computation)

```291:296:frontend/src/pages/Dashboard/DashboardPage.jsx
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);
```

Empty deps — computed once when the component mounts, then frozen for the lifetime of the page. (If you stay on the dashboard from 11:55 AM to 12:05 PM, the greeting won't update. Acceptable. If we cared, we'd add a 1-minute interval to refresh.)

This is a perfectly valid use of `useMemo([])` — even though the function is cheap, it's a way of saying "compute once, never again, until I unmount."

### The cumulative payoff

`tasks` is the only real input. Every memo above keys off it. Suppose you click around the page — opening the action menu, hovering over a chart, anything that triggers a re-render of `DashboardPage`. **None of the seven aggregations re-run.** All seven Recharts components see identical data references and skip re-rendering their SVGs.

That's the dividend of the memo wall. Without it, you'd have a sluggish dashboard the moment you crossed a few hundred tasks.

---

## 7. The "stable function for a child" pattern

The third use case for `useCallback` (alongside effect-deps and context) is passing a stable callback to a memoized child.

Example shape:

```jsx
const Child = React.memo(function Child({ onSelect }) {
  // expensive render
});

function Parent() {
  const [a, setA] = useState(0);
  const handleSelect = useCallback((id) => doSomething(id), []);
  return (
    <>
      <button onClick={() => setA(a + 1)}>{a}</button>
      <Child onSelect={handleSelect} />
    </>
  );
}
```

When you click the button, `Parent` re-renders. With `useCallback([])`, `handleSelect` keeps its reference. `Child` (wrapped in `React.memo`) sees identical props and skips re-rendering.

Without `useCallback`, `handleSelect` would be a new reference each click, and `Child` would re-render every time even though nothing about it changed.

We don't lean on `React.memo` heavily in our app yet, but knowing this pattern is essential for any performance work later.

---

## 8. When **NOT** to memoize

Memoization isn't free:

- `useMemo` and `useCallback` allocate the cache, run a comparison every render, and store the previous value/reference.
- The cognitive cost of seeing memo wrappers everywhere makes code harder to read.
- A wrong dependency list causes subtle stale-value bugs (worse than no memo at all).

**Rules of thumb:**

| Situation | Memoize? |
| --- | --- |
| The computed value is cheap (`tasks.length`, simple math) and not used as a dep | No |
| The function is only called from JSX (`onClick={() => doX()}`) and the child is not memoized | No |
| The value is a dep of `useEffect`/`useMemo`/`useCallback` and gets recreated each render | Yes |
| Function passed through context | Yes — many consumers |
| Function passed to many children, especially memoized ones | Yes |
| Computation walks a large array or is otherwise visibly slow | Yes |
| You "feel like" memoizing because it sounds professional | **No** |

Many beginner React code-bases over-memoize. They wrap everything, deps lists go stale, bugs creep in. The healthier instinct: write the boring version first, profile if it feels slow, then memoize the hot spot.

---

## 9. The `useCallback` ↔ `useEffect` ↔ ESLint loop

You'll often hit this exact sequence:

1. You write a `useEffect`.
2. The effect calls a function defined in the component.
3. ESLint warns: *"React Hook useEffect has a missing dependency: 'fetchData'."*
4. You add it to the deps.
5. Now the effect re-fires every render (because `fetchData` is a new reference each render).
6. You wrap `fetchData` in `useCallback` with its own deps.
7. ESLint warns: *"React Hook useCallback has a missing dependency: 'userId'."*
8. You add it to `useCallback`'s deps.
9. Now everything is stable. The effect runs only when `userId` actually changes.

That climb up the dependency ladder is the standard refactoring. The Dashboard's `fetchTasks` is a perfect example:

```153:171:frontend/src/pages/Dashboard/DashboardPage.jsx
  const fetchTasks = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await tasksApi.listTasks(1, 200, {
        assignee_id: userId,
        is_archived: false,
      });
      setTasks(data.items || []);
    } catch {
      setToast({ message: "Failed to load dashboard data.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);
```

`fetchTasks` depends on `userId`. The effect depends on `fetchTasks`. So:
- When `userId` changes (e.g., user logs in), `fetchTasks` gets a new reference, the effect fires, the dashboard refetches.
- Otherwise, `fetchTasks` is the same reference, effect stays put.

This is exactly the discipline `useCallback` was designed for.

---

## 10. Try it yourself

### Exercise 1 — Spot the wasted work

```jsx
function Inbox({ messages, query }) {
  const filtered = messages.filter((m) => m.subject.includes(query));
  // ... renders <List items={filtered} />
}
```

If `<Inbox>` re-renders 100 times a second because of unrelated parent state, what happens?

<details>
<summary>Answer</summary>

`messages.filter(...)` runs 100 times a second. With a thousand messages that's a million operations a second. Wrap in `useMemo(() => messages.filter(...), [messages, query])` and it only runs when `messages` or `query` changes.
</details>

### Exercise 2 — Why does this effect loop?

```jsx
function User({ id }) {
  const fetchUser = () => api.getUser(id);
  useEffect(() => { fetchUser(); }, [fetchUser]);
}
```

<details>
<summary>Answer</summary>

`fetchUser` is recreated every render → new reference → effect fires → state updates → re-render → new `fetchUser` → loop. Fix:

```jsx
const fetchUser = useCallback(() => api.getUser(id), [id]);
useEffect(() => { fetchUser(); }, [fetchUser]);
```

Now `fetchUser` only changes when `id` changes.
</details>

### Exercise 3 — Should you memoize?

For each, decide: memoize or not?

a. `const greeting = "Hello, " + user.name;`
b. `const sortedTasks = tasks.slice().sort((a, b) => a.priority - b.priority);` — used by 3 children, none memoized
c. `const onClick = () => setOpen(true);` — passed to a `<Button>` that isn't `React.memo`'d
d. `const filters = { status, priority };` — passed as a `useEffect` dep

<details>
<summary>Answers</summary>

a. **No.** Trivial string concat, not a dep.
b. **Yes.** Real work (slice + sort) and it produces a new array reference each render. Memoize to keep the reference stable for memoized children — though if no children are memoized, the win is just the sort itself.
c. **No.** Plain `<Button>` re-renders cheaply; the inline arrow is fine.
d. **Yes.** Otherwise the effect re-fires every render. `useMemo(() => ({ status, priority }), [status, priority])`.
</details>

### Exercise 4 — Refactor for stability

Take this and refactor so the effect runs only when `userId` changes:

```jsx
function Profile({ userId }) {
  const fetchProfile = async () => {
    const data = await api.profile(userId);
    setProfile(data);
  };
  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  // ...
}
```

<details>
<summary>Solution</summary>

```jsx
function Profile({ userId }) {
  const fetchProfile = useCallback(async () => {
    const data = await api.profile(userId);
    setProfile(data);
  }, [userId]);
  useEffect(() => { fetchProfile(); }, [fetchProfile]);
}
```

Now `fetchProfile`'s identity changes only when `userId` does, and the effect tracks that exactly.
</details>

---

## 11. Cheat sheet

| Concept | One-liner |
| --- | --- |
| `useMemo(fn, deps)` | Cache the **return value** of `fn`. Recompute only when `deps` change. |
| `useCallback(fn, deps)` | Cache the **function reference** of `fn`. Same as `useMemo(() => fn, deps)`. |
| Reference identity | `{} !== {}`. React compares deps with `===`. Same reference = "no change". |
| Reason 1 to memoize | A `useEffect`/`useMemo`/`useCallback` lists this value as a dep. |
| Reason 2 to memoize | The value is passed to a memoized child (`React.memo`) as a prop. |
| Reason 3 to memoize | The computation is genuinely expensive (large array filter/sort/reduce). |
| When not to memoize | Trivial value, no dep, no memoized child. |
| Standard cascade | Wrap a function in `useCallback` so a `useEffect` that depends on it doesn't re-fire. |
| Memo deps rule | Same as `useEffect`: list everything you read. ESLint `exhaustive-deps` is your friend. |
| `useMemo([])` | Compute once on mount, never again. Valid for "current time" greetings, etc. |

---

## 12. What's next

You can now:

- Stop unnecessary recomputation with `useMemo`
- Stop re-creating function references with `useCallback`
- Recognize when a `useEffect` is looping because of an unstable dep
- Read the Dashboard's memo chains and understand exactly why each one exists
- Reach for the boring (un-memoized) version first and only memoize when measured

But there's still one piece of state you don't have access to yet — the actual **DOM elements** themselves. How do we focus an input programmatically? Detect a click outside our menu? Hold onto a value across renders without triggering one?

That's `useRef`. **Chapter 7** dissects:

- The DOM-reference pattern (`menuRef.current.contains(e.target)` from `TasksList`)
- The "mutable box" pattern — values that don't trigger re-renders
- Why refs are *escape hatches* and how to keep that disciplined

When you're ready, ask for **Chapter 7 — `useRef` for DOM and Mutable Values**.

You now have the four most important hooks: `useState`, `useEffect`, `useCallback`, `useMemo`. With these alone, you can build essentially any React app.
