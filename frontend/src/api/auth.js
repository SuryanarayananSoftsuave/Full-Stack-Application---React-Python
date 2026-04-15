import client from "./client";

// ── Auth API service ────────────────────────────────────────────────────────
// Thin wrappers around the Axios client. Each function maps 1:1 to a
// backend endpoint. Components import these functions instead of
// touching Axios directly.
//
// Notice we return `response.data` -- this unwraps the Axios response
// envelope so components get the actual JSON payload, not the full
// { status, headers, data, config } object.

const authApi = {
  register: async (email, password, fullName) => {
    const response = await client.post("/auth/register", {
      email,
      password,
      full_name: fullName,
    });
    return response.data;
  },

  login: async (email, password) => {
    const response = await client.post("/auth/login", {
      email,
      password,
    });
    // The backend sets httpOnly cookies in the response headers.
    // We never see or touch the tokens -- the browser handles them.
    // All we get back is { message: "Login successful" }.
    return response.data;
  },

  logout: async () => {
    const response = await client.post("/auth/logout");
    // Backend clears the httpOnly cookies via Set-Cookie headers.
    return response.data;
  },

  getMe: async () => {
    const response = await client.get("/auth/me");
    // Returns the full user object: id, email, full_name, roles, etc.
    // The access_token cookie is sent automatically by the browser.
    // If it's expired, our interceptor in client.js silently refreshes.
    return response.data;
  },
};

export default authApi;