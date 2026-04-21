import { useState } from "react";
import { KanbanColumn } from "./KanbanColumn";
import styles from "./UserSwimLane.module.css";

const STATUSES = ["todo", "in_progress", "in_review", "done"];

export function UserSwimLane({
  userId,
  userName,
  tasks,
  onTaskClick,
  defaultOpen = true,
}) {
  const [open, setOpen] = useState(defaultOpen);

  const tasksByStatus = {};
  for (const s of STATUSES) {
    tasksByStatus[s] = tasks.filter((t) => t.status === s);
  }

  return (
    <div className={styles.lane}>
      <button
        className={styles.laneHeader}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>
          &#9656;
        </span>
        <span className={styles.name}>{userName}</span>
        <span className={styles.count}>
          {tasks.length} task{tasks.length !== 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        <div className={styles.columns}>
          {STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              userId={userId}
              status={status}
              tasks={tasksByStatus[status]}
              onTaskClick={onTaskClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
