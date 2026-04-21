import { createContext, useState, useEffect, useCallback } from "react";
import authApi from "../api/auth";

// Create the context with `null` as default.
// This value is only used if a component tries to consume the context
// without an AuthProvider above it in the tree -- which is a bug.
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

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

  // On first mount, try to restore the session.
  // If localStorage has a valid access_token, /me succeeds immediately.
  // If it's expired, the interceptor silently refreshes using the
  // httpOnly refresh_token cookie and retries.
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

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

  const register = useCallback(async (email, password, fullName, department) => {
    const data = await authApi.register(email, password, fullName, department);
    // We intentionally do NOT auto-login after registration.
    // The user should explicitly log in -- this is a UX best practice
    // for production apps (confirms they remember their credentials).
    return data;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    // authApi.logout clears localStorage and the backend clears
    // the httpOnly cookie. Also clear user state immediately.
    localStorage.removeItem("access_token");
    setUser(null);
  }, []);

  // The value object passed to all consumers.
  // We provide the raw state + action functions.
  const value = {
    user,
    loading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}