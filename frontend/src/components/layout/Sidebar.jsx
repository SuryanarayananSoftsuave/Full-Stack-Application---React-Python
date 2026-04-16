import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import styles from "./Sidebar.module.css";

// ── Icons ───────────────────────────────────────────────────────────────────

const HomeIcon = () => (
  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const TasksIcon = () => (
  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const SettingsIcon = () => (
  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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

const ChevronIcon = () => (
  <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ── Navigation config ───────────────────────────────────────────────────────
// Two item types:
//   "link"  – flat nav link, navigates directly
//   "group" – collapsible parent with children array

const NAV_ITEMS = [
  { type: "link", to: "/", icon: HomeIcon, label: "Home" },
  {
    type: "group",
    icon: TasksIcon,
    label: "Tasks",
    basePath: "/tasks",
    children: [
      { to: "/tasks", label: "All Tasks" },
      { to: "/tasks/my", label: "My Tasks" },
      { to: "/tasks/sprint", label: "Sprint" },
      { to: "/tasks/user-story", label: "User Story" },
      { to: "/tasks/archived", label: "Archived" },
    ],
  },
  { type: "link", to: "/settings", icon: SettingsIcon, label: "Settings" },
];

// ── NavGroup component ──────────────────────────────────────────────────────
// Renders a collapsible parent with sub-items. Auto-opens when
// the current route matches any child path.

function NavGroup({ item, collapsed: sidebarCollapsed }) {
  const location = useLocation();
  const isChildActive = location.pathname.startsWith(item.basePath);

  // Auto-expand when a child route is active, otherwise
  // let the user toggle manually.
  const [open, setOpen] = useState(isChildActive);

  const Icon = item.icon;

  const handleClick = () => {
    // When sidebar is collapsed, clicking does nothing meaningful
    // for groups since labels are hidden. But we still toggle
    // so it opens when the sidebar re-expands.
    setOpen((prev) => !prev);
  };

  return (
    <div className={styles.group}>
      <button
        className={`${styles.groupTrigger} ${isChildActive ? styles.groupTriggerActive : ""}`}
        onClick={handleClick}
      >
        <Icon />
        <span className={`${styles.label} ${sidebarCollapsed ? styles.labelHidden : ""}`}>
          {item.label}
        </span>
        {!sidebarCollapsed && (
          <ChevronIcon
            className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
          />
        )}
      </button>

      {!sidebarCollapsed && (
        <div className={`${styles.subItems} ${open ? styles.subItemsOpen : ""}`}>
          {item.children.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `${styles.subLink} ${isActive ? styles.subLinkActive : ""}`
              }
            >
              <span className={styles.dot} />
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sidebar component ───────────────────────────────────────────────────────

export function Sidebar({ collapsed, onToggle }) {
  const width = collapsed
    ? "var(--sidebar-collapsed-width)"
    : "var(--sidebar-width)";

  return (
    <aside className={styles.sidebar} style={{ width }}>
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          if (item.type === "group") {
            return (
              <NavGroup
                key={item.label}
                item={item}
                collapsed={collapsed}
              />
            );
          }

          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
              }
            >
              <Icon />
              <span
                className={`${styles.label} ${collapsed ? styles.labelHidden : ""}`}
              >
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </nav>

      <button className={styles.toggle} onClick={onToggle}>
        {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
      </button>
    </aside>
  );
}
