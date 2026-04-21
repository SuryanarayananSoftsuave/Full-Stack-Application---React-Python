import { useDroppable } from "@dnd-kit/core";
import { TaskCard } from "./TaskCard";
import styles from "./KanbanColumn.module.css";

const STATUS_LABELS = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

const STATUS_COLORS = {
  todo: "#64748b",
  in_progress: "#2563eb",
  in_review: "#d97706",
  done: "#16a34a",
};

export function KanbanColumn({ userId, status, tasks, onTaskClick }) {
  const droppableId = `${userId}::${status}`;

  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.column} ${isOver ? styles.over : ""}`}
    >
      <div className={styles.header}>
        <span
          className={styles.dot}
          style={{ background: STATUS_COLORS[status] }}
        />
        <span className={styles.label}>{STATUS_LABELS[status]}</span>
        <span className={styles.count}>{tasks.length}</span>
      </div>

      <div className={styles.cards}>
        {tasks.length === 0 ? (
          <div className={styles.empty}>No tasks</div>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task._id} task={task} onClick={onTaskClick} />
          ))
        )}
      </div>
    </div>
  );
}
