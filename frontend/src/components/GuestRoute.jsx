import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// Wraps routes that should ONLY be visible to unauthenticated users
// (Login, Register). If someone who's already logged in navigates
// to /login, they get redirected to / instead of seeing the form.
//
// Why this matters:
// Without this, a logged-in user could bookmark /login, visit it,
// and see a login form even though they're already authenticated.
// That's confusing UX and can cause double-login bugs.

export function GuestRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}