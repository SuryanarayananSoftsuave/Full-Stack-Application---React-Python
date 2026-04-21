import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import tasksApi from "../../api/tasks";
import usersApi from "../../api/users";
import { CreateTaskModal } from "../../components/CreateTaskModal";
import { ViewTaskModal } from "../../components/ViewTaskModal";
import { Toast } from "../../components/Toast";
import styles from "./AllTasksPage.module.css";

const STATUS_ORDER = ["todo", "in_progress", "in_review", "done"];
const STATUS_LABELS = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

const PRIORITY_ORDER = ["critical", "high", "medium", "low"];
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

function GroupSection({ groupKey, label, count, badge, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.groupHeader}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>▸</span>
        <span className={styles.groupLabel}>{label}</span>
        {badge}
        <span className={styles.groupCount}>{count}</span>
      </button>
      {open && <div className={styles.groupBody}>{children}</div>}
    </div>
  );
}

export function TasksList({ title, lockedAssigneeId = null, lockedTypeFilter = null, excludeTypeFilter = null }) {
  const [tasks, setTasks] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewTaskId, setViewTaskId] = useState(null);
  const [toast, setToast] = useState(null);
  const [titleSearch, setTitleSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [users, setUsers] = useState([]);
  const [refetchKey, setRefetchKey] = useState(0);
  const [viewMode, setViewMode] = useState("list");
  const [groupBy, setGroupBy] = useState("none");

  const [debouncedTitle, setDebouncedTitle] = useState("");

  const showAssigneeFilter = !lockedAssigneeId;
  const showTypeFilter = !lockedTypeFilter;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTitle(titleSearch), 400);
    return () => clearTimeout(timer);
  }, [titleSearch]);

  useEffect(() => {
    usersApi.listUsers().then(setUsers).catch(() => {});
  }, []);

  const fetchTasks = useCallback(async (p, filters) => {
    setLoading(true);
    try {
      const data = await tasksApi.listTasks(p, groupBy !== "none" ? 200 : 50, filters);
      setTasks(data.items);
      setTotalPages(data.total_pages);
      setTotal(data.total);
    } catch {
      setToast({ message: "Failed to load tasks.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [groupBy]);

  const hasFilters = Boolean(
    debouncedTitle || statusFilter || priorityFilter || typeFilter || assigneeFilter
  );

  useEffect(() => {
    const filters = {};
    if (debouncedTitle) filters.title = debouncedTitle;
    if (statusFilter) filters.status = statusFilter;
    if (priorityFilter) filters.priority = priorityFilter;
    if (lockedTypeFilter) {
      filters.task_type = lockedTypeFilter;
    } else if (typeFilter) {
      filters.task_type = typeFilter;
    }
    if (lockedAssigneeId) {
      filters.assignee_id = lockedAssigneeId;
    } else if (assigneeFilter) {
      filters.assignee_id = assigneeFilter;
    }
    if (excludeTypeFilter) filters.exclude_task_type = excludeTypeFilter;
    fetchTasks(page, filters);
  }, [
    page,
    debouncedTitle,
    statusFilter,
    priorityFilter,
    typeFilter,
    assigneeFilter,
    lockedAssigneeId,
    lockedTypeFilter,
    excludeTypeFilter,
    refetchKey,
    fetchTasks,
  ]);

  useEffect(() => {
    setPage(1);
  }, [debouncedTitle, statusFilter, priorityFilter, typeFilter, assigneeFilter]);

  const clearFilters = () => {
    setTitleSearch("");
    setStatusFilter("");
    setPriorityFilter("");
    setTypeFilter("");
    setAssigneeFilter("");
  };

  const handleCreated = () => {
    setModalOpen(false);
    setToast({ message: "Task created successfully!", type: "success" });
    setRefetchKey((k) => k + 1);
  };

  const [menuTaskId, setMenuTaskId] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuTaskId) return;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuTaskId(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuTaskId]);

  const toggleMenu = (e, taskId) => {
    e.stopPropagation();
    setMenuTaskId((prev) => (prev === taskId ? null : taskId));
  };

  const handleArchive = async (e, taskId) => {
    e.stopPropagation();
    setMenuTaskId(null);
    try {
      await tasksApi.updateTask(taskId, { is_archived: true });
      setToast({ message: "Task archived.", type: "success" });
      setRefetchKey((k) => k + 1);
    } catch {
      setToast({ message: "Failed to archive task.", type: "error" });
    }
  };

  const handleDelete = async (e, taskId) => {
    e.stopPropagation();
    setMenuTaskId(null);
    try {
      await tasksApi.deleteTask(taskId);
      setToast({ message: "Task deleted.", type: "success" });
      setRefetchKey((k) => k + 1);
    } catch {
      setToast({ message: "Failed to delete task.", type: "error" });
    }
  };

  const renderActionMenu = (taskId) => (
    <div className={styles.actionCell}>
      <button type="button" className={styles.actionBtn} onClick={(e) => toggleMenu(e, taskId)}>⋯</button>
      {menuTaskId === taskId && (
        <div className={styles.actionMenu} ref={menuRef}>
          <button type="button" className={styles.actionItem} onClick={(e) => handleArchive(e, taskId)}>
            <span className={styles.actionIcon}>📦</span> Archive
          </button>
          <button type="button" className={`${styles.actionItem} ${styles.actionDanger}`} onClick={(e) => handleDelete(e, taskId)}>
            <span className={styles.actionIcon}>🗑</span> Delete
          </button>
        </div>
      )}
    </div>
  );

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;

    const map = {};
    const order = groupBy === "status" ? STATUS_ORDER : PRIORITY_ORDER;
    for (const key of order) map[key] = [];
    for (const t of tasks) {
      const key = groupBy === "status" ? t.status : t.priority;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return order.map((key) => ({ key, items: map[key] })).filter((g) => g.items.length > 0);
  }, [tasks, groupBy]);

  const labels = groupBy === "status" ? STATUS_LABELS : PRIORITY_LABELS;

  const renderCard = (task) => (
    <div key={task._id} className={styles.card} onClick={() => setViewTaskId(task._id)}>
      <div className={styles.cardHeader}>
        <div className={styles.cardBadges}>
          <span className={`${styles.badge} ${styles[`status_${task.status}`]}`}>
            {STATUS_LABELS[task.status] || task.status}
          </span>
          <span className={`${styles.badge} ${styles[`priority_${task.priority}`]}`}>
            {PRIORITY_LABELS[task.priority] || task.priority}
          </span>
        </div>
        {renderActionMenu(task._id)}
      </div>
      <h3 className={styles.cardTitle}>{task.title}</h3>
      {task.description && <p className={styles.cardDesc}>{task.description}</p>}
      <div className={styles.cardFooter}>
        <span className={styles.cardAssignee}>{task.assignee_name || "Unassigned"}</span>
        <span className={styles.cardDate}>{formatDate(task.created_at)}</span>
      </div>
    </div>
  );

  const renderRow = (task) => (
    <tr key={task._id} className={styles.clickableRow} onClick={() => setViewTaskId(task._id)}>
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
      <td className={styles.typeCell}>{TYPE_LABELS[task.task_type] || task.task_type}</td>
      <td className={styles.assigneeCell}>{task.assignee_name || "Unassigned"}</td>
      <td className={styles.dateCell}>{formatDate(task.created_at)}</td>
      <td>{renderActionMenu(task._id)}</td>
    </tr>
  );

  const renderItems = (items) =>
    viewMode === "grid" ? (
      <div className={styles.cardGrid}>{items.map(renderCard)}</div>
    ) : (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Type</th>
              <th>Assignee</th>
              <th>Created</th>
              <th style={{ width: 48 }} />
            </tr>
          </thead>
          <tbody>{items.map(renderRow)}</tbody>
        </table>
      </div>
    );

  const renderContent = () => {
    if (loading) return <div className={styles.empty}>Loading...</div>;
    if (tasks.length === 0)
      return (
        <div className={styles.empty}>
          {hasFilters ? (
            <>
              <p className={styles.emptyTitle}>No tasks match your filters</p>
              <p className={styles.emptyDesc}>Try adjusting or clearing the filters above.</p>
            </>
          ) : (
            <>
              <p className={styles.emptyTitle}>No tasks yet</p>
              <p className={styles.emptyDesc}>
                {lockedAssigneeId
                  ? "You don't have any tasks assigned to you."
                  : "Click \"+ Create Task\" to add your first task."}
              </p>
            </>
          )}
        </div>
      );

    if (grouped) {
      return grouped.map((g) => (
        <GroupSection
          key={g.key}
          groupKey={g.key}
          label={labels[g.key] || g.key}
          count={g.items.length}
          badge={
            <span className={`${styles.badge} ${styles[`${groupBy}_${g.key}`]}`}>
              {labels[g.key] || g.key}
            </span>
          }
        >
          {renderItems(g.items)}
        </GroupSection>
      ));
    }

    return renderItems(tasks);
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{total} task{total !== 1 ? "s" : ""} total</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.viewToggle}>
            <button
              type="button"
              className={`${styles.viewBtn} ${viewMode === "list" ? styles.viewBtnActive : ""}`}
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
            <button
              type="button"
              className={`${styles.viewBtn} ${viewMode === "grid" ? styles.viewBtnActive : ""}`}
              onClick={() => setViewMode("grid")}
              title="Grid view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="9.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="1.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>
            </button>
          </div>
          <button className={styles.createBtn} onClick={() => setModalOpen(true)}>
            + Create Task
          </button>
        </div>
      </div>

      {/* Toolbar: filters + group-by */}
      <div className={styles.toolbar}>
        <div className={styles.filterBar}>
          <input
            type="text"
            placeholder="Search by title..."
            value={titleSearch}
            onChange={(e) => setTitleSearch(e.target.value)}
            className={styles.searchInput}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={styles.filterSelect}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className={styles.filterSelect}>
            <option value="">All priorities</option>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {showTypeFilter && (
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={styles.filterSelect}>
              <option value="">All types</option>
              {Object.entries(TYPE_LABELS)
                .filter(([k]) => !excludeTypeFilter?.split(",").includes(k))
                .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
          {showAssigneeFilter && (
            <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className={styles.filterSelect}>
              <option value="">All assignees</option>
              <option value="null">Unassigned</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>{u.full_name}</option>
              ))}
            </select>
          )}
          {hasFilters && (
            <button type="button" className={styles.clearBtn} onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>

        <div className={styles.groupBar}>
          <span className={styles.groupByLabel}>Group by:</span>
          <div className={styles.groupToggle}>
            {[
              ["none", "None"],
              ["status", "Status"],
              ["priority", "Priority"],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={`${styles.groupBtn} ${groupBy === val ? styles.groupBtnActive : ""}`}
                onClick={() => setGroupBy(val)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {renderContent()}

      {/* Pagination (flat view only) */}
      {groupBy === "none" && totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className={styles.pageInfo}>Page {page} of {totalPages}</span>
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}

      {modalOpen && <CreateTaskModal onClose={() => setModalOpen(false)} onCreated={handleCreated} />}

      {viewTaskId && (
        <ViewTaskModal
          taskId={viewTaskId}
          onClose={() => setViewTaskId(null)}
          onUpdated={() => {
            setViewTaskId(null);
            setToast({ message: "Task updated successfully!", type: "success" });
            setRefetchKey((k) => k + 1);
          }}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
