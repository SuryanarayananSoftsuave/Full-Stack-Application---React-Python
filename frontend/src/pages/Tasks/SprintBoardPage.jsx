import { useState, useEffect, useCallback, useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import tasksApi from "../../api/tasks";
import usersApi from "../../api/users";
import { UserSwimLane } from "../../components/sprint/UserSwimLane";
import { ViewTaskModal } from "../../components/ViewTaskModal";
import { Toast } from "../../components/Toast";
import styles from "./SprintBoardPage.module.css";

const UNASSIGNED_KEY = "__unassigned__";

export function SprintBoardPage() {
  const [sprints, setSprints] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedSprint, setSelectedSprint] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewTaskId, setViewTaskId] = useState(null);
  const [toast, setToast] = useState(null);

  // Distance threshold distinguishes click from drag — 5px of movement
  // before a drag starts. Without this, every click on a card would
  // begin a drag instead of opening the ViewTaskModal.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 15 } })
  );

  useEffect(() => {
    tasksApi.listSprints().then((list) => {
      setSprints(list);
      if (list.length) setSelectedSprint(list[list.length - 1]);
    }).catch(() => {});
    usersApi.listUsers().then(setUsers).catch(() => {});
  }, []);

  const fetchTasks = useCallback(async (sprint, assigneeId) => {
    if (!sprint) return;
    setLoading(true);
    try {
      const filters = { sprint, exclude_task_type: "user_story" };
      if (assigneeId) filters.assignee_id = assigneeId;
      const data = await tasksApi.listTasks(1, 200, filters);
      setTasks(data.items);
    } catch {
      setToast({ message: "Failed to load tasks.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks(selectedSprint, assigneeFilter);
  }, [selectedSprint, assigneeFilter, fetchTasks]);

  // Group tasks by assignee. Each key is either a user _id or UNASSIGNED_KEY.
  const lanes = useMemo(() => {
    const groups = {};

    for (const task of tasks) {
      const key = task.assignee_id || UNASSIGNED_KEY;
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    }

    // Build ordered lane list: named users first (alphabetical), then unassigned.
    const userMap = {};
    for (const u of users) userMap[u._id] = u.full_name;

    const result = [];
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === UNASSIGNED_KEY) return 1;
      if (b === UNASSIGNED_KEY) return -1;
      return (userMap[a] || a).localeCompare(userMap[b] || b);
    });

    for (const key of sortedKeys) {
      result.push({
        userId: key,
        userName: key === UNASSIGNED_KEY ? "Unassigned" : (userMap[key] || "Unknown User"),
        tasks: groups[key],
      });
    }
    return result;
  }, [tasks, users]);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id;
    const [targetUserId, newStatus] = over.id.split("::");
    const oldStatus = active.data.current.status;
    const draggedAssigneeId = active.data.current.assigneeId || UNASSIGNED_KEY;

    // Restrict drag to same swim lane — no cross-lane reassignment.
    if (targetUserId !== draggedAssigneeId) return;
    if (oldStatus === newStatus) return;

    const snapshot = tasks;
    setTasks((prev) =>
      prev.map((t) => (t._id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      await tasksApi.updateTask(taskId, { status: newStatus });
    } catch {
      setTasks(snapshot);
      setToast({ type: "error", message: "Couldn't update task status." });
    }
  };

  const handleTaskUpdated = () => {
    setViewTaskId(null);
    setToast({ message: "Task updated successfully!", type: "success" });
    fetchTasks(selectedSprint, assigneeFilter);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Sprint Board</h1>
      </div>

      <div className={styles.filterBar}>
        <select
          value={selectedSprint}
          onChange={(e) => setSelectedSprint(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">Select a sprint...</option>
          {sprints.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All assignees</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>{u.full_name}</option>
          ))}
        </select>
      </div>

      {!selectedSprint ? (
        <div className={styles.placeholder}>
          <p className={styles.placeholderTitle}>Select a sprint to begin</p>
          <p className={styles.placeholderDesc}>
            Pick a sprint from the dropdown above to see its Kanban board.
          </p>
        </div>
      ) : loading ? (
        <div className={styles.placeholder}>Loading...</div>
      ) : lanes.length === 0 ? (
        <div className={styles.placeholder}>
          <p className={styles.placeholderTitle}>No tasks in this sprint</p>
          <p className={styles.placeholderDesc}>
            Create tasks assigned to this sprint to see them here.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className={styles.board}>
            {lanes.map((lane) => (
              <UserSwimLane
                key={lane.userId}
                userId={lane.userId}
                userName={lane.userName}
                tasks={lane.tasks}
                onTaskClick={(id) => setViewTaskId(id)}
              />
            ))}
          </div>
        </DndContext>
      )}

      {viewTaskId && (
        <ViewTaskModal
          taskId={viewTaskId}
          onClose={() => setViewTaskId(null)}
          onUpdated={handleTaskUpdated}
        />
      )}

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
