import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import styles from "./Navbar.module.css";

export function Navbar({ sidebarWidth }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <nav className={styles.navbar} style={{ left: sidebarWidth }}>
      <span className={styles.title}>Dashboard</span>

      <div className={styles.actions}>
        <span className={styles.userName}>{user?.full_name}</span>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </nav>
  );
}