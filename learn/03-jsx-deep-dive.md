# Chapter 3 — JSX Deep Dive

> **What you'll learn**
> - Embedding any JavaScript expression with `{...}`
> - Three ways to do conditionals: `&&`, ternary `? :`, and early returns
> - Rendering lists with `.map()` and the all-important **`key` prop**
> - Fragments (`<> </>`) and when you actually need them
> - Inline styles (`style={{...}}`) vs `className`
> - Event handlers and the inline-arrow-function pattern
> - JSX whitespace, comments, and the gotchas that bite every beginner

This chapter is a tour of every JSX pattern you'll meet daily, every one of them grounded in real code from [frontend/src/pages/Tasks/TasksList.jsx](../frontend/src/pages/Tasks/TasksList.jsx). Pop that file open in another tab — we're going to dissect it.

---

## 1. The single most important JSX rule

Inside JSX, everything between `{` and `}` is a **JavaScript expression**. Not a statement. An *expression* — something that produces a value.

That means these all work:

```jsx
<p>{2 + 2}</p>                          {/* renders "4" */}
<p>{user.name.toUpperCase()}</p>        {/* renders the upper-cased name */}
<p>{tasks.length === 0 ? "Empty" : ""}</p>
<button onClick={() => doStuff()}>Hi</button>
```

These do **not** work:

```jsx
<p>{ if (loading) return "wait" }</p>     {/* if is a statement, not an expression */}
<p>{ for (...) {...} }</p>                {/* for is a statement */}
<p>{ const x = 5 }</p>                    {/* declarations are statements */}
```

When you want logic, you have to express it with **expressions**: ternaries, `&&`, function calls, `.map()`, etc. We'll cover them all.

If something feels like it shouldn't be allowed in `{}`, hoist it out — compute it above the `return` and just reference the variable inside the JSX.

---

## 2. Templating values into the markup

You've already seen `{label}` and `{value}` in Chapter 2. Two real-world variations from [TasksList.jsx](../frontend/src/pages/Tasks/TasksList.jsx):

### a. Mixing text and expressions

Look at the subtitle:

```344:344:frontend/src/pages/Tasks/TasksList.jsx
          <p className={styles.subtitle}>{total} task{total !== 1 ? "s" : ""} total</p>
```

Read it carefully. The `<p>` contains:

- `{total}` — the number, e.g. `5`
- the literal text `task`
- `{total !== 1 ? "s" : ""}` — adds the letter "s" if total isn't 1
- the literal text ` total`

So you get `5 tasks total`, `1 task total`, `0 tasks total`. **Pluralizing without a library** is just a tiny ternary inside the JSX.

> **Whitespace tip:** the space between `{total}` and `task` is a real space character in the JSX source. JSX preserves spaces inside text but is very strict — newlines between sibling text nodes get collapsed in surprising ways. If you see weird spacing, look at the source for stray newlines.

### b. Lookup tables

This pattern is used over and over:

```235:235:frontend/src/pages/Tasks/TasksList.jsx
            {STATUS_LABELS[task.status] || task.status}
```

Translation: "look up the friendly label for this status; if nothing matches, fall back to the raw value." A safer, prettier display than printing `in_progress` directly.

`STATUS_LABELS` is the map defined at the top of the file:

```10:15:frontend/src/pages/Tasks/TasksList.jsx
const STATUS_LABELS = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};
```

Same trick with `PRIORITY_LABELS` (line 18) and `TYPE_LABELS` (line 25). **Move enums and labels into a `const` object** and look them up in the JSX. Easier than scattering ternaries everywhere.

---

## 3. Conditional rendering — the three patterns

You'll use these constantly. Pick the right one for each situation.

### Pattern A — `&&` short-circuit (zero or one element)

```jsx
{condition && <SomeElement />}
```

If `condition` is truthy, render the element. If not, render nothing.

Real example:

```244:244:frontend/src/pages/Tasks/TasksList.jsx
      {task.description && <p className={styles.cardDesc}>{task.description}</p>}
```

"Render the description paragraph **only if** there is a description." If `task.description` is `""` or `undefined`, `&&` short-circuits to that falsy value, and React skips it.

> **Watch out for `0`.** `{count && <Badge />}` will render the literal **`0`** when `count` is `0` (because `0` is falsy but still a valid React child). Use `{count > 0 && <Badge />}` or a ternary instead. We'll see this trap again in Chapter 4.

A more elaborate example with multiple conditions chained:

```438:448:frontend/src/pages/Tasks/TasksList.jsx
      {groupBy === "none" && totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className={styles.pageInfo}>Page {page} of {totalPages}</span>
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
```

Read it as: "**only when** we're not grouping AND there's more than one page, render the whole pagination block." Each `&&` adds another required condition. The whole multi-line JSX block is the right operand.

### Pattern B — Ternary `cond ? A : B` (one of two elements)

When you have two alternatives, use a ternary.

Two flavors of empty state:

```299:313:frontend/src/pages/Tasks/TasksList.jsx
          {hasFilters ? (
            <>
              <p className={styles.emptyTitle}>No tasks match your filters</p>
              <p className={styles.emptyDesc}>Try adjusting or clearing the filters above.</p>
            </>
          ) : (
            <>
              <p className={styles.emptyTitle}>No tasks yet</p>
              <p className={styles.emptyDesc}>
                {lockedAssigneeId
                  ? "You don't have any tasks assigned to you."
                  : "Click \"+ Create Task\" to add your first task."}
              </p>
            </>
          )}
```

Two ternaries here:

1. **Outer:** `hasFilters ? ... : ...` — if filters are active, show one message; otherwise show another.
2. **Inner:** `lockedAssigneeId ? "..." : "..."` — pick the wording based on whether we're on the "My Tasks" page or "All Tasks".

Notice how each branch is wrapped in a Fragment `<>...</>` because each side returns *two* `<p>` tags. We'll formalize Fragments in section 5.

A simpler ternary: choosing between list and grid view:

```272:292:frontend/src/pages/Tasks/TasksList.jsx
  const renderItems = (items) =>
    viewMode === "grid" ? (
      <div className={styles.cardGrid}>{items.map(renderCard)}</div>
    ) : (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          ...
        </table>
      </div>
    );
```

If `viewMode === "grid"`, render the card grid; otherwise render the table. Same idea, applied to the entire UI shape.

### Pattern C — Early `return` (whole component changes shape)

When the UI is *fundamentally different* in different states, don't try to cram it into one JSX expression. Just return early:

```294:336:frontend/src/pages/Tasks/TasksList.jsx
  const renderContent = () => {
    if (loading) return <div className={styles.empty}>Loading...</div>;
    if (tasks.length === 0)
      return (
        <div className={styles.empty}>
          ...
        </div>
      );

    if (grouped) {
      return grouped.map((g) => (
        <GroupSection ...>
          {renderItems(g.items)}
        </GroupSection>
      ));
    }

    return renderItems(tasks);
  };
```

Four possible shapes — loading spinner, empty state, grouped sections, or flat list — handled by four separate `return`s. Way more readable than nested ternaries inside one giant JSX expression.

> **Rule of thumb:**
> - One element or nothing → `&&`
> - One of two alternatives → `?:`
> - Many shapes / lots of logic → early `return`

---

## 4. Lists with `.map()` and the `key` prop

Rendering N items from an array is the bread and butter of any UI. The pattern is always the same: call `.map()` on the array and return a JSX element for each item.

### The simplest example

The "Group by" toolbar buttons:

```415:430:frontend/src/pages/Tasks/TasksList.jsx
          <div className={styles.groupToggle}>
            {[
              ["none", "None"],
              ["status", "Status"],
              ["priority", "Priority"],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={`${styles.groupBtn} ${groupBy === val ? styles.groupBtnActive : ""}`}
                onClick={() => setGroupBy(val)}
              >
                {label}
              </button>
            ))}
          </div>
```

Several things to notice:

1. **The array is inline.** You don't need to declare it elsewhere if it's static — just put it right where you `.map()`.
2. **Destructuring in the map callback.** Each item is `[val, label]`, and the arrow function destructures it into `val` and `label`.
3. **One `<button>` per item.** That's the JSX you return.
4. **`key={val}`** — the magic prop you must always include. More on this below.
5. **Active styling driven by state.** `groupBy === val ? styles.groupBtnActive : ""` highlights the currently selected button.
6. **Closure captures `val`.** The `onClick={() => setGroupBy(val)}` works because each iteration creates a fresh function that "remembers" its own `val`.

### Mapping over an object

Sometimes the data is an object, not an array. Use `Object.entries()`:

```381:384:frontend/src/pages/Tasks/TasksList.jsx
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={styles.filterSelect}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
```

`Object.entries(STATUS_LABELS)` returns `[["todo", "To Do"], ["in_progress", "In Progress"], ...]`. Then we destructure `[k, v]` and emit a `<option>` for each.

Notice the `<option value="">All statuses</option>` sitting **before** the mapped options — you can mix static and mapped children freely. JSX doesn't care.

### Mapping with a chained `.filter()`

You can chain array methods. The Type filter excludes types that should be hidden:

```392:394:frontend/src/pages/Tasks/TasksList.jsx
              {Object.entries(TYPE_LABELS)
                .filter(([k]) => !excludeTypeFilter?.split(",").includes(k))
                .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
```

Filter first, then map. Standard JavaScript — JSX doesn't add anything new here.

### Mapping data from props or state

The assignee dropdown lists every user fetched from the API:

```401:403:frontend/src/pages/Tasks/TasksList.jsx
              {users.map((u) => (
                <option key={u._id} value={u._id}>{u.full_name}</option>
              ))}
```

`users` came from `useState([])` and was filled by an API call. Whenever it changes, React re-runs the component, and the `.map()` produces new `<option>` elements.

### What is a `key` and why does React shout when you forget it?

When you render a list and later something changes (one item removed, one added, one reordered), React needs to figure out **which DOM elements correspond to which array items**. Without help, it would just go index-by-index — which is fast but wrong when items move around.

A `key` is a stable, unique identifier per item. It tells React: "this element corresponds to *this* item, no matter where it is in the array."

```jsx
{tasks.map((task) => (
  <Row key={task._id} task={task} />
))}
```

Rules for keys:

- **Must be unique among siblings** (not globally unique).
- **Must be stable across renders** — don't use `Math.random()` or `Date.now()`. Each render would generate a new key, defeating the whole point.
- **Should not be the array index** if the list can reorder, filter, or have items inserted in the middle. (Index works for static lists that never change, but it's a habit not worth forming.)

The right key for our task list is `task._id` — an immutable database ID:

```231:231:frontend/src/pages/Tasks/TasksList.jsx
    <div key={task._id} className={styles.card} onClick={() => setViewTaskId(task._id)}>
```

```253:253:frontend/src/pages/Tasks/TasksList.jsx
    <tr key={task._id} className={styles.clickableRow} onClick={() => setViewTaskId(task._id)}>
```

> **What happens without `key`?** React still renders, but you'll see a warning in the console (`Warning: Each child in a list should have a unique "key" prop`). Worse, when items reorder, things like input focus and CSS animations behave wrong because React reuses the wrong DOM nodes.

### Why `key` goes on the *outer* element returned from `map`

The `key` belongs on whatever element is the *direct child* of the array. If you wrap the row in a Fragment, the Fragment needs the key:

```jsx
{tasks.map((task) => (
  <React.Fragment key={task._id}>
    <Row task={task} />
    <Divider />
  </React.Fragment>
))}
```

(Note: the shorthand `<>...</>` cannot take a `key`. If you need a keyed Fragment, use the long form `<React.Fragment key={...}>`.)

---

## 5. Fragments — `<>...</>`

JSX requires a single root element per return. But sometimes you genuinely have several siblings and adding a wrapper `<div>` would mess up the layout (especially in tables, flex layouts, or grids).

That's what Fragments are for. They group children **without producing a real DOM element**.

The empty-state ternary again:

```299:313:frontend/src/pages/Tasks/TasksList.jsx
          {hasFilters ? (
            <>
              <p className={styles.emptyTitle}>No tasks match your filters</p>
              <p className={styles.emptyDesc}>Try adjusting or clearing the filters above.</p>
            </>
          ) : (
            <>
              <p className={styles.emptyTitle}>No tasks yet</p>
              <p className={styles.emptyDesc}>
                ...
              </p>
            </>
          )}
```

Each branch of the ternary returns *two paragraphs*. Without `<>...</>`, you'd be stuck because a ternary branch is a single expression, not multiple. Fragments let you group them in JSX without inserting a meaningless `<div>` into the page.

When inspected in DevTools, the rendered HTML is just the two `<p>` tags side by side. The `<>` produces nothing.

**Two ways to write a Fragment:**

| Form | Use when |
| --- | --- |
| `<>...</>` | Almost always. Shorter. |
| `<React.Fragment>...</React.Fragment>` | When you need to put `key={...}` on it (e.g., inside `.map()`). |

---

## 6. Dynamic class names — patterns you'll repeat forever

In Chapter 2 you saw template literals for `className`. Let's catalog the patterns from this file.

### Pattern 1 — base class + conditional modifier

```350:350:frontend/src/pages/Tasks/TasksList.jsx
              className={`${styles.viewBtn} ${viewMode === "list" ? styles.viewBtnActive : ""}`}
```

Read it as: "always apply `viewBtn`; **also** apply `viewBtnActive` if this is the active view."

The empty string `""` in the false branch is important — it prevents the literal text `"undefined"` from being baked into the class string.

### Pattern 2 — base + dynamic lookup

```234:234:frontend/src/pages/Tasks/TasksList.jsx
          <span className={`${styles.badge} ${styles[`status_${task.status}`]}`}>
```

A status of `"in_progress"` produces `styles["status_in_progress"]`, which is the hashed CSS Modules class name for the `.status_in_progress` rule. Same trick we used in `KpiCard` for the `accent_blue` / `accent_red` variants.

### Pattern 3 — multiple flags joined by template literal

```206:206:frontend/src/pages/Tasks/TasksList.jsx
          <button type="button" className={`${styles.actionItem} ${styles.actionDanger}`} onClick={(e) => handleDelete(e, taskId)}>
```

Two static classes joined together. (You could use a library like `clsx` for fancier composition, but plain template literals are fine for most cases.)

---

## 7. Inline styles vs `className`

JSX supports `style={{...}}` for one-off styling. **Notice the double braces** — the outer `{}` is "this is a JS expression", and the inner `{}` is the JS object literal.

A real example:

```286:286:frontend/src/pages/Tasks/TasksList.jsx
              <th style={{ width: 48 }} />
```

Two important things:

1. **Properties are camelCase, not kebab-case.** `backgroundColor`, not `background-color`. `marginTop`, not `margin-top`. Because they're JS object keys, dashes aren't allowed.
2. **Numbers are auto-pixelized.** `width: 48` becomes `width: 48px`. (For unitless properties like `lineHeight` or `flex`, the number stays as-is.)

When to use which:

| Use `className` (CSS Modules) | Use inline `style` |
| --- | --- |
| Most styling | Truly one-off values |
| Anything you want to reuse | Values computed from props/state |
| Pseudo-classes (`:hover`, `:focus`) | Quick prototypes |
| Media queries | n/a (inline can't do these) |

Inline `style` cannot do `:hover`, media queries, or animations. For those you need real CSS in a `.module.css` file. **Default to className.** Reach for inline styles only when something must be computed in JS.

---

## 8. Event handlers and the inline arrow function

You've seen `onClick={() => setViewMode("list")}` everywhere. Let's understand it.

`onClick` (note the camelCase) takes a function. When the user clicks, React calls that function with a synthetic event object.

Three flavors you'll encounter:

### a. Inline arrow that calls something with arguments

```351:351:frontend/src/pages/Tasks/TasksList.jsx
              onClick={() => setViewMode("list")}
```

Most common. The arrow function exists so that we can pass arguments without invoking immediately.

> **Common bug:** `onClick={setViewMode("list")}` — without the arrow — would **call** `setViewMode("list")` *immediately during render* and pass its return value (undefined) to `onClick`. The button would seem to "click itself" on load. The arrow is what makes it lazy.

### b. Inline arrow that uses the event object

```378:378:frontend/src/pages/Tasks/TasksList.jsx
            onChange={(e) => setTitleSearch(e.target.value)}
```

`e` is the React synthetic event. `e.target` is the input DOM element. `e.target.value` is the current value of the input. We pipe it straight into state.

You'll see this exact pattern on every form input.

### c. Reference to a separately-defined handler

When the logic is more than one line, define the handler outside the JSX:

```145:151:frontend/src/pages/Tasks/TasksList.jsx
  const clearFilters = () => {
    setTitleSearch("");
    setStatusFilter("");
    setPriorityFilter("");
    setTypeFilter("");
    setAssigneeFilter("");
  };
```

```407:407:frontend/src/pages/Tasks/TasksList.jsx
            <button type="button" className={styles.clearBtn} onClick={clearFilters}>
```

Note: just `onClick={clearFilters}` — no parentheses, no arrow. We're passing the function itself, not calling it.

Whether to inline the arrow or extract a named handler is a judgment call. If the logic is one expression, inline it. If it's three lines or more, extract.

---

## 9. JSX comments and other little things

### Comments

```340:340:frontend/src/pages/Tasks/TasksList.jsx
      {/* Header */}
```

Inside JSX, comments must live in a `{ }` block as a JS comment: `{/* like this */}`. You can't use `<!-- HTML comments -->` — they'd get rendered as text.

### Self-closing tags

Every void element must close itself:

```jsx
<input type="text" />
<br />
<img src="..." />
<th style={{ width: 48 }} />
```

Forgetting the `/` in JSX is a syntax error, not a warning.

### `style={{...}}` recap

The double braces aren't a typo. Outer `{}` = "JS expression"; inner `{}` = "JS object literal".

### `className`, not `class`

Already covered, worth repeating because you'll forget at least once.

### Events are camelCase

`onClick`, not `onclick`. `onChange`, not `onchange`. `onMouseEnter`, not `onmouseenter`.

### Boolean attributes

```440:440:frontend/src/pages/Tasks/TasksList.jsx
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
```

`disabled={page <= 1}` — if the expression is true, the attribute is applied; if false, it's omitted. You can also write the shorthand `<input disabled />` (no value at all means `true`).

### `htmlFor`, not `for`

When you write `<label for="email">` in HTML, React JSX wants `<label htmlFor="email">`. Same reason as `className`: `for` is a reserved JS keyword.

---

## 10. Try it yourself

### Exercise 1 — Render a list

Imagine `users` is `[{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]`. Sketch (in your head or in a scratch file) a `<ul>` that renders one `<li>` per user with their name.

<details>
<summary>Solution</summary>

```jsx
<ul>
  {users.map((u) => (
    <li key={u.id}>{u.name}</li>
  ))}
</ul>
```

The `key={u.id}` is the part beginners forget.
</details>

### Exercise 2 — Spot the bug

What's wrong here?

```jsx
{tasks.length && <p>You have {tasks.length} tasks</p>}
```

<details>
<summary>Answer</summary>

When `tasks.length === 0`, the expression evaluates to `0`, and React **renders the literal `0` on the page**. To fix it, use a real boolean:

```jsx
{tasks.length > 0 && <p>You have {tasks.length} tasks</p>}
```

Or a ternary:

```jsx
{tasks.length === 0 ? null : <p>You have {tasks.length} tasks</p>}
```
</details>

### Exercise 3 — Refactor a nested ternary

Imagine you wrote:

```jsx
return loading
  ? <Spinner />
  : tasks.length === 0
  ? <Empty />
  : <List tasks={tasks} />;
```

Refactor it using early returns. Which version is easier to read?

<details>
<summary>Solution</summary>

```jsx
if (loading) return <Spinner />;
if (tasks.length === 0) return <Empty />;
return <List tasks={tasks} />;
```

Same logic, infinitely more readable. This is exactly what `renderContent` in `TasksList.jsx` does.
</details>

### Exercise 4 — Put `key` in the right place

Which of these is correct?

```jsx
// A
{users.map((u) => <div><Avatar key={u.id} user={u} /></div>)}

// B
{users.map((u) => <div key={u.id}><Avatar user={u} /></div>)}
```

<details>
<summary>Answer</summary>

**B is correct.** The `key` belongs on the element that's the *direct child of the map's return value*. In A, the wrapping `<div>` is what's repeated, so it needs the key — the inner `<Avatar>` is the wrong place.
</details>

---

## 11. Cheat sheet

| Need | Pattern |
| --- | --- |
| Inject a value | `<p>{value}</p>` |
| Render if truthy | `{cond && <X />}` |
| Render either / or | `{cond ? <A /> : <B />}` |
| Many shapes | Early `return` |
| List of N | `{items.map(item => <Row key={item.id} ... />)}` |
| Multiple siblings | Wrap in `<>...</>` (or `<React.Fragment>` for keyed) |
| Comment | `{/* like this */}` |
| Inline style | `style={{ marginTop: 8, color: "red" }}` |
| Class name | `className="foo"` (use `className`, not `class`) |
| Event | `onClick={() => doStuff()}` (camelCase, function not call) |
| Boolean attr | `disabled={isDisabled}` |
| `for` attribute on label | `htmlFor="..."` |
| Self-closing tag | `<input />` `<br />` |

---

## 12. What's next

You can now write any UI shape with JSX. The next missing piece is **data that changes over time** — what makes the UI actually interactive.

**Chapter 4** introduces `useState`, the hook that makes every input, toggle, modal, and counter possible. You'll see why `useState(0)` looks weird at first and clicks the moment you grasp it. We'll dissect:

- The login form ([frontend/src/pages/Login/LoginPage.jsx](../frontend/src/pages/Login/LoginPage.jsx))
- The "Create Task" modal's controlled inputs ([frontend/src/components/CreateTaskModal.jsx](../frontend/src/components/CreateTaskModal.jsx))
- The "functional update" form (`setCount(c => c + 1)`) and why it matters

When you're ready, ask for **Chapter 4 — `useState` and Controlled Inputs**.

You're past the syntax stage now. From here on, it's all about **behavior over time** — the heart of React.
