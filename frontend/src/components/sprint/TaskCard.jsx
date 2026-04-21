import { useDraggable } from "@dnd-kit/core";
import styles from "./TaskCard.module.css";

const PRIORITY_LABELS = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const TYPE_LABELS = {
  task: "Task",
  user_story: "User Story",
  bug: "Bug",
};

export function TaskCard({ task, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task._id,
      data: { status: task.status, assigneeId: task.assignee_id },
    });

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        zIndex: 999,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.card} ${isDragging ? styles.dragging : ""}`}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!isDragging) onClick(task._id);
        e.stopPropagation();
      }}
    >
      <p className={styles.title}>{task.title}</p>
      <div className={styles.meta}>
        <span className={`${styles.badge} ${styles[`priority_${task.priority}`]}`}>
          {PRIORITY_LABELS[task.priority] || task.priority}
        </span>
        <span className={styles.type}>
          {TYPE_LABELS[task.task_type] || task.task_type}
        </span>
      </div>
    </div>
  );
}
