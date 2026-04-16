import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/protectedRoute";
import { GuestRoute } from "./components/GuestRoute";
import { LoginPage } from "./pages/Login/LoginPage";
import { RegisterPage } from "./pages/Register/Registerpage";
import { HomePage } from "./pages/Home/HomePage";
import { AllTasksPage } from "./pages/Tasks/AllTasksPage";

// ── App ─────────────────────────────────────────────────────────────────────
// The component tree order matters:
//
//   BrowserRouter  (provides routing context)
//     └── AuthProvider  (provides auth context -- needs to be INSIDE router
//                        so that it can potentially use navigate in the future,
//                        and OUTSIDE routes so all pages can access auth state)
//           └── Routes  (actual page routing)
//
// If AuthProvider was OUTSIDE BrowserRouter, any hook inside AuthProvider
// that uses react-router (like useNavigate) would crash.

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Guest routes: only accessible when NOT logged in */}
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Protected routes: only accessible when logged in */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/tasks" element={<AllTasksPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;