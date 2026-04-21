import { useState, useEffect } from "react";
import tasksApi from "../api/tasks";
import usersApi from "../api/users";
import styles from "./CreateTaskModal.module.css";

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

const INITIAL_FORM = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  task_type: "task",
  sprint: "",
  due_date: "",
  assignee_id: "",
};

export function CreateTaskModal({ onClose, onCreated }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [users, setUsers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    usersApi.listUsers().then(setUsers).catch(() => {});
  }, []);

  const selectedUser = users.find((u) => u._id === form.assignee_id);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload = { ...form };
      if (!payload.sprint) delete payload.sprint;
      if (!payload.due_date) delete payload.due_date;
      if (!payload.assignee_id) delete payload.assignee_id;

      await tasksApi.createTask(payload);
      onCreated();
    } catch (err) {
      const message =
        err.response?.data?.detail || "Failed to create task. Try again.";
      setError(typeof message === "string" ? message : JSON.stringify(message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Create New Task</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.field}>
            <label htmlFor="ct-title">Title *</label>
            <input
              id="ct-title"
              name="title"
              type="text"
              value={form.title}
              onChange={handleChange}
              required
              maxLength={200}
              placeholder="Enter task title"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="ct-description">Description</label>
            <textarea
              id="ct-description"
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              maxLength={5000}
              placeholder="Describe the task..."
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="ct-status">Status</label>
              <select id="ct-status" name="status" value={form.status} onChange={handleChange}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="ct-priority">Priority</label>
              <select id="ct-priority" name="priority" value={form.priority} onChange={handleChange}>
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="ct-type">Type</label>
              <select id="ct-type" name="task_type" value={form.task_type} onChange={handleChange}>
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="ct-sprint">Sprint</label>
              <input
                id="ct-sprint"
                name="sprint"
                type="text"
                value={form.sprint}
                onChange={handleChange}
                placeholder="e.g. Sprint 4"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="ct-due">Due Date</label>
              <input
                id="ct-due"
                name="due_date"
                type="date"
                value={form.due_date}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="ct-assignee">Assigned To</label>
            <select
              id="ct-assignee"
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
                <label htmlFor="ct-assignee-email">Email</label>
                <input
                  id="ct-assignee-email"
                  type="email"
                  value={selectedUser.email}
                  readOnly
                  className={styles.readonlyInput}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="ct-assignee-dept">Department</label>
                <input
                  id="ct-assignee-dept"
                  type="text"
                  value={selectedUser.department || "—"}
                  readOnly
                  className={styles.readonlyInput}
                />
              </div>
            </div>
          )}

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={submitting}
            >
              {submitting ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
