import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { AppLayout } from "./layout/AppLayout";

// Wraps routes that require authentication (e.g., Home, Dashboard).
//
// How it works:
// 1. If `loading` is true, we're still checking if the user has
//    a valid session (the initial /me call hasn't finished).
//    Show nothing -- this prevents the "flash of login page".
//
// 2. If loading is done and there's no user, they're not logged in.
//    Redirect to /login.
//
// 3. If there IS a user, render the child route via <Outlet />.
//
// Usage in the router:
//   <Route element={<ProtectedRoute />}>
//     <Route path="/" element={<HomePage />} />
//   </Route>

export function ProtectedRoute() {
    const { user, loading } = useAuth();
    if (loading) {
      return null;
    }
    if (!user) {
      return <Navigate to="/login" replace />;
    }
    // Instead of a bare <Outlet />, we render AppLayout which
    // contains Navbar + Sidebar + <Outlet /> inside it.
    // Every child route (HomePage, etc.) is rendered inside
    // AppLayout's content area automatically.
    return <AppLayout />;
  }