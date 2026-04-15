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
  const fetchUser = useCallback(async () => {
    try {
      const data = await authApi.getMe();
      setUser(data);
    } catch {
      // getMe failed -- either no cookie, or expired session.
      // The interceptor already tried refreshing.
      // If we're here, the user is genuinely not authenticated.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // On first mount, try to restore the session.
  // If the user still has a valid access_token (or refresh_token)
  // cookie, this will succeed and they stay logged in across
  // page refreshes without re-entering credentials.
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(
    async (email, password) => {
      // This call sets the httpOnly cookies via Set-Cookie headers.
      await authApi.login(email, password);

      // Now fetch the full user profile. We do this as a separate call
      // instead of returning user data from /login because:
      // 1. /login's job is authentication, not data fetching (SRP)
      // 2. It guarantees the cookie actually works end-to-end
      // 3. We get the same user shape as every subsequent /me call
      await fetchUser();
    },
    [fetchUser]
  );

  const register = useCallback(async (email, password, fullName) => {
    const data = await authApi.register(email, password, fullName);
    // We intentionally do NOT auto-login after registration.
    // The user should explicitly log in -- this is a UX best practice
    // for production apps (confirms they remember their credentials).
    return data;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    // Clear user state immediately. Don't wait for a /me call.
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