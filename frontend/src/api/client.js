import axios from "axios";

const client = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  // Still needed: the browser must send the httpOnly refresh_token
  // cookie on /auth/refresh requests.
  withCredentials: true,
});

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

// ── Refresh state ───────────────────────────────────────────────────────────
// Coordinates "refresh once, retry many": if 3 requests all get 401
// simultaneously, only 1 refresh call fires. The others wait in the
// queue and retry after the refresh succeeds.
let isRefreshing = false;
let failedQueue = [];

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

export default client;
