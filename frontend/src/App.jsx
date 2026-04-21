import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ProtectedRoute } from "./components/protectedRoute";
import { GuestRoute } from "./components/GuestRoute";
import { LoginPage } from "./pages/Login/LoginPage";
import { RegisterPage } from "./pages/Register/Registerpage";
import { DashboardPage } from "./pages/Dashboard/DashboardPage";
import { AllTasksPage } from "./pages/Tasks/AllTasksPage";
import { MyTasksPage } from "./pages/Tasks/MyTasksPage";
import { SprintBoardPage } from "./pages/Tasks/SprintBoardPage";
import { UserStoryPage } from "./pages/Tasks/UserStoryPage";

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
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            {/* Guest routes: only accessible when NOT logged in */}
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            {/* Protected routes: only accessible when logged in */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/tasks" element={<AllTasksPage />} />
              <Route path="/tasks/my" element={<MyTasksPage />} />
              <Route path="/tasks/sprint" element={<SprintBoardPage />} />
              <Route path="/tasks/user-story" element={<UserStoryPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;