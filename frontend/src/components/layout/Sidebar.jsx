import { NavLink } from "react-router-dom";
import styles from "./Sidebar.module.css";

// Simple inline SVG icons. In a production app you'd use a proper
// icon library (lucide-react, react-icons, etc). These are kept
// inline here to avoid adding a dependency for 2-3 icons.
const HomeIcon = () => (
  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const NAV_ITEMS = [
  { to: "/", icon: HomeIcon, label: "Home" },
  // Add more items here as you build more pages:
  // { to: "/settings", icon: SettingsIcon, label: "Settings" },
];

export function Sidebar({ collapsed, onToggle }) {
  const width = collapsed
    ? "var(--sidebar-collapsed-width)"
    : "var(--sidebar-width)";

  return (
    <aside className={styles.sidebar} style={{ width }}>
      <nav className={styles.nav}>
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
            }
          >
            <Icon />
            <span
              className={`${styles.label} ${
                collapsed ? styles.labelHidden : ""
              }`}
            >
              {label}
            </span>
          </NavLink>
        ))}
      </nav>

      <button className={styles.toggle} onClick={onToggle}>
        {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
      </button>
    </aside>
  );
}