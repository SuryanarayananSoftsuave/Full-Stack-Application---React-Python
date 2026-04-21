# Frontend API Layer — Line by Line

This guide explains **every single line** of your frontend's API and auth code — what it does, why it exists, and what happens behind the scenes when it runs.

Files covered, in the order the browser actually uses them:

1. `frontend/src/api/client.js` — the shared HTTP client (axios instance + interceptors)
2. `frontend/src/api/auth.js` — auth endpoint wrappers
3. `frontend/src/api/tasks.js` — task endpoint wrappers
4. `frontend/src/api/users.js` — user endpoint wrappers
5. `frontend/src/context/AuthContext.jsx` — global auth state
6. `frontend/src/hooks/useAuth.js` — the consumer hook

---

## Background concepts you need first

Before we read code, here are the four building blocks the API layer is built on. If any of these are fuzzy, the rest won't click.

### 1. `axios`
A library for making HTTP requests from the browser. Think of it as a nicer version of the built-in `fetch`.
- You can create a "configured instance" so every request shares a base URL, headers, etc.
- It returns **Promises** — objects representing a future value (success or failure).

### 2. Promises and `async / await`
- A Promise is a placeholder: "I'll have a result later."
- `await` pauses the function until the Promise resolves and gives back the value.
- If the Promise *rejects* (fails), `await` **throws** an error — which is why we use `try / catch`.

### 3. Interceptors
Functions axios runs **automatically** on every request or response *before* your code sees them.
- A **request interceptor** can modify a request (e.g., add an Authorization header) before it's sent.
- A **response interceptor** can react to a response (e.g., a 401 error) before your code receives it.

### 4. `localStorage` vs httpOnly cookies
- **`localStorage`** — string storage in the browser. JavaScript can read it. We store the short-lived **access token** here.
- **httpOnly cookie** — a cookie the server sets with a flag that JavaScript **cannot** read. The browser still sends it on requests automatically. We store the long-lived **refresh token** there. This is safer because XSS attacks can't steal it.

Now let's read the code.

---

## 1. `frontend/src/api/client.js`

This is the most important file in the whole frontend. Every API call goes through it, so the rules you put here apply everywhere.

### Lines 1 — the import

```js
import axios from "axios";
```

We're loading the `axios` library from `node_modules` (installed earlier via `npm install axios`). The default export is an object with methods like `axios.get`, `axios.post`, and `axios.create`.

---

### Lines 3–9 — creating the configured client

```js
const client = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});
```

**Line 3:** `axios.create({...})` returns a brand-new axios instance. We assign it to `client` so we can import it everywhere. Why create an instance instead of using `axios` directly? Because the configuration we pass here applies to **every** request made through `client` — we don't want to repeat ourselves.

**Line 4:** `baseURL: "/api"`.
- Now when we write `client.get("/tasks")`, axios actually sends a request to `/api/tasks`.
- The leading `/api` is special: in development, your Vite dev server proxies any URL starting with `/api` to your FastAPI backend (usually `http://127.0.0.1:8000`). In production, your reverse proxy (e.g., nginx) does the same thing. So your code never has to know the backend's actual host or port.

**Line 5:** `headers: { "Content-Type": "application/json" }`.
- This tells the backend "the body I'm sending is JSON." FastAPI uses this header to know it should parse the body as JSON instead of form data.

**Line 6:** Inline comment explaining the next setting.

**Line 7–8:** `withCredentials: true`.
- This is the line that makes refresh tokens work. By default, the browser does **not** send cookies on cross-origin requests for safety. Setting `withCredentials: true` overrides that.
- It also tells the browser to **accept** `Set-Cookie` headers in cross-origin responses.
- The httpOnly `refresh_token` cookie that the backend sets at login would be useless without this flag.

**Line 9:** Closing `})` — end of the config object and the function call.

---

### Lines 11–21 — the request interceptor

```js
// ── Request interceptor ─────────────────────────────────────────────────────
// Reads the access token from localStorage and attaches it as a
// Bearer token on every outgoing request. This is the standard
// OAuth2 pattern that Swagger/OpenAPI docs expect.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

**Lines 11–14:** Just a comment block explaining intent.

**Line 15:** `client.interceptors.request.use((config) => { ... })`.
- `client.interceptors.request` is the request-side interceptor manager.
- `.use(fn)` registers a function that runs before every request.
- The function receives a `config` object describing the request that's about to be sent (URL, method, headers, body, etc.). Whatever it returns becomes the actual config used.

**Line 16:** `const token = localStorage.getItem("access_token");`.
- We read the access token from `localStorage`. Returns the string if it exists, or `null` if the key doesn't exist.
- Note: `localStorage` is **synchronous** — it blocks for a tiny moment, but for a single small string this is unnoticeable.

**Line 17:** `if (token) { ... }`.
- We only attach the header if a token actually exists. If the user isn't logged in yet (e.g., calling `/auth/register`), we just don't add an Authorization header.
- `null` is falsy in JavaScript, so this works for missing keys too.

**Line 18:** `config.headers.Authorization = \`Bearer ${token}\`;`.
- We set the `Authorization` HTTP header. The format `Bearer <token>` is the OAuth2 standard — this is what your FastAPI's `OAuth2PasswordBearer` dependency expects on the backend.
- Template literals (the backticks) let us interpolate the token value directly into the string.

**Line 19:** Closing brace for the `if`.

**Line 20:** `return config;`.
- **Critical**: you must return the (possibly modified) config. If you forget this, axios has no config to send and the request silently breaks.

**Line 21:** Closing `});` of the interceptor.

---

### Lines 23–28 — refresh coordination state

```js
// ── Refresh state ───────────────────────────────────────────────────────────
// Coordinates "refresh once, retry many": if 3 requests all get 401
// simultaneously, only 1 refresh call fires. The others wait in the
// queue and retry after the refresh succeeds.
let isRefreshing = false;
let failedQueue = [];
```

**Lines 23–26:** Comment explaining the problem we're solving.

**Why does this matter?** Imagine your dashboard fires three requests in parallel: `/tasks`, `/users`, and `/me`. The access token expired five minutes ago. Without coordination, all three would hit `/auth/refresh` at the same time — three refresh tokens used, three new access tokens issued, two of them immediately discarded. Worse, on some backends the refresh endpoint *invalidates* the previous refresh token, so two of them would fail and log the user out.

**Line 27:** `let isRefreshing = false;`.
- A module-level boolean acting as a lock. `true` means "a refresh is currently in progress."
- `let` (not `const`) because we'll mutate it.

**Line 28:** `let failedQueue = [];`.
- A list of requests that hit a 401 while a refresh was already running. They wait here for the refresh to finish, then retry.
- Each entry in the queue is an object holding `{ resolve, reject }` — Promise control functions, explained below.

---

### Lines 30–39 — the queue processor

```js
function processQueue(error) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  });
  failedQueue = [];
}
```

**Line 30:** A regular function declaration. It takes a single argument `error`. If `error` is truthy, the refresh failed; if it's `null`, the refresh succeeded.

**Line 31:** `failedQueue.forEach(({ resolve, reject }) => { ... })`.
- Loop over every queued request.
- The `({ resolve, reject })` syntax is **destructuring** — it pulls those two properties out of each queue entry into local variables.

**Lines 32–36:** For each waiter:
- If the refresh failed, call `reject(error)` — the waiter's Promise becomes a rejected one, and the `await` in the response interceptor throws.
- If the refresh succeeded, call `resolve()` — the waiter's Promise resolves and the request retries.

**Line 37:** Closing brace of `forEach`.

**Line 38:** `failedQueue = [];`.
- Clear the queue. We've notified everyone, so we don't want to notify them again next time.

**Line 39:** Closing brace of the function.

---

### Lines 41–43 — response interceptor: the success path

```js
// ── Response interceptor ────────────────────────────────────────────────────
client.interceptors.response.use(
  (response) => response,
```

**Line 41:** Comment.

**Line 42:** `client.interceptors.response.use(`.
- Same idea as the request interceptor, but for responses. It takes **two** arguments: a success handler and an error handler.

**Line 43:** `(response) => response,`.
- The success handler. We don't need to do anything special on success — just return the response unchanged so the calling code sees it normally.

---

### Lines 45–62 — response interceptor: deciding whether to refresh

```js
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
```

**Line 45:** `async (error) => { ... }`.
- The error handler. `async` because we'll `await` inside it. axios calls this whenever a response has a non-2xx status code.

**Line 46:** `const originalRequest = error.config;`.
- Every axios error carries the original request config. We keep a reference because if we refresh successfully, we want to retry **the same request** — same URL, same method, same body.

**Lines 48–49:** Comment explaining why we skip auth endpoints.

**Line 50:** `const url = originalRequest.url || "";`.
- Read the URL of the failed request. The `|| ""` is a safety fallback — if for some reason `url` is undefined, we use an empty string so `.includes` doesn't crash.

**Lines 51–54:** Build the `isAuthEndpoint` boolean.
- `url.includes("/auth/login")` returns `true` if the URL contains that substring.
- We OR three checks together. If any is true, this is an auth endpoint.
- Why exclude these? `/auth/login` returning 401 means "wrong password," not "expired token." Refreshing wouldn't help. `/auth/refresh` itself returning 401 means the refresh token is dead — refreshing again would just infinite-loop.

**Lines 56–60:** The "don't refresh" guard.
- `error.response?.status !== 401` → the failure wasn't a 401 at all (maybe 500, 400, or a network error with no response). The `?.` (optional chaining) prevents a crash if `error.response` is `undefined`.
- `originalRequest._retry` → a flag we set later to mark "we've already tried refreshing this once." Without this, a request that 401s after a refresh would try refreshing again forever.
- `isAuthEndpoint` → as explained above.
- If **any** of these are true, we give up: `return Promise.reject(error);` re-throws the error so the original caller sees it.

**Line 61:** `return Promise.reject(error);` — produces a rejected Promise so the `await` in the calling code throws.

**Line 62:** Closing brace of the if.

---

### Lines 64–68 — joining an in-progress refresh

```js
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => client(originalRequest));
    }
```

**Line 64:** `if (isRefreshing) { ... }`.
- Another refresh is already underway. Don't start a second one. Wait for the in-flight one to finish.

**Line 65:** `return new Promise((resolve, reject) => { ... })`.
- We create a **new** Promise and return it. The whole reason this works: axios will wait for whatever Promise we return. By giving it a Promise that doesn't resolve yet, we're putting this request into a holding pattern.

**Line 66:** `failedQueue.push({ resolve, reject });`.
- We capture this Promise's `resolve` and `reject` functions and stash them in the queue. Later, when the in-flight refresh finishes, `processQueue` will call our `resolve` (success) or `reject` (failure).

**Line 67:** `}).then(() => client(originalRequest));`.
- Once `resolve()` is called by `processQueue`, this `.then` runs.
- `client(originalRequest)` re-fires the original request — by now it has the new access token (the request interceptor reads it fresh from localStorage on every call).
- The retried request's response (or error) becomes the result of the whole chain. The original caller has been waiting this entire time and never knew anything happened.

**Line 68:** Closing brace.

---

### Lines 70–71 — taking the lock

```js
    originalRequest._retry = true;
    isRefreshing = true;
```

**Line 70:** `originalRequest._retry = true;`.
- Mark this request so the guard above (`originalRequest._retry`) bails out next time. Prevents infinite refresh loops if something goes weird.

**Line 71:** `isRefreshing = true;`.
- Take the lock. Any other 401 that happens from now until we release the lock will hit the `if (isRefreshing)` branch above and queue up.

---

### Lines 73–87 — the actual refresh call

```js
    try {
      // Use raw axios for the refresh call to avoid this interceptor
      // catching the refresh's own 401 (infinite loop prevention).
      // withCredentials sends the httpOnly refresh_token cookie.
      const { data } = await axios.post(
        "/api/auth/refresh",
        {},
        { withCredentials: true }
      );

      // Save the new access token from the response body.
      localStorage.setItem("access_token", data.access_token);

      processQueue(null);
      return client(originalRequest);
```

**Line 73:** `try { ... }` — start a try/catch so we can handle a refresh failure cleanly.

**Lines 74–76:** Comments explaining the next call.

**Lines 77–81:** The refresh request itself.
- We use **raw `axios.post`**, not `client.post`. Why? `client` has this very interceptor attached. If the refresh call itself returned 401 and went through `client`, this same handler would run again, try to refresh again, and we'd recurse forever. Raw axios bypasses our interceptors.
- First arg `"/api/auth/refresh"` — the full URL (we don't have a `baseURL` on raw axios).
- Second arg `{}` — empty body. Refresh doesn't need any data; the refresh token rides in the cookie.
- Third arg `{ withCredentials: true }` — this is **essential**. It tells the browser to include the httpOnly cookie. Without it, the backend has no refresh token to validate.
- `const { data } = await ...` — destructure the `data` field from the axios response. `data` is the JSON body the backend returned, which looks like `{ "access_token": "...", "token_type": "bearer" }`.

**Line 83:** Comment.

**Line 84:** `localStorage.setItem("access_token", data.access_token);`.
- Save the freshly minted access token. Now the next request the request interceptor sends will pick this up automatically.

**Line 86:** `processQueue(null);`.
- Notify all waiters that the refresh succeeded (`null` means "no error"). They'll each retry their original request.

**Line 87:** `return client(originalRequest);`.
- Retry **our own** original request with the new token. We return its Promise so the original caller's `await` resolves with the actual successful response. From their perspective, it's as if no error ever happened.

---

### Lines 88–100 — the refresh failed path and cleanup

```js
    } catch (refreshError) {
      processQueue(refreshError);

      // Session is dead -- clear stale token and redirect.
      localStorage.removeItem("access_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
```

**Line 88:** `} catch (refreshError) { ... }` — caught when the `await axios.post` rejects (refresh token expired/invalid, backend down, etc.).

**Line 89:** `processQueue(refreshError);`.
- Tell every waiter the refresh failed. Their `await` will throw the same error.

**Line 91:** Comment.

**Line 92:** `localStorage.removeItem("access_token");`.
- The token in localStorage is useless now. Remove it so we don't keep sending an invalid Authorization header.

**Line 93:** `if (window.location.pathname !== "/login") { ... }`.
- Only redirect if we're not already on `/login`. Prevents a redirect loop if the user is on the login page and somehow triggers this (shouldn't happen, but defensive).

**Line 94:** `window.location.href = "/login";`.
- Hard navigation to `/login`. We use `window.location.href` (not React Router's `navigate`) because this code lives outside React — there's no router context here. A hard navigation also fully resets React state, which is what we want when the session dies.

**Line 95–96:** Closing braces.

**Line 97:** `return Promise.reject(refreshError);`.
- Propagate the failure to the original caller too.

**Line 98:** `} finally { ... }`.
- `finally` runs whether the try succeeded or failed. The perfect place to release the lock.

**Line 99:** `isRefreshing = false;` — release the lock so future 401s can attempt a fresh refresh.

**Line 100–101–102:** Closing braces of `finally`, the error handler arrow function, and the `client.interceptors.response.use(` call.

---

### Line 104 — exporting

```js
export default client;
```

Make `client` the default export so other files can `import client from "./client"`. Default exports can be renamed on import, which is why every file just calls it `client`.

---

## 2. `frontend/src/api/auth.js`

This file is a thin layer of named functions on top of `client`. Each function corresponds to one backend endpoint. Two of them also touch `localStorage` as a side effect.

### Line 1

```js
import client from "./client";
```

Bring in the configured axios instance. Every function below will use it.

### Lines 3–4

```js
const authApi = {
  register: async (email, password, fullName, department = "") => {
```

**Line 3:** Start defining an object literal. We'll attach methods to it and export it as one bundle.

**Line 4:**
- `register:` — property name on the object.
- `async (email, password, fullName, department = "") =>` — an arrow function. `async` so we can `await` inside.
- `department = ""` — a default parameter. If the caller doesn't pass `department`, it defaults to an empty string (matches the backend's optional field).

### Lines 5–10

```js
    const response = await client.post("/auth/register", {
      email,
      password,
      full_name: fullName,
      department,
    });
```

**Line 5:** `client.post("/auth/register", { ... })`.
- POST request to `/api/auth/register` (because `baseURL` is `/api`).
- Second argument is the JSON body axios will serialize.
- `await` pauses until the server responds. If the server returns an error status, it throws.

**Lines 6–9:** The body object.
- `email,` is shorthand for `email: email`. Same for `password` and `department`.
- `full_name: fullName` renames the field — JavaScript convention is camelCase, but our backend Pydantic schema uses `full_name` snake_case. We translate at the boundary.

**Line 10:** `});` — close body and function call.

### Line 11–12

```js
    return response.data;
  },
```

**Line 11:** axios wraps every successful response in `{ data, status, headers, ... }`. The actual JSON body the backend sent is in `data`, so we return only that to keep the API ergonomic.

**Line 12:** `,` separates this method from the next in the object.

### Lines 14–25 — `login`

```js
  login: async (email, password) => {
    const response = await client.post("/auth/login", {
      email,
      password,
    });
    // Backend returns { access_token, token_type } in the body
    // and sets the refresh_token as an httpOnly cookie.
    // Save the access token to localStorage so the request
    // interceptor in client.js can attach it to future requests.
    localStorage.setItem("access_token", response.data.access_token);
    return response.data;
  },
```

**Line 14:** Define `login` taking just email and password.

**Lines 15–18:** POST `/auth/login` with the credentials.

- On the network: when the backend responds, the browser sees `Set-Cookie: refresh_token=...; HttpOnly` in the response headers. Because we have `withCredentials: true`, the browser stores that cookie automatically. JavaScript can never read it.

**Lines 19–22:** Comments.

**Line 23:** `localStorage.setItem("access_token", response.data.access_token);`.
- The crucial side effect: we manually persist the access token. From this moment on, the request interceptor in `client.js` will find it and attach `Authorization: Bearer ...` to every request.

**Line 24:** Return the data so callers can use it if they want.

### Lines 27–33 — `logout`

```js
  logout: async () => {
    const response = await client.post("/auth/logout");
    // Backend clears the httpOnly refresh_token cookie.
    // Clear the access token from localStorage on our side.
    localStorage.removeItem("access_token");
    return response.data;
  },
```

**Line 27:** Arrow function with no arguments.

**Line 28:** POST `/auth/logout`. The backend responds with `Set-Cookie: refresh_token=; Max-Age=0` which deletes the cookie from the browser.

**Lines 29–30:** Comments.

**Line 31:** Remove our access token from localStorage. Without this, even after logout the interceptor would keep attaching a (now-rejected) token to every request.

**Line 32:** Return the response data (typically just `{ message: "..." }`).

### Lines 35–38 — `getMe`

```js
  getMe: async () => {
    const response = await client.get("/auth/me");
    return response.data;
  },
```

**Line 35:** No arguments. Authentication is handled implicitly by the access token.

**Line 36:** GET `/auth/me`. The backend reads the `Authorization: Bearer <token>` header (attached by our interceptor), decodes the JWT, and returns the user object.

**Line 37:** Return the user object — `{ id, email, full_name, department, ... }`.

### Lines 39–41 — closing and export

```js
};

export default authApi;
```

**Line 39:** Close the `authApi` object.

**Line 41:** Export it as the default export. Now any file can do `import authApi from "../api/auth";` and call `authApi.login(...)`.

---

## 3. `frontend/src/api/tasks.js`

Same pattern as `auth.js`, but for task endpoints. Lines that work identically I'll explain once and skip later.

### Line 1

```js
import client from "./client";
```

### Lines 3–9 — `listTasks`

```js
const tasksApi = {
  listTasks: async (page = 1, pageSize = 50) => {
    const response = await client.get("/tasks", {
      params: { page, page_size: pageSize },
    });
    return response.data;
  },
```

**Line 4:** `listTasks: async (page = 1, pageSize = 50) =>`.
- Two parameters with default values. If you call `listTasks()` you get page 1, 50 per page.

**Line 5:** `client.get("/tasks", { ... })`.
- GET request. The second argument is the **request config**, not the body (GET has no body).

**Line 6:** `params: { page, page_size: pageSize }`.
- axios's `params` option tells it to serialize this object into the **query string**. So this becomes `GET /api/tasks?page=1&page_size=50`.
- Again `page_size: pageSize` translates camelCase to snake_case for the backend.

**Line 8:** Return the JSON. The backend returns something like `{ items: [...], total: 123, page: 1, ... }`.

### Lines 11–14 — `getTask`

```js
  getTask: async (taskId) => {
    const response = await client.get(`/tasks/${taskId}`);
    return response.data;
  },
```

**Line 12:** Template literal builds the URL: `/tasks/abc123`. This is how we hit a path parameter on the backend (`@router.get("/{task_id}")`).

### Lines 16–19 — `createTask`

```js
  createTask: async (data) => {
    const response = await client.post("/tasks", data);
    return response.data;
  },
```

**Line 16:** Takes a single `data` object. This is more flexible than listing every field — callers pass whatever fields the form has and we forward them.

**Line 17:** POST the whole object. The backend's Pydantic schema validates that all required fields are present.

### Lines 21–24 — `updateTask`

```js
  updateTask: async (taskId, data) => {
    const response = await client.patch(`/tasks/${taskId}`, data);
    return response.data;
  },
```

**Line 22:** `client.patch` issues a PATCH request — the HTTP verb for "partial update." Sends only the changed fields. The backend's update schema usually has all fields optional.

### Lines 26–29 — `deleteTask`

```js
  deleteTask: async (taskId) => {
    const response = await client.delete(`/tasks/${taskId}`);
    return response.data;
  },
```

**Line 27:** `client.delete` for the DELETE verb. Conventionally returns 204 No Content or a small success object.

### Line 32 — export

```js
export default tasksApi;
```

---

## 4. `frontend/src/api/users.js`

The smallest API file — currently only one endpoint.

```js
import client from "./client";

const usersApi = {
  listUsers: async (params = {}) => {
    const response = await client.get("/users", { params });
    return response.data;
  },
};

export default usersApi;
```

**Line 4:** `listUsers: async (params = {}) =>`.
- Default to an empty object so callers can do `listUsers()` and not pass anything.

**Line 5:** `client.get("/users", { params });`.
- `{ params }` is shorthand for `{ params: params }`. axios serializes whatever's in `params` into the query string. So `listUsers({ search: "john", limit: 20 })` becomes `GET /api/users?search=john&limit=20`.

The rest is identical to the patterns above.

---

## 5. `frontend/src/context/AuthContext.jsx`

Now we move from the API plumbing to the React state that uses it. This is the file that holds "who is logged in" globally.

### Line 1

```jsx
import { createContext, useState, useEffect, useCallback } from "react";
```

Bring in the four React APIs we'll use.
- `createContext` — creates a value that any descendant component can read.
- `useState` — manages a piece of state in a component.
- `useEffect` — runs side effects after render (like the initial `/me` call).
- `useCallback` — memoizes a function so its identity stays stable between renders.

### Line 2

```jsx
import authApi from "../api/auth";
```

The wrapper from §2. We'll call its methods inside this provider.

### Lines 4–7 — creating the context

```jsx
// Create the context with `null` as default.
// This value is only used if a component tries to consume the context
// without an AuthProvider above it in the tree -- which is a bug.
export const AuthContext = createContext(null);
```

**Lines 4–6:** Comment.

**Line 7:** `createContext(null)`.
- Returns a context object with two pieces: `AuthContext.Provider` (a component to wrap parts of your tree) and the context value system itself (consumed via `useContext`).
- The argument `null` is the default value used when a component calls `useContext(AuthContext)` but no `<AuthContext.Provider>` exists above it. We pick `null` so our `useAuth` hook can throw a clear error in that case.
- We `export const` it so the `useAuth` hook can import it.

### Line 9

```jsx
export function AuthProvider({ children }) {
```

Define the provider component.
- `{ children }` is destructuring of the props object. `children` is whatever is rendered between `<AuthProvider>...</AuthProvider>` — usually your whole app.

### Line 10

```jsx
  const [user, setUser] = useState(null);
```

`useState(null)` returns a tuple `[currentValue, setterFunction]`. We destructure into `user` (the current user object) and `setUser` (called to update it). Initial value is `null` (no one logged in yet).

Internally, React stores this state in its **fiber tree** for this component instance. Every time `setUser` is called with a new value, React schedules a re-render of `AuthProvider` and everything below it that consumes the context.

### Lines 12–21 — the `loading` flag and why it matters

```jsx
  // `loading` starts as true. This is critical for preventing
  // a "flash of login page" on hard refresh.
  //
  // Without it: App mounts -> user is null -> ProtectedRoute redirects
  // to /login -> THEN the /me call finishes and we realize the user
  // was logged in all along. Bad UX.
  //
  // With it: App mounts -> loading is true -> we show nothing (or a
  // spinner) -> /me call finishes -> THEN we render the right page.
  const [loading, setLoading] = useState(true);
```

**Lines 12–20:** Long comment explaining the bug this prevents.

**Line 21:** Same `useState` pattern, but starting at `true`. We'll flip it to `false` once the initial `/me` call resolves (success or fail). Until then, route guards refuse to make a routing decision.

### Lines 23–39 — `fetchUser`

```jsx
  // Fetch the current user from the backend.
  // Called on mount and after login to populate user state.
  // The request interceptor in client.js attaches the access_token
  // from localStorage as an Authorization header automatically.
  const fetchUser = useCallback(async () => {
    try {
      const data = await authApi.getMe();
      setUser(data);
    } catch {
      // getMe failed -- either no token in localStorage, or expired.
      // The interceptor already tried refreshing via the httpOnly cookie.
      // If we're here, the user is genuinely not authenticated.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
```

**Lines 23–26:** Comment.

**Line 27:** `const fetchUser = useCallback(async () => { ... }, []);`.
- We wrap the function in `useCallback` so it gets the **same identity** across renders. That matters because `useEffect` below uses `fetchUser` in its dependency array — if its identity changed every render, the effect would re-run every render and we'd hit `/me` in a loop.
- The empty `[]` means "this function never depends on anything that changes," so it's created once and reused forever.

**Line 28:** Open `try`.

**Line 29:** `const data = await authApi.getMe();`.
- Fire `/auth/me`. Behind the scenes:
  1. Request interceptor reads `localStorage.access_token`, attaches Bearer header.
  2. Backend validates JWT, returns user JSON.
  3. If JWT is expired → 401 → response interceptor catches it → calls `/auth/refresh` (cookie sent automatically) → if refresh succeeds, retries `/me`.
  4. Resolved value is the user object.

**Line 30:** `setUser(data);` — store the user. Triggers a re-render; route guards now see a logged-in user.

**Line 31:** `} catch { ... }`.
- Note: no parameter. We don't actually need the error object, we just need to know "it failed."

**Lines 32–34:** Comment explaining when this branch runs.

**Line 35:** `setUser(null);` — explicitly null out user. (It's already null on mount, but if `fetchUser` is called again later — e.g., after a failed re-login attempt — we want to wipe stale state.)

**Line 36:** `} finally { ... }`.

**Line 37:** `setLoading(false);` — regardless of success or failure, we now know the answer. Release the route guards.

**Line 39:** `}, []);` — empty dependency array, close `useCallback`.

### Lines 41–47 — the mount effect

```jsx
  // On first mount, try to restore the session.
  // If localStorage has a valid access_token, /me succeeds immediately.
  // If it's expired, the interceptor silently refreshes using the
  // httpOnly refresh_token cookie and retries.
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);
```

**Lines 41–44:** Comment.

**Line 45:** `useEffect(() => { ... }, [fetchUser]);`.
- `useEffect` runs the callback **after** the component has rendered.
- The dependency array `[fetchUser]` means: re-run the effect whenever `fetchUser`'s identity changes. Since we wrapped it in `useCallback([])`, its identity never changes, so this effect runs **exactly once** on mount.
- React's StrictMode in development runs effects twice on purpose to catch bugs — that's why you might see `/me` hit twice locally. It only happens in dev.

**Line 46:** `fetchUser();` — kick off the call. We don't await it; the effect returns synchronously and React doesn't care.

### Lines 49–58 — `login`

```jsx
  const login = useCallback(
    async (email, password) => {
      // authApi.login saves the access_token to localStorage and the
      // backend sets the refresh_token as an httpOnly cookie.
      await authApi.login(email, password);
      // Fetch the full user profile to populate state.
      await fetchUser();
    },
    [fetchUser]
  );
```

**Line 49:** `const login = useCallback(...)`.
- Same memoization reason — components like `LoginPage` will pass `login` to event handlers, and stable identity prevents unnecessary work.

**Line 50:** `async (email, password) => { ... }`.

**Lines 51–52:** Comment.

**Line 53:** `await authApi.login(email, password);`.
- POST `/auth/login` succeeds, access token saved to localStorage, refresh cookie set by browser. If credentials are wrong, this throws and the next line never runs — the error bubbles up to `LoginPage`'s `try/catch`.

**Line 54:** Comment.

**Line 55:** `await fetchUser();`.
- Now hit `/me` to populate the user object in state. Without this, the user would be logged in *technically* but `user` in the context would still be `null` until next mount.

**Line 57:** `[fetchUser]` — dependency, since we use `fetchUser` inside.

### Lines 60–66 — `register`

```jsx
  const register = useCallback(async (email, password, fullName, department) => {
    const data = await authApi.register(email, password, fullName, department);
    // We intentionally do NOT auto-login after registration.
    // The user should explicitly log in -- this is a UX best practice
    // for production apps (confirms they remember their credentials).
    return data;
  }, []);
```

**Line 60:** Wrap in `useCallback` with empty deps (we use no closures).

**Line 61:** Forward all four fields to the API wrapper. If the backend rejects (e.g., email already exists), this throws.

**Lines 62–64:** Comment explaining why we don't call `fetchUser` here.

**Line 65:** Return the response data (the new user object) so the registration page can show a success message.

### Lines 68–74 — `logout`

```jsx
  const logout = useCallback(async () => {
    await authApi.logout();
    // authApi.logout clears localStorage and the backend clears
    // the httpOnly cookie. Also clear user state immediately.
    localStorage.removeItem("access_token");
    setUser(null);
  }, []);
```

**Line 68:** `useCallback`, empty deps.

**Line 69:** Hit `/auth/logout`. Backend deletes the refresh cookie.

**Line 72:** `localStorage.removeItem("access_token");`.
- Defensive: `authApi.logout` already does this, but doing it here too means even if the backend call somehow fails, we still clean up locally. (Note: if `authApi.logout` *throws*, this line and the next are skipped — you may want to wrap in try/finally for true defensiveness.)

**Line 73:** `setUser(null);` — flip user state to null, which causes `ProtectedRoute` to immediately redirect to `/login`.

### Lines 76–84 — building the context value

```jsx
  // The value object passed to all consumers.
  // We provide the raw state + action functions.
  const value = {
    user,
    loading,
    login,
    register,
    logout,
  };
```

**Line 78:** Build a single object that bundles state and actions. Components consuming the context will get this exact object.

A subtle React gotcha: every render creates a **new** object literal here, even if the contents are the same. That means consumers re-render too. For a small auth context, this is fine. For larger contexts with frequent updates, you'd wrap this in `useMemo`. We don't bother because the auth state changes maybe 3 times in an entire session.

### Line 86

```jsx
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

**Line 86:**
- `<AuthContext.Provider value={value}>` is the React component that "publishes" the value to all descendants.
- `{children}` renders whatever was passed in (your whole app).
- Any descendant that calls `useContext(AuthContext)` (or our `useAuth` wrapper) receives `value`.

**Line 87:** Closing brace of the function.

---

## 6. `frontend/src/hooks/useAuth.js`

The smallest file in the project, but it's the recommended way to consume the context.

### Lines 1–2

```js
import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
```

Standard imports. We bring in React's `useContext` hook and the context object exported from §5.

### Line 4

```js
export function useAuth() {
```

Define the custom hook. By convention all hooks are named `useSomething`. React's lint rules check this prefix to enforce the rules of hooks.

### Line 5

```js
  const context = useContext(AuthContext);
```

`useContext(AuthContext)` walks up the React tree looking for the nearest `<AuthContext.Provider>`. It returns whatever was in that provider's `value` prop. If no provider is found, it returns the default we passed to `createContext` (`null`).

### Lines 7–12 — the safety check

```js
  // This guard catches a common developer mistake: using useAuth()
  // in a component that isn't wrapped by AuthProvider. Instead of
  // failing silently with undefined values, it throws a clear error.
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
```

**Line 10:** `if (!context)` — true when the context is `null` (the default we set). That can only happen if someone forgot the provider.

**Line 11:** Throw a descriptive error. Without this, the next line would try to destructure `null` and throw a confusing `Cannot read properties of null (reading 'user')`.

### Line 14

```js
  return context;
}
```

Return the value object so callers can write `const { user, login } = useAuth();`.

---

## How a real request actually flows

Now that you understand each line, here's a single login attempt traced from key-press to rendered home page:

1. **User clicks "Sign in"** in `LoginPage`. Its `handleSubmit` calls `login(email, password)`.
2. **`AuthContext.login`** runs `await authApi.login(email, password)`.
3. **`authApi.login`** runs `await client.post("/auth/login", { email, password })`.
4. **Request interceptor** runs. There's no token in localStorage yet, so it doesn't add a header. Returns the config.
5. **axios** sends `POST /api/auth/login` with the JSON body. Vite proxies it to FastAPI.
6. **Backend** verifies credentials, generates two JWTs, returns `{ access_token, token_type }` in the body and `Set-Cookie: refresh_token=...; HttpOnly` in the headers.
7. **Browser** stores the cookie. axios resolves the promise.
8. **Response interceptor** sees a 2xx; success handler returns the response unchanged.
9. **`authApi.login`** runs `localStorage.setItem("access_token", response.data.access_token);` and returns.
10. **`AuthContext.login`** continues with `await fetchUser()`.
11. **`fetchUser`** calls `authApi.getMe()` → `client.get("/auth/me")`.
12. **Request interceptor** now finds the token, attaches `Authorization: Bearer ...`.
13. **Backend** decodes the JWT, returns the user object.
14. **`fetchUser`** calls `setUser(data)` and `setLoading(false)`. React re-renders `AuthProvider` and everything below.
15. **`LoginPage`'s `handleSubmit`** continues past the `await login(...)` and calls `navigate("/")`.
16. **React Router** swaps the URL to `/`. `ProtectedRoute` re-evaluates: `loading=false`, `user` is set → renders `<AppLayout />`.
17. **`AppLayout`** mounts, renders `Sidebar`, `Navbar`, and the `<Outlet />` — which becomes `<HomePage />`.

Now imagine ten minutes later the user clicks something that triggers `tasksApi.listTasks()`:

1. `client.get("/tasks")` → interceptor attaches the (now expired) token.
2. Backend returns **401**.
3. **Response interceptor** runs:
   - Status is 401 ✓
   - `_retry` is not set ✓
   - Not an auth endpoint ✓
   - `isRefreshing` is false → take the lock, set `_retry = true`.
4. Raw `axios.post("/api/auth/refresh", {}, { withCredentials: true })` fires.
5. Browser includes the httpOnly cookie automatically. Backend issues a new access token.
6. Save it to localStorage. Call `processQueue(null)` (queue is empty, no-op). Call `client(originalRequest)`.
7. Retried `/tasks` request runs — this time the interceptor attaches the **new** token. Returns 200.
8. The original `await tasksApi.listTasks()` resolves with the data. The component never knew anything went wrong.

That's the complete picture. The whole point of this design is that **components stay simple**: they just call API functions and trust that auth, retries, and cleanup happen elsewhere.
