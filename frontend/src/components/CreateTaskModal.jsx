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

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

const INITIAL_FORM = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  task_type: "task",
  sprint: "",
  due_date: defaultDueDate(),
  assignee_id: "",
};

export function CreateTaskModal({ onClose, onCreated }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
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

  const addTag = () => {
    const val = tagInput.trim().toLowerCase();
    if (val && !tags.includes(val)) setTags((prev) => [...prev, val]);
    setTagInput("");
  };

  const removeTag = (t) => setTags((prev) => prev.filter((x) => x !== t));

  const handleTagKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); addTag(); }
    if (e.key === "Backspace" && !tagInput && tags.length) removeTag(tags[tags.length - 1]);
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload = { ...form, tags };
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
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}>+</span>
            <h2 className={styles.headerTitle}>Create New Task</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <form className={styles.body} onSubmit={handleSubmit}>
          {error && <div className={styles.error}>{error}</div>}

          {/* Row 1: Title */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Task Name</label>
            <input
              name="title"
              type="text"
              value={form.title}
              onChange={handleChange}
              required
              maxLength={200}
              placeholder="What needs to be done?"
              className={styles.titleInput}
            />
          </div>

          {/* Row 2: Assignee | Email | Department */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Assignee</label>
            <div className={styles.row3}>
              <div className={styles.field}>
                <label htmlFor="ct-assignee">Name</label>
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
              <div className={styles.field}>
                <label htmlFor="ct-email">Email</label>
                <input
                  id="ct-email"
                  type="email"
                  value={selectedUser?.email || ""}
                  readOnly
                  className={styles.readonlyInput}
                  placeholder="—"
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="ct-dept">Department</label>
                <input
                  id="ct-dept"
                  type="text"
                  value={selectedUser?.department || ""}
                  readOnly
                  className={styles.readonlyInput}
                  placeholder="—"
                />
              </div>
            </div>
          </div>

          {/* Row 3: Status | Priority | Type */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Details</label>
            <div className={styles.row3}>
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
          </div>

          {/* Row 4: Sprint | Due Date */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Schedule</label>
            <div className={styles.row2}>
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
          </div>

          {/* Row 5: Description */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={5}
              maxLength={5000}
              placeholder="Add a detailed description..."
              className={styles.textarea}
            />
          </div>

          {/* Row 6: Tags */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Tags</label>
            <div className={styles.tagInputWrap}>
              {tags.map((t) => (
                <span key={t} className={styles.tag}>
                  {t}
                  <button type="button" className={styles.tagRemove} onClick={() => removeTag(t)}>×</button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addTag}
                placeholder={tags.length === 0 ? "Type a tag and press Enter..." : ""}
                className={styles.tagField}
              />
            </div>
          </div>

          {/* Footer */}
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
