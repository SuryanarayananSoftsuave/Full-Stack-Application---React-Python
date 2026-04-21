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
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
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
          setTags(data.tags || []);
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

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const payload = { ...form, tags };
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
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}>✎</span>
            <h2 className={styles.headerTitle}>Task Details</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {loading ? (
          <div className={styles.loading}>Loading task details...</div>
        ) : error && !form ? (
          <div className={styles.bodyError}>
            <div className={styles.error}>{error}</div>
          </div>
        ) : form ? (
          <form className={styles.body} onSubmit={handleSave}>
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
                className={styles.titleInput}
              />
            </div>

            {/* Row 2: Assignee | Email | Department */}
            <div className={styles.section}>
              <label className={styles.sectionLabel}>Assignee</label>
              <div className={styles.row3}>
                <div className={styles.field}>
                  <label htmlFor="vt-assignee">Name</label>
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
                <div className={styles.field}>
                  <label htmlFor="vt-email">Email</label>
                  <input
                    id="vt-email"
                    type="email"
                    value={selectedUser?.email || ""}
                    readOnly
                    className={styles.readonlyInput}
                    placeholder="—"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="vt-dept">Department</label>
                  <input
                    id="vt-dept"
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
            </div>

            {/* Row 4: Sprint | Due Date */}
            <div className={styles.section}>
              <label className={styles.sectionLabel}>Schedule</label>
              <div className={styles.row2}>
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

            {/* Row 7: Metadata */}
            <div className={styles.metaStrip}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Created</span>
                <span className={styles.metaValue}>{formatDateTime(task.created_at)}</span>
              </div>
              <div className={styles.metaDot} />
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Updated</span>
                <span className={styles.metaValue}>{formatDateTime(task.updated_at)}</span>
              </div>
            </div>

            {/* Footer */}
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
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
