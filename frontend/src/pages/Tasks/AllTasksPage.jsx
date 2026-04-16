import { useState, useEffect, useCallback } from "react";
import tasksApi from "../../api/tasks";
import { CreateTaskModal } from "../../components/CreateTaskModal";
import { Toast } from "../../components/Toast";
import styles from "./AllTasksPage.module.css";

const STATUS_LABELS = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

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

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AllTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchTasks = useCallback(async (p) => {
    setLoading(true);
    try {
      const data = await tasksApi.listTasks(p);
      setTasks(data.items);
      setTotalPages(data.total_pages);
      setTotal(data.total);
    } catch {
      setToast({ message: "Failed to load tasks.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks(page);
  }, [page, fetchTasks]);

  const handleCreated = () => {
    setModalOpen(false);
    setToast({ message: "Task created successfully!", type: "success" });
    fetchTasks(page);
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>All Tasks</h1>
          <p className={styles.subtitle}>{total} task{total !== 1 ? "s" : ""} total</p>
        </div>
        <button className={styles.createBtn} onClick={() => setModalOpen(true)}>
          + Create Task
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className={styles.empty}>Loading...</div>
      ) : tasks.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No tasks yet</p>
          <p className={styles.emptyDesc}>
            Click &quot;+ Create Task&quot; to add your first task.
          </p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Type</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task._id}>
                  <td className={styles.titleCell}>{task.title}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[`status_${task.status}`]}`}>
                      {STATUS_LABELS[task.status] || task.status}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles[`priority_${task.priority}`]}`}>
                      {PRIORITY_LABELS[task.priority] || task.priority}
                    </span>
                  </td>
                  <td className={styles.typeCell}>
                    {TYPE_LABELS[task.task_type] || task.task_type}
                  </td>
                  <td className={styles.dateCell}>{formatDate(task.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className={styles.pageInfo}>
            Page {page} of {totalPages}
          </span>
          <button
            className={styles.pageBtn}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <CreateTaskModal
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
