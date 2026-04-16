import client from "./client";

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
    // Backend returns { access_token, token_type } in the body
    // and sets the refresh_token as an httpOnly cookie.
    // Save the access token to localStorage so the request
    // interceptor in client.js can attach it to future requests.
    localStorage.setItem("access_token", response.data.access_token);
    return response.data;
  },

  logout: async () => {
    const response = await client.post("/auth/logout");
    // Backend clears the httpOnly refresh_token cookie.
    // Clear the access token from localStorage on our side.
    localStorage.removeItem("access_token");
    return response.data;
  },

  getMe: async () => {
    const response = await client.get("/auth/me");
    return response.data;
  },
};

export default authApi;
