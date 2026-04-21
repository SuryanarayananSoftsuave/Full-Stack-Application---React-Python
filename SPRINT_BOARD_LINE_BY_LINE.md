# Sprint Board — Line-by-Line Implementation Guide

This document explains every single file involved in the Sprint Kanban Board feature, from the backend API to each React component, the drag-and-drop system, and the CSS. Read it top-to-bottom to understand how the entire feature works.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Backend: `task_service.py` — `list_sprints`](#2-backend-task_servicepy--list_sprints)
3. [Backend: `task.py` — Route Order and Sprint Endpoint](#3-backend-taskpy--route-order-and-sprint-endpoint)
4. [Frontend API: `tasks.js` — `listSprints` Helper](#4-frontend-api-tasksjs--listsprints-helper)
5. [Component: `TaskCard.jsx` — The Draggable Card](#5-component-taskcardsjsx--the-draggable-card)
6. [Component: `KanbanColumn.jsx` — The Drop Zone](#6-component-kanbancolumnjsx--the-drop-zone)
7. [Component: `UserSwimLane.jsx` — Collapsible Row Per User](#7-component-userswimlanesjsx--collapsible-row-per-user)
8. [Page: `SprintBoardPage.jsx` — The Brain](#8-page-sprintboardpagejsx--the-brain)
9. [How Drag-and-Drop Works End-to-End](#9-how-drag-and-drop-works-end-to-end)
10. [CSS Breakdown](#10-css-breakdown)
11. [Common Gotchas and Debugging](#11-common-gotchas-and-debugging)

---

## 1. Architecture Overview

The Sprint Board is a **Kanban board** grouped by users (swim lanes), with 4 status columns per user. Here's the component tree:

```
SprintBoardPage
├── <DndContext>                    ← wraps everything, handles drag events
│   ├── UserSwimLane (Alice)        ← collapsible row
│   │   ├── KanbanColumn (todo)     ← droppable zone
│   │   │   ├── TaskCard            ← draggable card
│   │   │   └── TaskCard
│   │   ├── KanbanColumn (in_progress)
│   │   ├── KanbanColumn (in_review)
│   │   └── KanbanColumn (done)
│   ├── UserSwimLane (Bob)
│   └── UserSwimLane (Unassigned)
├── ViewTaskModal                   ← opens when you click a card
└── Toast                           ← success/error notifications
```

### Data flow summary

```
User picks a sprint
    ↓
GET /api/tasks?sprint=Sprint+4&page_size=200
    ↓
Backend filters tasks by sprint, returns up to 200
    ↓
Frontend groups tasks by assignee_id → one swim lane per user
    ↓
Each swim lane splits its tasks into 4 status buckets
    ↓
Each bucket renders TaskCards inside a droppable KanbanColumn
    ↓
User drags a card to a different column
    ↓
Optimistic update: local state changes instantly
    ↓
PATCH /api/tasks/{id} { status: "in_progress" }
    ↓
Success → keep the change  |  Failure → revert + show toast
```

---

## 2. Backend: `task_service.py` — `list_sprints`

**File:** `backend/app/services/task_service.py` (lines 152-154)

```python
async def list_sprints(db: AsyncIOMotorDatabase) -> list[str]:
    sprints = await db[COLLECTION].distinct("sprint")
    return sorted(s for s in sprints if s)
```

### Line-by-line

**`async def list_sprints(db: AsyncIOMotorDatabase) -> list[str]:`**

- Takes a database connection, returns a list of strings.
- `async` because MongoDB operations are I/O-bound — we don't want to block the event loop.

**`sprints = await db[COLLECTION].distinct("sprint")`**

- `db[COLLECTION]` gets the `"tasks"` collection (COLLECTION = "tasks" is defined at the top of the file).
- `.distinct("sprint")` is a MongoDB command that returns all **unique values** for the `sprint` field across every document in the collection. If you have 100 tasks and 5 of them say `sprint: "Sprint 4"`, this returns `"Sprint 4"` once.
- The raw result might look like: `["Sprint 1", "Sprint 4", None, "Sprint 2"]`

**`return sorted(s for s in sprints if s)`**

- **`s for s in sprints if s`** — this is a generator expression that filters out falsy values. `None` and `""` (empty string) are falsy, so tasks without a sprint are excluded. You don't want "None" appearing in the dropdown.
- **`sorted(...)`** — sorts alphabetically so the dropdown shows sprints in order: `["Sprint 1", "Sprint 2", "Sprint 4"]`.

### Why `distinct` instead of aggregation?

MongoDB's `distinct` is a single command — one round trip. The alternative would be an aggregation pipeline (`$group`), which is more powerful but overkill for "give me unique values of one field". `distinct` is simpler and faster for this use case.

---

## 3. Backend: `task.py` — Route Order and Sprint Endpoint

**File:** `backend/app/routes/task.py` (lines 66-75)

```python
@router.get(
    "/sprints/list",
    response_model=list[str],
    summary="List distinct sprint names",
)
async def get_sprints(
    _user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    return await task_service.list_sprints(db)
```

### Line-by-line

**`@router.get("/sprints/list", ...)`**

- Registers a GET endpoint at `/tasks/sprints/list` (the router already has `prefix="/tasks"`).
- `response_model=list[str]` tells FastAPI the response is a JSON array of strings. FastAPI auto-generates the correct OpenAPI schema and validates the output.

**`_user: UserInDB = Depends(get_current_active_user)`**

- The underscore prefix (`_user`) is a Python convention meaning "I don't use this variable". We still need the dependency to run — it validates the JWT token and rejects unauthenticated requests with 401. We just don't need the user object itself.

**`return await task_service.list_sprints(db)`**

- Delegates to the service function. FastAPI serializes the returned list to JSON automatically.

### Critical: Why this route is ABOVE `/{task_id}`

```python
@router.get("/sprints/list", ...)    # ← line 66 — matches first
...
@router.get("/{task_id}", ...)       # ← line 78 — matches second
```

FastAPI (and most web frameworks) matches routes **top to bottom**. If `/{task_id}` came first, a request to `/tasks/sprints/list` would match `{task_id}` as the string `"sprints"` — you'd get a 404 ("Task not found") because there's no task with `_id = "sprints"`.

By placing `/sprints/list` first, FastAPI tries it first, finds a match, and never reaches the `/{task_id}` route. **Order matters for parameterized routes.**

This is a common pattern in REST APIs — put specific routes before generic parameterized ones:

```
GET /tasks/sprints/list    ← specific, matches literal path
GET /tasks/{task_id}       ← generic, matches anything
```

---

## 4. Frontend API: `tasks.js` — `listSprints` Helper

**File:** `frontend/src/api/tasks.js` (lines 26-29)

```javascript
listSprints: async () => {
    const response = await client.get("/tasks/sprints/list");
    return response.data;
},
```

### Line-by-line

**`listSprints: async () => {`**

- No parameters needed — the backend returns ALL sprint names, no filtering.

**`const response = await client.get("/tasks/sprints/list");`**

- Uses the shared axios `client` instance from `client.js`. This means:
  1. The base URL `/api` is prepended automatically → actual URL is `/api/tasks/sprints/list`.
  2. The request interceptor attaches the `Authorization: Bearer <token>` header.
  3. If the token is expired, the response interceptor automatically refreshes it and retries.

**`return response.data;`**

- Axios wraps the HTTP response in an object with `{ data, status, headers, ... }`. We extract just `.data` — which is the JSON array of sprint names: `["Sprint 1", "Sprint 2", "Sprint 4"]`.

---

## 5. Component: `TaskCard.jsx` — The Draggable Card

**File:** `frontend/src/components/sprint/TaskCard.jsx`

This is the smallest component — a single card on the board that can be dragged.

### Lines 1-2: Imports

```javascript
import { useDraggable } from "@dnd-kit/core";
import styles from "./TaskCard.module.css";
```

- **`useDraggable`** — a React hook from @dnd-kit that makes an element draggable. It returns props and state that you spread onto your DOM element.
- **`styles`** — CSS Modules import. Every class name becomes a property on the `styles` object (e.g., `styles.card`, `styles.dragging`).

### Lines 4-15: Label mappings

```javascript
const PRIORITY_LABELS = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const TYPE_LABELS = {
  task: "Task",
  user_story: "User Story",
  bug: "Bug",
};
```

These map database enum values (lowercase, underscored) to display-friendly labels. The card shows "User Story" not "user_story".

### Lines 17-22: The `useDraggable` hook

```javascript
export function TaskCard({ task, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task._id,
      data: { status: task.status, assigneeId: task.assignee_id },
    });
```

**`id: task._id`**

- Every draggable needs a unique ID. We use the task's MongoDB `_id`. When a drag ends, `event.active.id` gives us this ID so we know WHICH task was dragged.

**`data: { status: task.status, assigneeId: task.assignee_id }`**

- Extra data attached to the draggable. This travels with the drag event. When `onDragEnd` fires in `SprintBoardPage`, we read `event.active.data.current.status` to know the task's ORIGINAL status (so we can detect if it actually changed), and `.assigneeId` to enforce the same-lane restriction.

**What the hook returns:**

| Return value | Purpose |
|---|---|
| `setNodeRef` | A React ref callback — attach to the DOM element you want to be draggable |
| `listeners` | Event handlers (onPointerDown, etc.) — spread onto the element |
| `attributes` | ARIA attributes for accessibility (role, tabIndex) |
| `transform` | `{ x, y }` pixel offset while dragging — used to visually move the card |
| `isDragging` | Boolean — true while this specific card is being dragged |

### Lines 24-29: Transform style

```javascript
const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        zIndex: 999,
      }
    : undefined;
```

- While dragging, @dnd-kit gives us `transform.x` and `transform.y` — how far the user has moved the pointer from where they started.
- We convert that to a CSS `translate()` so the card visually follows the cursor.
- `zIndex: 999` ensures the dragged card floats above everything else.
- When NOT dragging, `transform` is `null`, so `style` is `undefined` (no inline style applied).

### Lines 31-52: The rendered card

```javascript
return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.card} ${isDragging ? styles.dragging : ""}`}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!isDragging) onClick(task._id);
        e.stopPropagation();
      }}
    >
```

**`ref={setNodeRef}`** — tells @dnd-kit "this is the DOM element that's draggable".

**`{...listeners}`** — spreads `onPointerDown`, `onKeyDown`, etc. These are what @dnd-kit uses to detect when a drag starts.

**`{...attributes}`** — adds `role="button"`, `tabIndex={0}`, `aria-pressed`, etc. for screen readers.

**`onClick` handler:**
- **`if (!isDragging)`** — crucial. Without this check, releasing the mouse after a drag would ALSO fire `onClick`, opening the ViewTaskModal when you just wanted to move the card. We only open the modal on a genuine click (no drag).
- **`e.stopPropagation()`** — prevents the click from bubbling up to the column or lane.

**The card body** shows the title (clamped to 2 lines), a priority badge, and the task type.

---

## 6. Component: `KanbanColumn.jsx` — The Drop Zone

**File:** `frontend/src/components/sprint/KanbanColumn.jsx`

This is where cards land when dropped. Each column represents ONE status for ONE user.

### Lines 1-3: Imports

```javascript
import { useDroppable } from "@dnd-kit/core";
import { TaskCard } from "./TaskCard";
import styles from "./KanbanColumn.module.css";
```

- **`useDroppable`** — the counterpart to `useDraggable`. Makes a DOM element a valid drop target.

### Lines 5-17: Status configuration

```javascript
const STATUS_LABELS = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

const STATUS_COLORS = {
  todo: "#64748b",
  in_progress: "#2563eb",
  in_review: "#d97706",
  done: "#16a34a",
};
```

Each status gets a display label and a colored dot. The colors follow a convention: gray (todo), blue (active), amber (review), green (done).

### Lines 19-22: The `useDroppable` hook

```javascript
export function KanbanColumn({ userId, status, tasks, onTaskClick }) {
  const droppableId = `${userId}::${status}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
```

**`droppableId = \`${userId}::${status}\``**

This is **THE KEY to the entire drag-and-drop system**. Each droppable zone has a composite ID like:

```
"abcdda67-fc31-4ecc-9aeb-24faaf0a3355::in_progress"
 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^
 userId (who this lane belongs to)         status (which column)
```

Or for unassigned:

```
"__unassigned__::todo"
```

When a card is dropped, `SprintBoardPage` reads `event.over.id`, splits on `"::"`, and gets both the target userId AND the target status. This lets us:
1. Know the new status (for the PATCH call).
2. Check if the target lane matches the source lane (to block cross-lane drops).

**`isOver`** — boolean, true when a dragged card hovers over this column. We use it to highlight the column (purple background via `.over` class).

### Lines 24-48: The rendered column

```javascript
return (
    <div
      ref={setNodeRef}
      className={`${styles.column} ${isOver ? styles.over : ""}`}
    >
      <div className={styles.header}>
        <span className={styles.dot} style={{ background: STATUS_COLORS[status] }} />
        <span className={styles.label}>{STATUS_LABELS[status]}</span>
        <span className={styles.count}>{tasks.length}</span>
      </div>

      <div className={styles.cards}>
        {tasks.length === 0 ? (
          <div className={styles.empty}>No tasks</div>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task._id} task={task} onClick={onTaskClick} />
          ))
        )}
      </div>
    </div>
);
```

**`ref={setNodeRef}`** — registers this div as a drop target with @dnd-kit.

**`isOver ? styles.over : ""`** — adds a purple highlight class when a card is hovering over this column. Visual feedback is critical for drag-and-drop UX — users need to see WHERE they're about to drop.

**The header** shows the status name with a colored dot and a count badge.

**The cards area** either shows "No tasks" or maps the tasks array into `TaskCard` components. The `onTaskClick` prop is passed through so clicking a card bubbles up to `SprintBoardPage` to open the modal.

---

## 7. Component: `UserSwimLane.jsx` — Collapsible Row Per User

**File:** `frontend/src/components/sprint/UserSwimLane.jsx`

Each user gets one swim lane — a collapsible row containing 4 KanbanColumns.

### Lines 1-5: Imports and constants

```javascript
import { useState } from "react";
import { KanbanColumn } from "./KanbanColumn";
import styles from "./UserSwimLane.module.css";

const STATUSES = ["todo", "in_progress", "in_review", "done"];
```

**`STATUSES`** — defines the order of columns left to right. Changing this array reorders the entire board.

### Lines 7-14: Props and state

```javascript
export function UserSwimLane({
  userId,
  userName,
  tasks,
  onTaskClick,
  defaultOpen = true,
}) {
  const [open, setOpen] = useState(defaultOpen);
```

**Props received from SprintBoardPage:**
- `userId` — the user's `_id` (or `"__unassigned__"` for unassigned tasks). Passed to KanbanColumn to build the droppable ID.
- `userName` — display name for the header ("Alice", "Unassigned").
- `tasks` — ALL tasks for this user in this sprint (all statuses mixed together).
- `onTaskClick` — callback when a card is clicked (opens ViewTaskModal).
- `defaultOpen` — whether the lane starts expanded or collapsed.

**`const [open, setOpen] = useState(defaultOpen)`** — local state controls whether the columns are visible. Each lane manages its own collapsed state independently.

### Lines 16-19: Splitting tasks by status

```javascript
const tasksByStatus = {};
for (const s of STATUSES) {
    tasksByStatus[s] = tasks.filter((t) => t.status === s);
}
```

This takes the flat `tasks` array and creates an object like:

```javascript
{
  todo: [task1, task5],
  in_progress: [task3],
  in_review: [],
  done: [task2, task4, task6]
}
```

Each KanbanColumn then receives only its own tasks.

**Why filter here instead of in KanbanColumn?** Because the lane header shows the TOTAL task count across all statuses. If we pushed filtering into KanbanColumn, the lane wouldn't know the totals. Filtering at this level gives us both the per-status arrays and the total.

### Lines 21-50: The rendered lane

```javascript
return (
    <div className={styles.lane}>
      <button className={styles.laneHeader} onClick={() => setOpen((o) => !o)}>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>
          &#9656;
        </span>
        <span className={styles.name}>{userName}</span>
        <span className={styles.count}>
          {tasks.length} task{tasks.length !== 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        <div className={styles.columns}>
          {STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              userId={userId}
              status={status}
              tasks={tasksByStatus[status]}
              onTaskClick={onTaskClick}
            />
          ))}
        </div>
      )}
    </div>
);
```

**The header button:**
- **`&#9656;`** is the Unicode right-pointing triangle (▶). When `open` is true, CSS rotates it 90° to point downward (▼). This is a common expand/collapse icon pattern.
- **`tasks.length`** shows the total count. The `!== 1 ? "s" : ""` adds proper pluralization ("1 task" vs "3 tasks").

**`{open && (...)}`** — conditional rendering. When collapsed (`open = false`), React doesn't render the columns at all. This is better than `display: none` because:
1. The DOM stays clean — collapsed lanes have no droppable zones registered.
2. @dnd-kit doesn't waste time tracking hidden drop targets.
3. Performance is better with many lanes.

**The STATUSES loop** creates exactly 4 `KanbanColumn` components in the defined order: To Do → In Progress → In Review → Done.

---

## 8. Page: `SprintBoardPage.jsx` — The Brain

**File:** `frontend/src/pages/Tasks/SprintBoardPage.jsx`

This is the orchestrator — it owns all state, fetches data, handles drag events, and renders everything.

### Lines 1-13: Imports

```javascript
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import tasksApi from "../../api/tasks";
import usersApi from "../../api/users";
import { UserSwimLane } from "../../components/sprint/UserSwimLane";
import { ViewTaskModal } from "../../components/ViewTaskModal";
import { Toast } from "../../components/Toast";
import styles from "./SprintBoardPage.module.css";
```

**@dnd-kit imports:**
- **`DndContext`** — the React context provider that enables drag-and-drop. All draggable/droppable components MUST be inside it. It's like `BrowserRouter` for routing — without the wrapper, the hooks won't work.
- **`PointerSensor`** — detects drag gestures from mouse/touch pointer events. @dnd-kit has multiple sensors (keyboard, touch, pointer) — we use Pointer for mouse-based dragging.
- **`useSensor` / `useSensors`** — hooks to configure and compose sensors.

### Line 15: The unassigned sentinel

```javascript
const UNASSIGNED_KEY = "__unassigned__";
```

Tasks with `assignee_id: null` need a key for grouping. We can't use `null` as an object key (it becomes the string `"null"`, which could collide with other sentinel values). The dunder prefix (`__`) makes it clearly a system value that will never match a real user ID.

### Lines 17-25: State declarations

```javascript
export function SprintBoardPage() {
  const [sprints, setSprints] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedSprint, setSelectedSprint] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewTaskId, setViewTaskId] = useState(null);
  const [toast, setToast] = useState(null);
```

| State | Purpose | Initial value |
|---|---|---|
| `sprints` | List of sprint names for the dropdown | `[]` |
| `users` | List of users for the assignee filter + name resolution | `[]` |
| `selectedSprint` | Currently selected sprint | `""` (empty = none selected) |
| `assigneeFilter` | Currently selected user filter | `""` (empty = all users) |
| `tasks` | All tasks for the current sprint | `[]` |
| `loading` | Whether tasks are being fetched | `false` (not `true` — we don't fetch until a sprint is picked) |
| `viewTaskId` | Which task's modal is open | `null` (none) |
| `toast` | Current toast notification | `null` (none) |

### Lines 30-32: Sensor configuration

```javascript
const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
);
```

**`activationConstraint: { distance: 5 }`** — this is critical. It means: "don't start a drag until the pointer has moved at least 5 pixels from where it was pressed down."

Without this, EVERY mousedown on a card would immediately start a drag. The user could never click a card to open the ViewTaskModal — the click would be consumed by the drag system. The 5px threshold gives the pointer some "wiggle room" to distinguish:
- **Click** = press + release with < 5px movement → `onClick` fires → modal opens.
- **Drag** = press + move ≥ 5px → drag starts → `onDragEnd` fires when released.

### Lines 34-37: Initial data fetch

```javascript
useEffect(() => {
    tasksApi.listSprints().then(setSprints).catch(() => {});
    usersApi.listUsers().then(setUsers).catch(() => {});
}, []);
```

Runs once on mount (empty dependency array `[]`). Fetches sprint names and users in parallel. Errors are silently caught — the dropdowns just stay empty, which is a graceful degradation.

**Why fetch users here?** Two reasons:
1. The assignee filter dropdown needs user names.
2. The `lanes` memo needs a `userId → full_name` mapping to label swim lanes.

### Lines 39-52: `fetchTasks` — the main data loader

```javascript
const fetchTasks = useCallback(async (sprint, assigneeId) => {
    if (!sprint) return;
    setLoading(true);
    try {
      const filters = { sprint };
      if (assigneeId) filters.assignee_id = assigneeId;
      const data = await tasksApi.listTasks(1, 200, filters);
      setTasks(data.items);
    } catch {
      setToast({ message: "Failed to load tasks.", type: "error" });
    } finally {
      setLoading(false);
    }
}, []);
```

**`if (!sprint) return;`** — guard clause. Don't fetch if no sprint is selected.

**`tasksApi.listTasks(1, 200, filters)`** — fetches page 1 with up to 200 tasks, filtered by sprint (and optionally by assignee). The `page_size=200` is intentionally large because a Kanban board needs ALL tasks visible at once — pagination breaks the drag-and-drop mental model.

**`useCallback(..., [])`** — memoizes the function so it has a stable reference. Without this, the `useEffect` below that depends on `fetchTasks` would re-run on every render.

### Lines 54-56: Reactive fetching

```javascript
useEffect(() => {
    fetchTasks(selectedSprint, assigneeFilter);
}, [selectedSprint, assigneeFilter, fetchTasks]);
```

Whenever the sprint or assignee filter changes, re-fetch tasks. This is the same pattern used in the All Tasks page filters.

### Lines 59-87: The `lanes` memo — grouping tasks by user

```javascript
const lanes = useMemo(() => {
    const groups = {};

    for (const task of tasks) {
      const key = task.assignee_id || UNASSIGNED_KEY;
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    }

    const userMap = {};
    for (const u of users) userMap[u._id] = u.full_name;

    const result = [];
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === UNASSIGNED_KEY) return 1;
      if (b === UNASSIGNED_KEY) return -1;
      return (userMap[a] || a).localeCompare(userMap[b] || b);
    });

    for (const key of sortedKeys) {
      result.push({
        userId: key,
        userName: key === UNASSIGNED_KEY ? "Unassigned" : (userMap[key] || "Unknown User"),
        tasks: groups[key],
      });
    }
    return result;
}, [tasks, users]);
```

This is the **most complex piece of logic** in the feature. Let's break it down step by step.

**Step 1 — Group tasks by assignee:**

```javascript
const groups = {};
for (const task of tasks) {
    const key = task.assignee_id || UNASSIGNED_KEY;
    if (!groups[key]) groups[key] = [];
    groups[key].push(task);
}
```

After this loop, `groups` looks like:

```javascript
{
  "abcdda67-...": [task1, task3, task5],    // Alice's tasks
  "19ba3479-...": [task2],                  // Bob's tasks
  "__unassigned__": [task4, task6]           // No assignee
}
```

**`task.assignee_id || UNASSIGNED_KEY`** — if `assignee_id` is `null` or `undefined`, use the sentinel key.

**Step 2 — Build a user ID → name lookup:**

```javascript
const userMap = {};
for (const u of users) userMap[u._id] = u.full_name;
```

Result: `{ "abcdda67-...": "Surya Narayanan K", "19ba3479-...": "Surya Narayanan K" }`

**Step 3 — Sort keys: named users alphabetically, "Unassigned" last:**

```javascript
const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === UNASSIGNED_KEY) return 1;     // push to end
    if (b === UNASSIGNED_KEY) return -1;    // push to end
    return (userMap[a] || a).localeCompare(userMap[b] || b);
});
```

The sort comparator does 3 things:
1. If `a` is unassigned, sort it after `b` (return 1 = a comes second).
2. If `b` is unassigned, sort it after `a` (return -1 = a comes first).
3. Otherwise, compare by user name alphabetically.

**Step 4 — Build the final lane objects:**

```javascript
for (const key of sortedKeys) {
    result.push({
      userId: key,
      userName: key === UNASSIGNED_KEY ? "Unassigned" : (userMap[key] || "Unknown User"),
      tasks: groups[key],
    });
}
```

Each lane has a `userId`, `userName`, and `tasks`. The `userName` handles three cases:
- `UNASSIGNED_KEY` → "Unassigned"
- Valid user ID found in `userMap` → the user's full name
- Valid user ID NOT in `userMap` → "Unknown User" (defensive — could happen if a user was deleted)

**`useMemo([tasks, users])`** — this computation only re-runs when `tasks` or `users` change. Without `useMemo`, it would re-run on every render, doing O(n) work each time. With the memo, React caches the result and returns it instantly if the inputs haven't changed.

### Lines 89-113: The drag-and-drop handler

```javascript
const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id;
    const [targetUserId, newStatus] = over.id.split("::");
    const oldStatus = active.data.current.status;
    const draggedAssigneeId = active.data.current.assigneeId || UNASSIGNED_KEY;

    if (targetUserId !== draggedAssigneeId) return;
    if (oldStatus === newStatus) return;

    const snapshot = tasks;
    setTasks((prev) =>
      prev.map((t) => (t._id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      await tasksApi.updateTask(taskId, { status: newStatus });
    } catch {
      setTasks(snapshot);
      setToast({ type: "error", message: "Couldn't update task status." });
    }
};
```

This is the heart of the feature. Let's trace through a drag of task "Fix login bug" from "To Do" to "In Progress" in Alice's lane.

**`const { active, over } = event;`**

@dnd-kit provides:
- `active` — the dragged element. `active.id` = task's `_id`. `active.data.current` = the `data` object we passed to `useDraggable`.
- `over` — the drop target the pointer is over. `over.id` = the droppable's ID (e.g., `"abcdda67-...::in_progress"`).

**`if (!over) return;`**

If the user dropped the card outside any column (e.g., on the page background), `over` is null. Nothing to do.

**`const [targetUserId, newStatus] = over.id.split("::");`**

Splits `"abcdda67-...::in_progress"` into `["abcdda67-...", "in_progress"]`. Destructuring gives us both values.

**`if (targetUserId !== draggedAssigneeId) return;`**

**Cross-lane protection.** If Alice drags a card into Bob's column, we block it. The card returns to its original position. This prevents accidental reassignment — that's a separate action done through the modal.

**`if (oldStatus === newStatus) return;`**

Dropped back where it started — no-op. Don't waste an API call.

**The optimistic update pattern:**

```javascript
const snapshot = tasks;                    // 1. Save current state
setTasks(prev => prev.map(t =>             // 2. Immediately update UI
    t._id === taskId ? { ...t, status: newStatus } : t
));
try {
    await tasksApi.updateTask(...);         // 3. Send to server
} catch {
    setTasks(snapshot);                     // 4. Revert on failure
    setToast({ ... });                     // 5. Tell the user
}
```

**Why optimistic?** If we waited for the server response before moving the card, there'd be a 200-500ms delay where the card sits where it was dropped but hasn't moved yet. The user would think "did it work?". Optimistic updates make the UI feel instant — the card moves immediately, and we silently confirm with the server in the background.

**Why `const snapshot = tasks`?** We need the ORIGINAL tasks array to revert to if the API call fails. `prev` in `setTasks(prev => ...)` gives us the latest state at the time of the update, but we need the state from BEFORE the update. By capturing `tasks` before calling `setTasks`, we have a rollback point.

### Lines 115-119: Task updated from modal

```javascript
const handleTaskUpdated = () => {
    setViewTaskId(null);
    setToast({ message: "Task updated successfully!", type: "success" });
    fetchTasks(selectedSprint, assigneeFilter);
};
```

When a user edits a task through the ViewTaskModal (not via drag), we refetch the entire sprint. This is simpler than trying to merge the updated task into the local array — and covers cases like changing the sprint or assignee, which would move the task to a different lane or remove it entirely.

### Lines 121-198: The JSX

The render has 4 conditional branches:

1. **No sprint selected** → shows placeholder message.
2. **Loading** → shows "Loading...".
3. **No tasks in sprint** → shows empty state.
4. **Has tasks** → renders the DndContext and board.

```javascript
<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    <div className={styles.board}>
      {lanes.map((lane) => (
        <UserSwimLane
          key={lane.userId}
          userId={lane.userId}
          userName={lane.userName}
          tasks={lane.tasks}
          onTaskClick={(id) => setViewTaskId(id)}
        />
      ))}
    </div>
</DndContext>
```

**`<DndContext>`** wraps the entire board. It:
- Provides drag-and-drop context to all `useDraggable` and `useDroppable` hooks inside.
- Receives `sensors` to know how to detect drags.
- Receives `onDragEnd` to know what to do when a drag completes.

**`lanes.map(...)`** renders one `UserSwimLane` per user group. The `key={lane.userId}` ensures React can efficiently update lanes when tasks are added/removed.

**`onTaskClick={(id) => setViewTaskId(id)}`** — when a card is clicked, store its ID. The `{viewTaskId && <ViewTaskModal ... />}` below conditionally renders the modal.

---

## 9. How Drag-and-Drop Works End-to-End

Here's the complete chain from finger-down to database-updated:

```
1. User presses mouse on TaskCard
   └→ PointerSensor detects mousedown, but waits...

2. User moves mouse 5+ pixels
   └→ PointerSensor activates → drag starts
   └→ @dnd-kit sets `isDragging = true` on the card
   └→ `transform` starts updating with pointer position
   └→ Card visually follows the cursor (via CSS translate)

3. User hovers over a KanbanColumn
   └→ @dnd-kit detects overlap with a droppable zone
   └→ `isOver = true` on that KanbanColumn
   └→ Column turns purple (`.over` class)

4. User releases mouse
   └→ @dnd-kit fires `onDragEnd(event)`
   └→ `event.active.id` = task's _id
   └→ `event.over.id` = "userId::status" of the target column

5. handleDragEnd runs
   └→ Splits over.id to get targetUserId and newStatus
   └→ Checks: same lane? status changed?
   └→ Saves snapshot, optimistically updates tasks array
   └→ Card instantly appears in the new column

6. PATCH /api/tasks/{id} { status: "in_progress" }
   └→ Backend updates MongoDB
   └→ Success: nothing to do (UI already correct)
   └→ Failure: setTasks(snapshot) → card snaps back
```

### The ID encoding scheme

The entire drag system relies on how IDs are structured:

```
Draggable ID:  "task-uuid-here"
                └→ task._id (unique per task)

Droppable ID:  "user-uuid-here::in_progress"
                └→ userId + "::" + status
                   (unique per cell in the grid)
```

The `::` separator is arbitrary — we just need something that won't appear in a UUID or status string. We split on it in `handleDragEnd` to extract both pieces.

---

## 10. CSS Breakdown

### TaskCard.module.css — Card styling

```css
.card {
  cursor: grab;           /* hand icon when hovering */
  user-select: none;      /* prevent text selection while dragging */
  touch-action: none;     /* prevent browser scroll on touch devices during drag */
}

.dragging {
  opacity: 0.85;          /* slightly transparent so you can see what's behind */
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);   /* lifted shadow */
  cursor: grabbing;       /* closed hand while actively dragging */
}

.title {
  display: -webkit-box;
  -webkit-line-clamp: 2;          /* max 2 lines of text */
  -webkit-box-orient: vertical;
  overflow: hidden;                /* truncate with ellipsis */
}
```

Key decisions:
- **`touch-action: none`** — without this, mobile browsers intercept touch events for scrolling BEFORE @dnd-kit can process them. The drag would never start on touch devices.
- **`user-select: none`** — prevents the browser from highlighting card text when the user starts dragging. Without it, you'd see blue text selection during drags.

### KanbanColumn.module.css — Drop zone styling

```css
.column {
  flex: 1;             /* all 4 columns share equal width */
  min-width: 0;        /* allow shrinking below content width (prevents overflow) */
}

.over {
  background: #ede9fe; /* light purple highlight when a card hovers over */
}

.cards {
  min-height: 60px;    /* ensures the column has a droppable area even when empty */
}
```

**`min-height: 60px`** is crucial — without it, an empty column would be 0px tall, making it impossible to drop cards into an empty column. The user would have no target to aim for.

### UserSwimLane.module.css — Lane styling

```css
.chevron {
  transition: transform 0.2s;    /* smooth rotation animation */
  display: inline-block;         /* needed for transform to work on inline elements */
}

.chevronOpen {
  transform: rotate(90deg);      /* ▶ becomes ▼ when open */
}

.columns {
  display: flex;        /* 4 columns side by side */
  gap: 0.5rem;          /* spacing between columns */
}
```

### SprintBoardPage.module.css — Page layout

```css
.board {
  display: flex;
  flex-direction: column;   /* swim lanes stack vertically */
  gap: 0.75rem;             /* spacing between lanes */
}
```

The board is a vertical flexbox of swim lanes. Each swim lane is a horizontal flexbox of columns. This creates the grid layout without CSS Grid — simpler to reason about.

---

## 11. Common Gotchas and Debugging

### "Sprint dropdown is empty"

**Cause:** No tasks have a `sprint` field set, OR the backend hasn't restarted after adding the `/sprints/list` route.

**Check:** Open `http://localhost:8000/docs` and try `GET /tasks/sprints/list`. If it returns `[]`, you need to create tasks with sprint values.

### "Cards don't move when dropped"

**Possible causes:**
1. The card was dropped on a different user's lane (cross-lane drops are blocked).
2. The card was dropped on the same column it came from (no-op).
3. The PATCH call failed and the state was reverted — check the toast for an error.

**Debug:** Add `console.log(event.active.id, event.over?.id)` at the top of `handleDragEnd`.

### "Clicking a card starts a drag instead of opening the modal"

**Cause:** The `distance: 5` threshold in `PointerSensor` isn't working, or the user moved more than 5px between mousedown and mouseup.

**Fix:** Increase the distance threshold to `8` or `10`.

### "422 Unprocessable Entity when selecting a sprint"

**Cause:** The `page_size` limit. The backend's `list_tasks` route validates `page_size` with `le=200`. If the frontend sends a larger value, FastAPI rejects it.

**Check:** Verify `le=200` in `backend/app/routes/task.py` line 39.

### "Tasks from other sprints appear on the board"

**Cause:** The sprint filter isn't being sent. Check the network tab — the request should include `?sprint=Sprint+4`.

### "Dragging feels laggy"

**Cause:** The `transform` style uses inline styles, which is intentional (CSS transitions on `transform` would conflict with real-time drag position updates). If the board has 100+ cards, React re-renders may become expensive.

**Fix:** For very large boards, consider `@dnd-kit/sortable` with virtualization, or reduce `page_size`.
