import { useState, useEffect, useCallback } from "react";
import tasksApi from "../../api/tasks";
import usersApi from "../../api/users";
import { CreateTaskModal } from "../../components/CreateTaskModal";
import { ViewTaskModal } from "../../components/ViewTaskModal";
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

// Reusable tasks list view.
//
// Props:
//   - title: heading text shown at the top.
//   - lockedAssigneeId: when provided, the assignee filter is hidden and
//     this value is always sent as `assignee_id` to the API. Used by the
//     "My Tasks" page to scope the list to the current user.
export function TasksList({ title, lockedAssigneeId = null }) {
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

  const [debouncedTitle, setDebouncedTitle] = useState("");

  const showAssigneeFilter = !lockedAssigneeId;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTitle(titleSearch), 400);
    return () => clearTimeout(timer);
  }, [titleSearch]);

  useEffect(() => {
    if (!showAssigneeFilter) return;
    usersApi.listUsers().then(setUsers).catch(() => {});
  }, [showAssigneeFilter]);

  const fetchTasks = useCallback(async (p, filters) => {
    setLoading(true);
    try {
      const data = await tasksApi.listTasks(p, 50, filters);
      setTasks(data.items);
      setTotalPages(data.total_pages);
      setTotal(data.total);
    } catch {
      setToast({ message: "Failed to load tasks.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  const hasFilters = Boolean(
    debouncedTitle || statusFilter || priorityFilter || typeFilter || assigneeFilter
  );

  useEffect(() => {
    const filters = {};
    if (debouncedTitle) filters.title = debouncedTitle;
    if (statusFilter) filters.status = statusFilter;
    if (priorityFilter) filters.priority = priorityFilter;
    if (typeFilter) filters.task_type = typeFilter;
    if (lockedAssigneeId) {
      filters.assignee_id = lockedAssigneeId;
    } else if (assigneeFilter) {
      filters.assignee_id = assigneeFilter;
    }
    fetchTasks(page, filters);
  }, [
    page,
    debouncedTitle,
    statusFilter,
    priorityFilter,
    typeFilter,
    assigneeFilter,
    lockedAssigneeId,
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

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{total} task{total !== 1 ? "s" : ""} total</p>
        </div>
        <button className={styles.createBtn} onClick={() => setModalOpen(true)}>
          + Create Task
        </button>
      </div>

      {/* Filters */}
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
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={styles.filterSelect}>
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {showAssigneeFilter && (
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className={styles.filterSelect}
          >
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

      {/* Table */}
      {loading ? (
        <div className={styles.empty}>Loading...</div>
      ) : tasks.length === 0 ? (
        <div className={styles.empty}>
          {hasFilters ? (
            <>
              <p className={styles.emptyTitle}>No tasks match your filters</p>
              <p className={styles.emptyDesc}>
                Try adjusting or clearing the filters above.
              </p>
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
                <tr
                  key={task._id}
                  className={styles.clickableRow}
                  onClick={() => setViewTaskId(task._id)}
                >
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

      {/* Create Modal */}
      {modalOpen && (
        <CreateTaskModal
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {/* View / Edit Modal */}
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
