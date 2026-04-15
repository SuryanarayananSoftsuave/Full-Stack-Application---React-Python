import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  // Sidebar collapsed state lives here because both Navbar and Sidebar
  // need to know about it: Navbar shifts its `left` offset, and Sidebar
  // changes its width. Lifting state to the nearest common parent is
  // the standard React pattern for shared state between siblings.
  const [collapsed, setCollapsed] = useState(false);

  const sidebarWidth = collapsed
    ? "var(--sidebar-collapsed-width)"
    : "var(--sidebar-width)";

  return (
    <div className={styles.layout}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <Navbar sidebarWidth={sidebarWidth} />

      <main className={styles.content} style={{ marginLeft: sidebarWidth }}>
        <div className={styles.inner}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}