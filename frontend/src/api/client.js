import axios from "axios";

// ── Create the shared Axios instance ────────────────────────────────────────
// Every API call in the app imports and uses THIS instance.
// We never use raw `axios.get(...)` -- always `client.get(...)`.
// This guarantees every request goes through our interceptors.
const client = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },

  // CRITICAL: This tells the browser to include httpOnly cookies
  // in every request. Without this, cookies are silently dropped
  // and every authenticated request would return 401.
  withCredentials: true,
});

// ── Refresh state ───────────────────────────────────────────────────────────
// These two variables coordinate the "refresh once, retry many" pattern.
//
// Problem: Imagine 3 API calls fire at the same time, and all 3 get back
// a 401 because the access_token expired. Without coordination, each one
// would independently call /auth/refresh -- that's 3 refresh calls when
// we only need 1. Worse, the 2nd and 3rd might fail because the 1st
// already consumed the old refresh_token.
//
// Solution: The first 401 sets `isRefreshing = true` and actually calls
// /auth/refresh. The 2nd and 3rd 401s see `isRefreshing = true`, so
// instead of refreshing again, they push themselves into `failedQueue`
// and wait. When the refresh completes, we drain the queue and retry all.
let isRefreshing = false;
let failedQueue = [];

// Resolves or rejects every promise sitting in the queue.
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

// ── Response interceptor ────────────────────────────────────────────────────
client.interceptors.response.use(
  // Happy path: 2xx responses pass straight through, untouched.
  (response) => response,

  // Error path: this runs for every non-2xx response.
  async (error) => {
    const originalRequest = error.config;

    // Skip the refresh/retry logic entirely for auth endpoints.
    // A 401 from /auth/login means "wrong credentials" -- NOT "expired token."
    // Without this guard, a failed login triggers a refresh attempt,
    // which fails, which redirects to /login, which reloads the page,
    // which calls /me, which 401s, which refreshes... infinite loop.
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

    // If another request is already refreshing, don't fire a second
    // refresh call. Instead, queue this request and wait.
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => client(originalRequest));
    }

    // Mark this request so we don't retry it infinitely.
    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Use raw `axios` here, NOT `client`.
      // Why? If we used `client.post(...)`, this interceptor would
      // intercept the refresh call's own 401, causing an infinite loop.
      await axios.post("/api/auth/refresh", {}, { withCredentials: true });

      // Refresh succeeded -- new cookies are now set by the browser.
      // Resolve all queued requests so they retry with fresh cookies.
      processQueue(null);

      // Retry the original request that started all this.
      return client(originalRequest);
    } catch (refreshError) {
      // Refresh failed -- the session is truly dead.
      // Reject everything in the queue.
      processQueue(refreshError);

      // Redirect to login only if we're not already there.
      // Without this check, a failed refresh on /login would
      // cause a reload loop: redirect -> mount -> /me 401 -> repeat.
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default client;