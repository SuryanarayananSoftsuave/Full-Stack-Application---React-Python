import { useState, useEffect } from "react";
import tasksApi from "../api/tasks";
import usersApi from "../api/users";
import styles from "./ViewTaskModal.module.css";

const STATUS_OPTIONS = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "done", label: "Done" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const TYPE_OPTIONS = [
  { value: "task", label: "Task" },
  { value: "user_story", label: "User Story" },
  { value: "bug", label: "Bug" },
];

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ViewTaskModal({ taskId, onClose, onUpdated }) {
  const [task, setTask] = useState(null);
  const [form, setForm] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    usersApi.listUsers().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchTask() {
      setLoading(true);
      setError("");
      try {
        const data = await tasksApi.getTask(taskId);
        if (!cancelled) {
          setTask(data);
          setForm({
            title: data.title,
            description: data.description,
            status: data.status,
            priority: data.priority,
            task_type: data.task_type,
            sprint: data.sprint || "",
            due_date: data.due_date ? data.due_date.slice(0, 10) : "",
            assignee_id: data.assignee_id || "",
          });
        }
      } catch {
        if (!cancelled) setError("Failed to load task details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTask();
    return () => { cancelled = true; };
  }, [taskId]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const payload = { ...form };
      // For an UPDATE, an empty string from a "Clear"/"Unassigned" choice
      // must be sent as null so the backend actually clears the field.
      // Deleting the key would make Pydantic treat it as "unchanged".
      payload.sprint = payload.sprint || null;
      payload.due_date = payload.due_date || null;
      payload.assignee_id = payload.assignee_id || null;

      await tasksApi.updateTask(taskId, payload);
      onUpdated();
    } catch (err) {
      const message =
        err.response?.data?.detail || "Failed to update task. Try again.";
      setError(typeof message === "string" ? message : JSON.stringify(message));
    } finally {
      setSaving(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const selectedUser = form
    ? users.find((u) => u._id === form.assignee_id)
    : null;

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Task Details</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {loading ? (
          <div className={styles.loading}>Loading task details...</div>
        ) : error && !form ? (
          <div className={styles.body}>
            <div className={styles.error}>{error}</div>
          </div>
        ) : form ? (
          <form className={styles.form} onSubmit={handleSave}>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.field}>
              <label htmlFor="vt-title">Title *</label>
              <input
                id="vt-title"
                name="title"
                type="text"
                value={form.title}
                onChange={handleChange}
                required
                maxLength={200}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="vt-description">Description</label>
              <textarea
                id="vt-description"
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={3}
                maxLength={5000}
              />
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="vt-status">Status</label>
                <select id="vt-status" name="status" value={form.status} onChange={handleChange}>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="vt-priority">Priority</label>
                <select id="vt-priority" name="priority" value={form.priority} onChange={handleChange}>
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="vt-type">Type</label>
                <select id="vt-type" name="task_type" value={form.task_type} onChange={handleChange}>
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="vt-sprint">Sprint</label>
                <input
                  id="vt-sprint"
                  name="sprint"
                  type="text"
                  value={form.sprint}
                  onChange={handleChange}
                  placeholder="e.g. Sprint 4"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="vt-due">Due Date</label>
                <input
                  id="vt-due"
                  name="due_date"
                  type="date"
                  value={form.due_date}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="vt-assignee">Assigned To</label>
              <select
                id="vt-assignee"
                name="assignee_id"
                value={form.assignee_id}
                onChange={handleChange}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>{u.full_name}</option>
                ))}
              </select>
            </div>

            {selectedUser && (
              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="vt-assignee-email">Email</label>
                  <input
                    id="vt-assignee-email"
                    type="email"
                    value={selectedUser.email}
                    readOnly
                    className={styles.readonlyInput}
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="vt-assignee-dept">Department</label>
                  <input
                    id="vt-assignee-dept"
                    type="text"
                    value={selectedUser.department || "—"}
                    readOnly
                    className={styles.readonlyInput}
                  />
                </div>
              </div>
            )}

            {/* Read-only metadata */}
            <div className={styles.readonlyRow}>
              <div className={styles.readonlyItem}>
                <span className={styles.readonlyLabel}>Created</span>
                <span className={styles.readonlyValue}>{formatDateTime(task.created_at)}</span>
              </div>
              <div className={styles.readonlyItem}>
                <span className={styles.readonlyLabel}>Updated</span>
                <span className={styles.readonlyValue}>{formatDateTime(task.updated_at)}</span>
              </div>
            </div>

            {/* Tags (read-only) */}
            {task.tags && task.tags.length > 0 && (
              <div className={styles.section}>
                <span className={styles.readonlyLabel}>Tags</span>
                <div className={styles.tagList}>
                  {task.tags.map((tag) => (
                    <span key={tag} className={styles.tag}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.footer}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.saveBtn}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
