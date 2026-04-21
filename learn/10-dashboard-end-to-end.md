# Chapter 10 — Dashboard: From HTTP Request to Rendered Chart

> **What you'll learn**
> - How a single screen orchestrates **auth, HTTP, state, derived data, charting, and user interaction** at the same time
> - The **flow** of one byte of data from MongoDB → FastAPI → axios interceptor → React state → `useMemo` → Recharts SVG
> - How to **derive seven different views of the same dataset** with `useMemo` instead of seven separate API calls
> - When to make a **reusable widget component** (`KpiCard`, `ChartCard`) vs. inline JSX
> - The **three-state UI machine** every data screen needs: loading / empty / hydrated
> - Why the dashboard talks to other components (`ViewTaskModal`, `Toast`, `useAuth`, `useTheme`) and how those connections work
> - How **Recharts** plugs into a React app, what `ResponsiveContainer` is doing under the hood, and the gotchas

The dashboard is the most complex screen in the app. It's also the best teaching example because it touches almost every concept from the previous chapters at once. If you understand this file end-to-end, you understand React in this codebase.

The file we're dissecting is [frontend/src/pages/Dashboard/DashboardPage.jsx](../frontend/src/pages/Dashboard/DashboardPage.jsx) (554 lines).

---

## 1. What the dashboard does (60 seconds)

When a logged-in user hits `/`, they see:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Good afternoon, Alice                                    [↻ Refresh] │
│ Tuesday, April 21, 2026 · Here's what's on your plate                │
├──────────────────────────────────────────────────────────────────────┤
│ ┌─Total─┐ ┌─In Progress─┐ ┌─Due Soon─┐ ┌─Completed (7d)─┐           │ ← KPI row
│ │  42   │ │      8      │ │    3     │ │       11       │           │
│ └───────┘ └─────────────┘ └──────────┘ └────────────────┘           │
├──────────────────────┬───────────────────────────────────────────────┤
│ Status Breakdown     │ Priority Distribution                         │ ← Row 1
│  (donut)             │  (horizontal bars)                            │
├──────────────────────┼───────────────────────────────────────────────┤
│ Sprint Workload      │ Task Type Mix                                 │ ← Row 2
│  (stacked bars)      │  (radial bars)                                │
├──────────────────────┴───────────────────────────────────────────────┤
│ Completion Trend (last 14 days)                                       │ ← Row 3
│  (area chart)                                                         │
├──────────────────────────────────────────────────────────────────────┤
│ Upcoming Deadlines                                                    │ ← Row 4
│  • Task A — In 2 days   [SOON]   Apr 23                              │
│  • Task B — Due today   [TODAY]  Apr 21                              │
│  ...                                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

All seven of those visualizations come from **one API call**: "give me my tasks." The rest is pure client-side derivation.

That design decision — fetch raw data once, derive everything from it — is the most important architectural choice in this file. We'll come back to why.

---

## 2. The file map (who imports what)

```
┌────────────────────────────────────────────────────────────────────┐
│ DashboardPage.jsx                                                  │
│                                                                    │
│  imports ↓                                                         │
│                                                                    │
│  • react              → useState, useEffect, useMemo, useCallback  │
│  • recharts           → 14 chart primitives                        │
│  • ../../hooks/useAuth → who is the current user?                  │
│  • ../../hooks/useTheme → light or dark mode?                      │
│  • ../../api/tasks    → tasksApi.listTasks()                       │
│  • ../../components/ViewTaskModal → opens when deadline clicked    │
│  • ../../components/Toast        → success/error notifications     │
│  • ./widgets/KpiCard             → presentational KPI tile         │
│  • ./widgets/ChartCard           → presentational chart container  │
│  • ./DashboardPage.module.css    → all styles                      │
└────────────────────────────────────────────────────────────────────┘

         ↓ at runtime, the data path is:

┌──────────┐   GET /api/tasks?       ┌──────────┐   Mongo query   ┌──────────┐
│  axios   │ ───────────────────────►│ FastAPI  │ ───────────────►│ MongoDB  │
│  client  │  Bearer + cookies       │ /tasks   │                 │  tasks   │
│ (client.js)                        │ (route)  │                 │  coll.   │
└────┬─────┘                         └────┬─────┘                 └────┬─────┘
     │                                    │                            │
     │ ◄──────────────────────────────────┴────────────────────────────┘
     │      { items: [...], total, page, page_size, total_pages }
     ▼
DashboardPage.jsx
  setTasks(data.items)
       │
       ▼
  7× useMemo aggregations
       │
       ▼
  KpiCard ×4   +   ChartCard ×5 wrapping <Recharts/>   +   <ViewTaskModal/>
```

Hold this picture in your head. We'll trace each arrow in detail.

---

## 3. The data layer (axios + interceptors)

The dashboard's only HTTP call is one line:

```176:179:frontend/src/pages/Dashboard/DashboardPage.jsx
      const data = await tasksApi.listTasks(1, 200, {
        assignee_id: userId,
        is_archived: false,
      });
```

But that one line hides three layers of plumbing.

### Layer A — the API module

[frontend/src/api/tasks.js](../frontend/src/api/tasks.js) is a thin wrapper that turns "list tasks" into "GET /tasks":

```4:9:frontend/src/api/tasks.js
  listTasks: async (page = 1, pageSize = 50, filters = {}) => {
    const response = await client.get("/tasks", {
      params: { page, page_size: pageSize, ...filters },
    });
    return response.data;
  },
```

A few things worth noticing:

- It returns `response.data` (the body), not the whole axios response. Callers don't care about HTTP headers/status — they just want the JSON.
- `params` is spread last so callers can pass any backend-supported filter without us having to hardcode them here. Adding a new filter to the backend doesn't require touching this file.
- Defaults (`page = 1, pageSize = 50`) make the simple call site (`tasksApi.listTasks()`) work too.

This is a **module pattern**: one file per resource (`tasks.js`, `auth.js`, `users.js`), each exporting an object whose methods correspond to backend endpoints. There's no `useFetch` magic — calls are explicit, return promises, and pages do their own state management.

### Layer B — the HTTP client (the real work)

[frontend/src/api/client.js](../frontend/src/api/client.js) is the heart of the data layer. It's an axios instance with two interceptors:

**Request interceptor** — attaches the JWT to every outgoing call:

```15:21:frontend/src/api/client.js
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

So when the dashboard calls `tasksApi.listTasks(...)`, the actual HTTP request that goes out looks like:

```
GET /api/tasks?page=1&page_size=200&assignee_id=abc&is_archived=false HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Cookie: refresh_token=...
```

The dashboard component knows nothing about tokens. That's the point.

**Response interceptor** — silently refreshes expired tokens:

```42:102:frontend/src/api/client.js
client.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    // Auth endpoints return 401 for business reasons (wrong password),
    // not because of expired tokens. Don't try to refresh for those.
    const url = originalRequest.url || "";
    const isAuthEndpoint =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/refresh");

    if (
      error.response?.status !== 401 ||
      originalRequest._retry ||
      isAuthEndpoint
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => client(originalRequest));
    }

    originalRequest._retry = true;
    isRefreshing = true;
```

Why this matters for the dashboard: if the user leaves their tab open for 31 minutes (longer than the access token's lifetime) and clicks **Refresh**, the user-perceived flow is:

```
click Refresh
  ↓
GET /api/tasks → 401 expired
  ↓ (interceptor catches the 401)
POST /api/auth/refresh → 200 with new access_token
  ↓ (interceptor saves new token, retries original)
GET /api/tasks → 200 OK
  ↓
data shows up
```

The dashboard component has zero awareness this happened. It just `await`ed `listTasks()` and got back data. The "refresh once, retry many" queue (`failedQueue`) ensures that if the dashboard fired five aggregation requests in parallel and they all expired, only one refresh call goes out and the other four wait their turn instead of all stampeding the refresh endpoint.

### Layer C — the backend route

The Python side is a thin transport over the service layer:

```37:65:backend/app/routes/task.py
async def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
    task_type: str | None = Query(None),
    assignee_id: str | None = Query(None),
    sprint: str | None = Query(None),
    is_archived: bool | None = Query(None),
    created_by: str | None = Query(None),
    priority: str | None = Query(None),
    title: str | None = Query(None),
    exclude_task_type: str | None = Query(None),
    _user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
```

Things worth knowing:

- `_user: UserInDB = Depends(get_current_active_user)` is FastAPI's dependency injection. If the JWT is missing or invalid, FastAPI throws a 401 *before* `list_tasks` runs. The dashboard call would then trigger the refresh flow described above.
- We pass `assignee_id=userId` so the backend filters tasks server-side. We don't fetch *all* tasks and filter client-side.
- The response shape is `PaginatedTasks`:

  ```107:113:backend/app/models/task.py
  class PaginatedTasks(BaseModel):
      items: list[TaskResponse]
      total: int
      page: int
      page_size: int
      total_pages: int
  ```

  We ask for `page_size=200` because the dashboard needs to aggregate over the user's full workload, not paginate visually. A user with more than 200 active tasks would get truncated stats — that's a known limitation we'd address with `total_pages > 1` paging if/when it becomes a real problem.

> **Architectural note**: We do all aggregation on the *client* (the seven `useMemo`s below). For a small workload that's fine and lets the same endpoint serve the dashboard, the All Tasks list, and the Sprint Board. If `total` ever grows past a few hundred per user, we'd add a dedicated `/tasks/dashboard-stats` endpoint that runs MongoDB aggregations and returns just the counts. Don't add that endpoint until you actually need it.

---

## 4. Wiring it into the component

Three lines bridge "I'm a React component" and "I want data from the network":

```167:170:frontend/src/pages/Dashboard/DashboardPage.jsx
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [viewTaskId, setViewTaskId] = useState(null);
```

Four pieces of state, each with a single purpose:

| State | What it represents |
| --- | --- |
| `tasks` | The raw array from the server. Everything else is derived from this. |
| `loading` | True while a fetch is in flight. Drives the "Loading…" UI and disables the Refresh button. |
| `toast` | `null` or `{ message, type }`. When non-null, the `<Toast/>` shows. |
| `viewTaskId` | `null` or a string. When non-null, the `<ViewTaskModal/>` opens for that task. |

Notice what's **not** in state: `kpis`, `statusData`, `priorityData`, `sprintData`, `typeData`, `trendData`, `upcomingDeadlines`. None of them. They're all *derived* from `tasks` via `useMemo`. Storing them in state would mean keeping seven things in sync with `tasks` manually, which is a class of bug we never want to write.

### The fetch function

```172:186:frontend/src/pages/Dashboard/DashboardPage.jsx
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
```

Five things to point out:

1. **Guard at the top**: `if (!userId) return;`. On first render `useAuth()` may still be loading (`user` is `null`), so we bail. As soon as auth resolves, this `useCallback` recreates with the new `userId`, the `useEffect` below re-runs, and the fetch goes out.

2. **`useCallback`, not a plain function**. Why? Because it's a dependency of the `useEffect` below. If we redefined the function on every render, the effect would re-run on every render, triggering an infinite fetch loop. `useCallback` gives us a stable reference that only changes when `userId` changes.

3. **Try / catch / finally** — the textbook fetch pattern:
   - `try` — set loading, do the call, store the result
   - `catch` — show the user a friendly error (the interceptor handles the technical part)
   - `finally` — always clear the loading flag, even on error

4. **`data.items || []`** — defensive. If the backend ever returned `{ items: null }` instead of an empty array, all the `.filter()` calls in the aggregations would throw. The fallback prevents that.

5. **Why we don't `setError(err)` and store the error** — because the toast is the error UI here. The previous data on screen stays visible (which is a better UX than blanking the screen on a transient network blip), and the user gets a dismissable notification. Storing an error in state would tempt us to render a full error screen, which we don't want.

### Triggering the fetch

```188:190:frontend/src/pages/Dashboard/DashboardPage.jsx
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);
```

Six lines but a lot of subtlety:

- `[fetchTasks]` — the dep array contains the *function*, not the data. React's stale-closure rules say if `fetchTasks` changes (because `userId` changed), this effect must re-run.
- This means: **on first auth resolution, the dashboard auto-fetches**. We don't need a separate "fetch when user appears" effect.
- The Refresh button calls `fetchTasks()` directly (not via state change). That doesn't cause the effect to re-run — it just runs the function imperatively. Both call sites converge on the same code path.

> **Trap to avoid**: Beginners often write `useEffect(() => { ... }, [])` and put the entire async logic inline. Then they need to refresh from a button click and have to copy-paste the code. Hoisting the fetch into `useCallback` once and calling it from both the effect and the button is the right pattern.

---

## 5. Auth: the user-scoping seam

```146:147:frontend/src/pages/Dashboard/DashboardPage.jsx
  const { user } = useAuth();
  const userId = user?.id || user?._id;
```

Why both `user.id` and `user._id`?

The backend's `UserResponse` model serializes Mongo's `_id` as both. Different code paths historically returned one or the other. The `||` is a belt-and-braces fallback so the dashboard works regardless of which the backend currently emits. It's a small bit of defensive code that costs nothing and saves debugging.

**Where the `user` object actually comes from**: `AuthContext` mounts on app boot, calls `/api/auth/me`, and stores the result. If the call succeeds the user is logged in; if it fails (no token, expired, refresh also failed) the user is `null`. The `<ProtectedRoute/>` wrapper around this route guarantees that by the time the dashboard renders, the user is non-null — but we still use optional chaining (`user?.id`) because during the render-cycle right after logout, the user briefly becomes `null` before `<ProtectedRoute/>` redirects. Optional chaining means we don't crash during that single render.

```317:317:frontend/src/pages/Dashboard/DashboardPage.jsx
  const firstName = (user?.full_name || "").split(" ")[0] || "there";
```

Same defensive pattern. If `user.full_name` is missing for any reason, we say "there" instead of crashing on `.split` of `undefined`.

---

## 6. The seven `useMemo` aggregations

This is where the dashboard earns its reputation as a `useMemo` masterclass. We have one source of truth (`tasks`) and seven derived views. Each one is a pure function: same `tasks` in → same shape out.

Why `useMemo`? Two reasons:

- **Performance**: aggregations like `trendData` iterate the full task array. Doing that on every render — including renders triggered by toggling the theme or opening the modal — would burn cycles for nothing.
- **Reference stability**: Recharts re-renders when its `data` prop is a new array reference. Without `useMemo`, every parent re-render gives Recharts a fresh array (with identical content) and forces a chart re-mount. Animations would stutter.

Let's walk through each.

### 6a. `kpis` — four numbers from one pass

```194:215:frontend/src/pages/Dashboard/DashboardPage.jsx
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

Note the date helpers at the top of the file:

```73:81:frontend/src/pages/Dashboard/DashboardPage.jsx
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a, b) {
  return Math.floor((startOfDay(a) - startOfDay(b)) / 86400000);
}
```

`startOfDay` matters because comparing `new Date()` (which is `now` to the millisecond) against `due_date` (which is midnight UTC) gives off-by-one bugs. Normalizing both to "start of day" makes "due today" actually mean "due today."

`daysBetween` divides by `86_400_000` (the number of milliseconds in a day). Used by the Upcoming Deadlines aggregation below.

### 6b. `statusData` — donut chart shape

```217:228:frontend/src/pages/Dashboard/DashboardPage.jsx
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

The output shape is exactly what Recharts' `<Pie>` wants:

```js
[
  { key: "todo",        name: "To Do",       value: 12, color: "#94a3b8" },
  { key: "in_progress", name: "In Progress", value:  8, color: "#3b82f6" },
  { key: "in_review",   name: "In Review",   value:  5, color: "#f59e0b" },
  { key: "done",        name: "Done",        value: 17, color: "#10b981" },
]
```

`name` becomes the legend label, `value` becomes the slice size, `color` is fed to each `<Cell>`. **This is the pattern**: shape the data once in `useMemo`, hand it to the chart, let the chart be dumb.

### 6c. `priorityData` — same idea, ordered

```230:240:frontend/src/pages/Dashboard/DashboardPage.jsx
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

Subtle but important: we reorder by `["critical", "high", "medium", "low"]` instead of using `Object.entries(counts)`. That gives us a deterministic chart axis order — most-urgent always at top — instead of relying on JS object key insertion order.

### 6d. `sprintData` — grouped + stacked

```242:250:frontend/src/pages/Dashboard/DashboardPage.jsx
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

This builds a row per sprint with one count per status — exactly what a stacked bar chart needs. The `.slice(0, 8)` cap protects the chart from rendering 50+ bars if the user has tasks in many sprints.

`t.sprint || "No Sprint"` is the bucket-the-nulls pattern — tasks without a sprint don't disappear, they get their own bar.

### 6e. `typeData` — radial mix

```252:264:frontend/src/pages/Dashboard/DashboardPage.jsx
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

The `.filter(([, v]) => v > 0)` is the key here. Radial bar charts look bad when one of the rings is invisibly small (zero), so we drop empty types entirely. The `[, v]` destructuring is "ignore the first element of the entry, take the second" — a tidy idiom worth knowing.

Notice we use `fill` here instead of `color`. That's because Recharts' `<RadialBar>` reads from `fill` directly on each datum, not via a `<Cell>` child like `<Pie>` does. Each chart type wants the data shaped slightly differently — read the docs once, then forget the details and let the `useMemo` enforce the shape.

### 6f. `trendData` — fixed-length time series

```266:282:frontend/src/pages/Dashboard/DashboardPage.jsx
  // 14-day completion trend (uses updated_at as proxy for completed_at)
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

This is the most algorithmically interesting one. Two-pass:

1. **Build the skeleton** — 14 day-slots from 13 days ago to today, all initialized to `completed: 0`. This guarantees the X axis shows every day even if no task was completed on that day.
2. **Index by ISO date** (`Object.fromEntries(days.map(d => [d.key, d]))`) — gives us O(1) lookup instead of O(n) per-task search.
3. **Single pass over tasks**, incrementing the right bucket.

The result is a stable, gap-free time series that Recharts can chart linearly. The comment about `updated_at` as a proxy for `completed_at` is honest documentation — we don't track completion timestamps separately, so we use the next-best signal.

### 6g. `upcomingDeadlines` — list with computed labels

```284:306:frontend/src/pages/Dashboard/DashboardPage.jsx
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

The classic functional chain:

```
filter → sort → slice → map
```

Each step does one thing and produces a smaller / transformed array. The final `.map` enriches each task with the *computed presentation data* — `badgeClass` and `badgeText` — so the JSX below stays simple:

```530:531:frontend/src/pages/Dashboard/DashboardPage.jsx
                <span className={`${styles.deadlineBadge} ${badgeClass}`}>{badgeText}</span>
                <span className={styles.deadlineDate}>{formatShortDate(task.due_date)}</span>
```

No conditionals in the JSX. All the "is it overdue, soon, today, or normal" logic lives in the memo, which makes the JSX a thin presentation layer over pre-computed values. This is the **derive in JS, render with JSX** principle.

### 6h. The greeting (a tiny bonus)

```310:315:frontend/src/pages/Dashboard/DashboardPage.jsx
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);
```

Empty dep array — computed once on mount and never again. If a user keeps the tab open from morning to evening, the greeting won't update. That's a deliberate trade-off: re-evaluating the greeting on every render to handle the once-per-day case isn't worth the cost.

---

## 7. The reusable widgets

Two tiny components live next door in [frontend/src/pages/Dashboard/widgets/](../frontend/src/pages/Dashboard/widgets/):

### `KpiCard` — dumb, presentational, reusable

```1:14:frontend/src/pages/Dashboard/widgets/KpiCard.jsx
import styles from "../DashboardPage.module.css";

export function KpiCard({ icon, label, value, accent = "blue", subtext }) {
  return (
    <div className={`${styles.kpiCard} ${styles[`accent_${accent}`]}`}>
      <div className={styles.kpiIcon}>{icon}</div>
      <div className={styles.kpiBody}>
        <div className={styles.kpiLabel}>{label}</div>
        <div className={styles.kpiValue}>{value}</div>
        {subtext && <div className={styles.kpiSub}>{subtext}</div>}
      </div>
    </div>
  );
}
```

Why is this a separate file? Three reasons:

1. **Repetition** — we render four KPI cards in a row. A loop or four near-identical JSX blocks would both be uglier than `<KpiCard/>` four times.
2. **Naming the abstraction** — when you see `<KpiCard icon={...} label="Total Tasks" value={42}/>` you immediately understand it. When you see 18 lines of nested `<div className={styles.kpiCard}>`, you don't.
3. **Style cohesion** — accent variants (`blue`, `amber`, `red`, `green`) become a *prop* instead of a copy-paste decision at each call site. If we ever want to add `purple`, we add one CSS rule and one accent prop value.

The trick on line 5 — `styles[\`accent_${accent}\`]` — composes a CSS Module class name dynamically. The accents are defined in the page CSS:

```157:160:frontend/src/pages/Dashboard/DashboardPage.module.css
.accent_blue   { --accentColor: #3b82f6; --accentBg: rgba(59, 130, 246, 0.16); }
.accent_amber  { --accentColor: #f59e0b; --accentBg: rgba(245, 158, 11, 0.16); }
.accent_red    { --accentColor: #ef4444; --accentBg: rgba(239, 68, 68, 0.16); }
.accent_green  { --accentColor: #10b981; --accentBg: rgba(16, 185, 129, 0.16); }
```

Each accent class sets two CSS variables (`--accentColor` and `--accentBg`). The icon and the card-overlay gradient consume those variables via `var()`. This is a beautiful little use of CSS variables: one prop drives two visual properties without duplicate CSS.

### `ChartCard` — a layout shell with `children`

```1:16:frontend/src/pages/Dashboard/widgets/ChartCard.jsx
import styles from "../DashboardPage.module.css";

export function ChartCard({ title, subtitle, action, children, className = "" }) {
  return (
    <div className={`${styles.chartCard} ${className}`}>
      <div className={styles.chartHeader}>
        <div>
          <h3 className={styles.chartTitle}>{title}</h3>
          {subtitle && <p className={styles.chartSubtitle}>{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={styles.chartBody}>{children}</div>
    </div>
  );
}
```

This is the **container/content separation pattern**. `ChartCard` knows how to draw a card with a title, optional subtitle, optional right-aligned action button, and a body. It does **not** know what's in the body — that's `children`.

The dashboard uses it five times for completely different content: a donut, two bar charts, an area chart, and a list. Same shell, different innards. If we ever want to add "every chart card needs a download button," we add it to `ChartCard` and all five charts get it for free. That's the win.

> The `action` prop is unused right now. It's there because we know we'll want per-chart toolbars (e.g., a "this week / this month" toggle) eventually, and adding a prop slot now is free. Be careful with this pattern though — adding props "in case" is usually a mistake. We added it because the use case is concrete and imminent.

---

## 8. The five Recharts visualizations

Recharts is a declarative chart library: you compose React components like `<PieChart>` and `<XAxis>` and they render an SVG underneath. There are essentially three layers in any chart:

1. **`<ResponsiveContainer>`** — wraps everything. Watches the parent's width and re-renders the chart at the right size. Without this, charts have a fixed width and don't adapt.
2. **A chart type** — `<PieChart>`, `<BarChart>`, `<AreaChart>`, `<RadialBarChart>`. Sets up the coordinate system and data binding.
3. **Series + axes + decorations** — `<Pie>`, `<Bar>`, `<Area>`, `<XAxis>`, `<YAxis>`, `<CartesianGrid>`, `<Tooltip>`, `<Legend>`. The visual elements.

Every chart on the dashboard follows this structure. Let's look at one in detail.

### Status Breakdown — the donut

```370:390:frontend/src/pages/Dashboard/DashboardPage.jsx
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={2}
                stroke={chartColors.pieStroke}
                strokeWidth={2}
              >
                {statusData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
```

Reading this top-down:

- **`width="100%" height={280}`** — fluid width, fixed height. The chart fills the card horizontally and never grows or shrinks vertically. This is what users expect from dashboard widgets.
- **`dataKey="value"` / `nameKey="name"`** — Recharts is data-shape-agnostic. We tell it "the slice size is on the `value` field, the slice label is on `name`." Our `statusData` was shaped to match.
- **`innerRadius={60} outerRadius={95}`** — non-zero inner radius is what makes it a donut instead of a pie. The hole leaves room for visual breathing.
- **`paddingAngle={2}`** — 2° gap between slices. Looks polished, prevents adjacent same-color slices from blurring.
- **`<Cell key={entry.key} fill={entry.color} />`** — each slice gets its own color. The `<Cell>` is Recharts' way of letting you override per-datum styling without duplicating the whole `<Pie>`.
- **Custom `<Tooltip content={<CustomTooltip/>} />`** — we replace Recharts' default tooltip (which is ugly) with our own component. `<CustomTooltip>` is defined at the top of the file and styled with our theme variables. Recharts passes it `active`, `payload`, and `label` props that describe what the user is hovering over.

Below the chart we render a manual legend:

```391:399:frontend/src/pages/Dashboard/DashboardPage.jsx
          <div className={styles.legend}>
            {statusData.map((s) => (
              <div key={s.key} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: s.color }} />
                <span className={styles.legendName}>{s.name}</span>
                <span className={styles.legendValue}>{s.value}</span>
              </div>
            ))}
          </div>
```

Why not Recharts' built-in `<Legend>`? Two reasons:

- Recharts' default legend doesn't show the count next to each label. We want "Done — 17", not just "Done."
- Custom HTML/CSS legends are easier to make responsive and theme-aware than re-styling Recharts internals.

### Theme-awareness of the charts

The chart colors (axes, grid, pie stroke, cursor highlight) come from `chartColors`:

```150:165:frontend/src/pages/Dashboard/DashboardPage.jsx
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

This was covered in detail in [Chapter 9](./09-theming-light-and-dark.md#6-theming-third-party-components-recharts). The short version: Recharts SVGs accept color values as props, not CSS variables. We bridge the two worlds by reading `theme` from the Theme context and computing a palette object.

`useMemo([theme])` ensures the object reference only changes when the theme actually flips — which means Recharts only re-mounts when it has to.

### A fast tour of the other four charts

| Chart | Recharts shape | Notable detail |
| --- | --- | --- |
| **Priority Distribution** (lines 402–416) | `<BarChart layout="vertical">` with `<Cell>`-per-bar coloring | `layout="vertical"` flips bars to horizontal; each bar gets its own color via `<Cell>` |
| **Sprint Workload** (lines 421–438) | `<BarChart>` with four `<Bar stackId="s">` series | `stackId` makes the four status series stack on each other instead of sitting side-by-side. `radius={[6, 6, 0, 0]}` on the top bar gives the stack a rounded cap |
| **Task Type Mix** (lines 440–467) | `<RadialBarChart>` | `startAngle={90} endAngle={-270}` makes it sweep clockwise from 12 o'clock; `innerRadius="30%"` leaves a center hole |
| **Completion Trend** (lines 471–498) | `<AreaChart>` with `<defs><linearGradient>` | The `<defs>` defines a vertical gradient from green-translucent at top to transparent at bottom; the `<Area>` references it via `fill="url(#completeGradient)"` |

The pattern repeats: shape your data with `useMemo`, hand it to a `<ResponsiveContainer>`, declare what you want.

---

## 9. Connecting to the modal — the drill-down loop

The Upcoming Deadlines list isn't just decoration. Each row is clickable.

```508:534:frontend/src/pages/Dashboard/DashboardPage.jsx
          <div className={styles.deadlineList}>
            {upcomingDeadlines.map(({ task, badgeClass, badgeText }) => (
              <button
                key={task._id}
                type="button"
                className={styles.deadlineRow}
                onClick={() => setViewTaskId(task._id)}
              >
                <span
                  className={styles.deadlineStripe}
                  style={{ background: PRIORITY_COLORS[task.priority] || "#cbd5e1" }}
                />
                <div className={styles.deadlineMain}>
                  <div className={styles.deadlineTitle}>{task.title}</div>
                  <div className={styles.deadlineMeta}>
                    <span>{TYPE_LABELS[task.task_type] || task.task_type}</span>
                    <span className={styles.dotSep}>·</span>
                    <span>{STATUS_LABELS[task.status] || task.status}</span>
                    <span className={styles.dotSep}>·</span>
                    <span>{PRIORITY_LABELS[task.priority] || task.priority}</span>
                  </div>
                </div>
                <span className={`${styles.deadlineBadge} ${badgeClass}`}>{badgeText}</span>
                <span className={styles.deadlineDate}>{formatShortDate(task.due_date)}</span>
              </button>
            ))}
          </div>
```

Notice each row is a `<button type="button">`, not a `<div onClick>`. That gives us:

- **Keyboard accessibility** — Tab-able and triggerable with Space/Enter.
- **Screen-reader semantics** — assistive tech announces it as a button.
- **Free :focus styles** — browsers give buttons a focus ring for free.

### The modal handshake

```538:548:frontend/src/pages/Dashboard/DashboardPage.jsx
      {viewTaskId && (
        <ViewTaskModal
          taskId={viewTaskId}
          onClose={() => setViewTaskId(null)}
          onUpdated={() => {
            setViewTaskId(null);
            setToast({ message: "Task updated.", type: "success" });
            fetchTasks();
          }}
        />
      )}
```

This is the canonical "open modal from list" pattern in three lines:

1. **Conditional render** — when `viewTaskId` is `null`, the modal doesn't exist in the tree. When it becomes a string, the modal mounts. When it becomes `null` again, the modal unmounts. This guarantees clean state — there's no "remembered" form data from a previous task.
2. **`onClose` resets the trigger state** — the modal dismisses by setting `viewTaskId` to `null`.
3. **`onUpdated` does three things at once**:
   - Close the modal (`setViewTaskId(null)`)
   - Show a success toast (`setToast(...)`)
   - **Re-fetch the data** (`fetchTasks()`) so the dashboard reflects the change

That last step is the connection that ties everything together. The user updates a task in the modal → the dashboard re-fetches → all seven `useMemo`s recompute → the four KPIs and five charts all update simultaneously.

We pay for one HTTP round-trip and get a fully consistent UI in return. That's the architectural payoff of the "fetch raw, derive everything" approach.

> **Alternative approach** (that we did not take): "optimistic updates" where we mutate the local `tasks` array in memory and skip the re-fetch. That would be faster but requires us to manually replicate every backend rule (auto-archive, validation, derived fields like `assignee_name` populated from a join). Re-fetching is slower but absolutely truthful. For a dashboard with one HTTP call and small payloads, that trade-off is correct.

### Inside the modal

[`ViewTaskModal`](../frontend/src/components/ViewTaskModal.jsx) does its own fetching:

```51:82:frontend/src/components/ViewTaskModal.jsx
  useEffect(() => {
    let cancelled = false;

    async function fetchTask() {
      setLoading(true);
      setError("");
      try {
        const data = await tasksApi.getTask(taskId);
        if (!cancelled) {
          setTask(data);
          setTags(data.tags || []);
          setForm({
            title: data.title,
            description: data.description,
            status: data.status,
            priority: data.priority,
            task_type: data.task_type,
            sprint: data.sprint || "",
            due_date: data.due_date ? data.due_date.slice(0, 10) : "",
            assignee_id: data.assignee_id || "",
          });
        }
      } catch {
        if (!cancelled) setError("Failed to load task details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTask();
    return () => { cancelled = true; };
  }, [taskId]);
```

The `let cancelled = false; ... return () => { cancelled = true; };` pattern is the **race-condition guard**. If the user opens task A, then quickly closes the modal and opens task B before A's response comes back, the cleanup function from A's effect runs, sets `cancelled = true`, and prevents A's stale response from `setForm()`-ing over B's data.

This is the kind of bug that's hard to reproduce in dev (because your local API is fast) and easy to ship to production (where some users on slow connections will hit it). The pattern is cheap insurance.

When the user saves:

```101:121:frontend/src/components/ViewTaskModal.jsx
  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const payload = { ...form, tags };
      payload.sprint = payload.sprint || null;
      payload.due_date = payload.due_date || null;
      payload.assignee_id = payload.assignee_id || null;

      await tasksApi.updateTask(taskId, payload);
      onUpdated();
    } catch (err) {
      const message =
        err.response?.data?.detail || "Failed to update task. Try again.";
      setError(typeof message === "string" ? message : JSON.stringify(message));
    } finally {
      setSaving(false);
    }
  };
```

The `onUpdated()` callback is the link back to the dashboard's `fetchTasks() + setToast()` logic. The modal is decoupled — it has no idea what `onUpdated` does. It just shouts "I succeeded!" and the parent decides what that means (re-fetch + toast for the dashboard, redirect for some other caller).

This is **lifting state up** in action, and it's why the modal is reusable. The same `<ViewTaskModal/>` is used by the All Tasks page, My Tasks page, and Sprint Board — each parent provides its own `onUpdated` behavior.

---

## 10. The Toast — a 19-line component doing real work

```1:18:frontend/src/components/Toast.jsx
import { useEffect } from "react";
import styles from "./Toast.module.css";

export function Toast({ message, type = "success", onClose, duration = 3000 }) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div className={`${styles.toast} ${styles[type]}`}>
      <span className={styles.message}>{message}</span>
      <button className={styles.close} onClick={onClose} aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
}
```

This is the tightest example of `useEffect` cleanup in the whole codebase:

- **The effect** sets a timeout that auto-dismisses after 3s.
- **The cleanup** clears that timeout.

Why does cleanup matter here? Two scenarios:

1. **The user dismisses manually before 3s** → `onClose` runs → parent sets `toast` to `null` → Toast unmounts → cleanup runs → timeout cleared. Without cleanup, the timeout would fire 3s later and call `onClose` on a parent that may have moved on, potentially clearing a *different* toast.
2. **The parent shows a new toast before the first one expires** → React unmounts the old Toast and mounts a new one (because the message prop changed). Cleanup of the old timer runs, new timer starts fresh for the new message. No timer leak.

Three lines of code, two real bugs prevented. That's the value of `useEffect` cleanup.

The dashboard uses this in two places:

- Error path of `fetchTasks` — `setToast({ message: "Failed to load…", type: "error" })`
- Success path of the modal's `onUpdated` — `setToast({ message: "Task updated.", type: "success" })`

The `type` prop selects the CSS class (success = green, error = red), which uses the alert tokens from the theme system for proper light/dark behavior.

---

## 11. The three-state UI machine

Every data screen in this app has three rendering states. The dashboard makes them explicit:

### State 1 — Initial loading (no data yet)

```319:325:frontend/src/pages/Dashboard/DashboardPage.jsx
  if (loading && tasks.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading your dashboard...</div>
      </div>
    );
  }
```

Notice the condition: `loading && tasks.length === 0`. Not just `loading`. This matters because **on a manual refresh, `loading` is true but `tasks` already has data from before**. We want to keep showing the old data and just disable the Refresh button — not blank the whole screen.

### State 2 — Empty (loaded, but nothing to show)

```327:344:frontend/src/pages/Dashboard/DashboardPage.jsx
  if (!loading && tasks.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{greeting}, {firstName}</h1>
            <p className={styles.subtitle}>{formatLongDate(new Date())}</p>
          </div>
        </div>
        <div className={styles.emptyState}>
          <h2>No tasks assigned to you yet</h2>
          <p>Once tasks are assigned to you, they'll show up here with charts and insights.</p>
          <a href="/tasks" className={styles.emptyLink}>Browse all tasks →</a>
        </div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    );
  }
```

The empty state is **a UI screen, not a missing UI**. It explains why the user is seeing nothing, and points them somewhere productive. New users should never see a blank dashboard and wonder if something is broken.

### State 3 — Hydrated (the main view)

Everything from line 346 onward. This is what you've been reading about.

These three branches are mutually exclusive and exhaustive — every render falls into exactly one. When you're building a data screen, draw this same three-state diagram first. You'll never forget the empty state again.

---

## 12. A quick word on performance

For a screen this dense, React's render performance matters. The dashboard is structured to be cheap by default:

| Optimization | Where | Why |
| --- | --- | --- |
| `useCallback` on `fetchTasks` | Line 172 | Stable reference for the `useEffect` dep array |
| `useMemo` on every aggregation | Lines 194, 217, 230, 242, 252, 267, 284, 310 | Avoids re-computing on theme toggle, modal open/close, refresh button hover |
| `useMemo` on `chartColors` | Line 153 | Recharts re-mounts on prop reference change — keep it stable |
| Memoization keyed on minimal deps | Each `[tasks]` or `[theme]` | Don't add `user` or `loading` as deps — they'd invalidate the cache for irrelevant reasons |
| Single API call instead of seven | Line 176 | Fewer round trips, smaller backend load, simpler error handling |
| Conditional render of modal | Line 538 | Modal only exists in the tree when needed; mount/unmount = clean state |

Two things we **don't** do (and you shouldn't either, until profiling tells you to):

- **`React.memo` on `KpiCard`/`ChartCard`** — they're cheap to re-render and the parent re-renders only when meaningful state changes anyway.
- **Virtualizing the deadline list** — capped at 7 items, so virtualization would be over-engineering.

Premature optimization is real. The current setup hits the right balance for a few-hundred-task workload. If we ever profile and see a bottleneck, that'll be the time to add another layer.

---

## 13. The CSS architecture (what makes the visuals work)

The dashboard uses [DashboardPage.module.css](../frontend/src/pages/Dashboard/DashboardPage.module.css) — 450 lines of CSS Module.

Three patterns are at work:

### Page gradient using theme tokens

```5:11:frontend/src/pages/Dashboard/DashboardPage.module.css
  background: linear-gradient(
    180deg,
    var(--color-page-gradient-from) 0%,
    var(--color-page-gradient-to) 100%
  );
```

In light mode this is a subtle slate-to-slate fade that adds depth. In dark mode it's a navy-to-deeper-navy fade. The component code doesn't care — the tokens shift per theme.

### Card pattern, used five times

```91:97:frontend/src/pages/Dashboard/DashboardPage.module.css
.kpiCard {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.125rem 1.25rem;
  background: var(--color-surface);
```

Same pattern in `.chartCard`, `.deadlineRow`, `.emptyState`. **Surface + border-soft + border-radius + shadow-md.** Once your eye learns this combo, the whole UI feels coherent.

### Status-driven modifier classes

```322:355:frontend/src/pages/Dashboard/DashboardPage.module.css
.deadlineNormal {
  background: var(--pill-normal-bg);
  color: var(--pill-normal-fg);
}

.deadlineSoon {
  background: var(--pill-soon-bg);
  color: var(--pill-soon-fg);
}

.deadlineToday {
  background: var(--pill-today-bg);
  color: var(--pill-today-fg);
}

.deadlineOverdue {
  background: var(--pill-overdue-bg);
  color: var(--pill-overdue-fg);
}
```

The `useMemo` picks a class name (`badgeClass = styles.deadlineSoon`) and the JSX simply concatenates it onto the element. **Decision logic in JS, presentation in CSS.** Each side does what it's good at.

---

## 14. The full lifecycle in one diagram

Putting everything from this chapter together:

```
1. App boots
       │
       ▼
2. <ProtectedRoute> waits for AuthContext to resolve user
       │
       ▼
3. DashboardPage mounts
       │
       ├──► useState() initializes tasks=[], loading=true, toast=null, viewTaskId=null
       │
       ├──► useAuth() returns { user }
       │
       ├──► useTheme() returns { theme }
       │
       ├──► useMemo([theme]) builds chartColors  ◄──┐ recomputes only on theme toggle
       │                                            │
       ├──► useCallback([userId]) builds fetchTasks │
       │                                            │
       └──► useEffect([fetchTasks]) calls fetchTasks()
                                       │
                                       ▼
4. tasksApi.listTasks(...)
       │
       ▼
5. axios client.get('/tasks?...')
       │
       ├─ request interceptor adds Bearer token
       │
       ▼
6. FastAPI /tasks endpoint
       │
       ├─ get_current_active_user dependency validates JWT
       │
       ▼
7. task_service.list_tasks() → MongoDB query
       │
       ▼
8. Response: { items: [...], total, page, page_size, total_pages }
       │
       ▼
9. setTasks(data.items), setLoading(false)
       │
       ▼ React re-renders
       │
10. useMemo aggregations all recompute (because tasks changed)
       │
       ├──► kpis             → KpiCard ×4
       ├──► statusData       → PieChart
       ├──► priorityData     → BarChart (vertical)
       ├──► sprintData       → BarChart (stacked)
       ├──► typeData         → RadialBarChart
       ├──► trendData        → AreaChart
       └──► upcomingDeadlines → list of <button>
       │
       ▼
11. User clicks a deadline row
       │
       ├──► setViewTaskId(task._id)
       │
       ▼
12. <ViewTaskModal taskId={...}> mounts
       │
       ├──► fetches GET /tasks/:id
       ├──► fetches GET /users
       ├──► user edits form
       ├──► clicks Save
       │
       ▼
13. tasksApi.updateTask(...)
       │
       ▼
14. modal calls onUpdated()
       │
       ├──► setViewTaskId(null) → modal unmounts
       ├──► setToast({ message: "Task updated.", type: "success" })
       └──► fetchTasks() ←── back to step 4, full refresh of all charts
```

This is the entire dashboard, end to end. If you can hold this diagram in your head, you understand React in this codebase well enough to add new features confidently.

---

## 15. Try it yourself

Pick one or two:

1. **Add a "This Week" filter** to the Completion Trend chart. Currently it shows the last 14 days. Add a toggle (use the `action` prop slot on `<ChartCard>`) that switches between 7-day and 14-day views. Hint: the `trendData` aggregation should accept a `windowDays` param via a `useMemo` re-key.

2. **Add an "Overdue" KPI card.** Count tasks where `due_date < startOfDay(now)` and `status !== "done"`. Use the red accent. The pattern matches the four existing KPIs exactly.

3. **Cache the dashboard data across remounts.** Right now if the user navigates away and back, the dashboard re-fetches. Lift `tasks` and `loading` into a `TasksContext` or a simple in-memory cache so the data persists. (Trade-off: staleness vs. responsiveness. Discuss.)

4. **Add a "Group by assignee" bar chart.** Count tasks per assignee (use `t.assignee_name`), bucket as "Me" vs "Others." Place it in a new sixth row. You'll need a new `useMemo`.

5. **Cancel in-flight requests on unmount.** Currently if the user opens the dashboard, navigates away mid-fetch, and the response arrives after unmount, React logs a warning about state updates on an unmounted component. Add an `AbortController` to `fetchTasks` and abort on cleanup. Hint: pass `{ signal: controller.signal }` to axios and use the same `let cancelled = false` pattern from `ViewTaskModal`.

---

## 16. Cheat sheet

| Concept | One-liner |
| --- | --- |
| **Architecture** | One API call, seven `useMemo`-derived views, dumb presentational widgets |
| **Auth seam** | `useAuth()` for `userId`, `useTheme()` for chart colors |
| **HTTP** | `tasksApi.listTasks()` → axios with auto JWT + auto refresh |
| **State** | Four `useState`s: `tasks`, `loading`, `toast`, `viewTaskId` |
| **Fetch pattern** | `useCallback` the fetch, `useEffect` to trigger, button to refresh manually |
| **Aggregations** | Every chart's data shape comes from a `useMemo([tasks])` |
| **Recharts shape** | `<ResponsiveContainer>` → `<ChartType>` → `<Series>` + axes + tooltip |
| **Theme-aware charts** | `useMemo` a palette object keyed on `theme`, pass values as props |
| **Reusable widget** | Container/content split — `<ChartCard>` knows the shell, `children` is the chart |
| **Drill-down** | List items are `<button>`s; click sets `viewTaskId`; modal mounts; onUpdated re-fetches |
| **Toast** | `useEffect` + `setTimeout` + cleanup = self-dismissing notification |
| **Three-state UI** | Initial loading, empty, hydrated — explicit early returns |
| **Race-condition guard** | `let cancelled = false; ... return () => { cancelled = true; }` in any effect that fetches |

---

## Files in this chapter

| File | Role |
| --- | --- |
| [`frontend/src/pages/Dashboard/DashboardPage.jsx`](../frontend/src/pages/Dashboard/DashboardPage.jsx) | The page itself — orchestrates everything |
| [`frontend/src/pages/Dashboard/DashboardPage.module.css`](../frontend/src/pages/Dashboard/DashboardPage.module.css) | Styles for the page and both widgets |
| [`frontend/src/pages/Dashboard/widgets/KpiCard.jsx`](../frontend/src/pages/Dashboard/widgets/KpiCard.jsx) | Reusable KPI tile |
| [`frontend/src/pages/Dashboard/widgets/ChartCard.jsx`](../frontend/src/pages/Dashboard/widgets/ChartCard.jsx) | Reusable card shell with title/subtitle/body |
| [`frontend/src/api/tasks.js`](../frontend/src/api/tasks.js) | `tasksApi` module |
| [`frontend/src/api/client.js`](../frontend/src/api/client.js) | Axios instance + auth interceptors |
| [`frontend/src/components/ViewTaskModal.jsx`](../frontend/src/components/ViewTaskModal.jsx) | Drill-down modal |
| [`frontend/src/components/Toast.jsx`](../frontend/src/components/Toast.jsx) | Auto-dismissing notification |
| [`frontend/src/hooks/useAuth.js`](../frontend/src/hooks/useAuth.js) | Reads from `AuthContext` |
| [`frontend/src/hooks/useTheme.js`](../frontend/src/hooks/useTheme.js) | Reads from `ThemeContext` |
| [`backend/app/routes/task.py`](../backend/app/routes/task.py) | `GET /tasks` endpoint |
| [`backend/app/models/task.py`](../backend/app/models/task.py) | `PaginatedTasks` / `TaskResponse` schemas |

---

## What's next

Now that you've seen end-to-end how data flows from MongoDB to a rendered chart, you have all the mental models for the rest of the app. Sprint Board (drag-and-drop), Tasks list (debounced search + pagination), and the modals all follow subsets of this same pattern.

→ Up next: **Chapter 11 — Routing & route guards (`react-router-dom`, `<Outlet/>`, `<ProtectedRoute/>`, `<GuestRoute/>`)**.
