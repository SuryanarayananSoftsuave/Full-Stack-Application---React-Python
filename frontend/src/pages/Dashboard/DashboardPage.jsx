import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
  Legend,
} from "recharts";

import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import tasksApi from "../../api/tasks";
import { ViewTaskModal } from "../../components/ViewTaskModal";
import { Toast } from "../../components/Toast";
import { KpiCard } from "./widgets/KpiCard";
import { ChartCard } from "./widgets/ChartCard";
import styles from "./DashboardPage.module.css";

// ── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

const STATUS_COLORS = {
  todo: "#94a3b8",
  in_progress: "#3b82f6",
  in_review: "#f59e0b",
  done: "#10b981",
};

const PRIORITY_LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_COLORS = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#3b82f6",
  low: "#10b981",
};

const TYPE_LABELS = {
  task: "Task",
  bug: "Bug",
  user_story: "User Story",
};

const TYPE_COLORS = {
  task: "#6366f1",
  bug: "#ef4444",
  user_story: "#10b981",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a, b) {
  return Math.floor((startOfDay(a) - startOfDay(b)) / 86400000);
}

function formatShortDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatLongDate(d) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ── Custom tooltip ──────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className={styles.tooltip}>
      {label && <div className={styles.tooltipLabel}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className={styles.tooltipRow}>
          <span className={styles.tooltipDot} style={{ background: p.color || p.fill }} />
          <span className={styles.tooltipName}>{p.name}</span>
          <span className={styles.tooltipValue}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Icons (inline SVG, no extra deps) ───────────────────────────────────────

const IconTotal = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);
const IconProgress = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
);
const IconClock = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const IconRefresh = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

// ── Main page ───────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth();
  const userId = user?.id || user?._id;
  const { theme } = useTheme();

  // Recharts SVGs can't read CSS variables directly, so we derive a small
  // palette from the active theme. Memoised on `theme` so it only recomputes
  // when the user actually flips the toggle.
  const chartColors = useMemo(() => {
    const isDark = theme === "dark";
    return {
      axis: isDark ? "#64748b" : "#94a3b8",
      axisStrong: isDark ? "#94a3b8" : "#475569",
      grid: isDark ? "#1f2a3d" : "#e2e8f0",
      pieStroke: isDark ? "#111827" : "#ffffff",   // matches --color-surface
      cursorFill: isDark
        ? "rgba(148, 163, 184, 0.10)"
        : "rgba(148, 163, 184, 0.08)",
      legend: isDark ? "#94a3b8" : "#475569",
    };
  }, [theme]);

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [viewTaskId, setViewTaskId] = useState(null);

  const fetchTasks = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await tasksApi.listTasks(1, 200, {
        assignee_id: userId,
        is_archived: false,
      });
      setTasks(data.items || []);
    } catch {
      setToast({ message: "Failed to load dashboard data.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // ── Aggregations ────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const now = new Date();
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    const last7 = new Date();
    last7.setDate(last7.getDate() - 7);

    return {
      total: tasks.length,
      inProgress: tasks.filter((t) => t.status === "in_progress").length,
      dueSoon: tasks.filter(
        (t) =>
          t.status !== "done" &&
          t.due_date &&
          new Date(t.due_date) >= startOfDay(now) &&
          new Date(t.due_date) <= in7
      ).length,
      completedThisWeek: tasks.filter(
        (t) => t.status === "done" && t.updated_at && new Date(t.updated_at) >= last7
      ).length,
    };
  }, [tasks]);

  const statusData = useMemo(() => {
    const counts = { todo: 0, in_progress: 0, in_review: 0, done: 0 };
    tasks.forEach((t) => {
      if (counts[t.status] !== undefined) counts[t.status] += 1;
    });
    return Object.entries(counts).map(([k, v]) => ({
      key: k,
      name: STATUS_LABELS[k],
      value: v,
      color: STATUS_COLORS[k],
    }));
  }, [tasks]);

  const priorityData = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    tasks.forEach((t) => {
      if (counts[t.priority] !== undefined) counts[t.priority] += 1;
    });
    return ["critical", "high", "medium", "low"].map((k) => ({
      name: PRIORITY_LABELS[k],
      value: counts[k],
      color: PRIORITY_COLORS[k],
    }));
  }, [tasks]);

  const sprintData = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      const key = t.sprint || "No Sprint";
      if (!map[key]) map[key] = { name: key, todo: 0, in_progress: 0, in_review: 0, done: 0 };
      if (map[key][t.status] !== undefined) map[key][t.status] += 1;
    });
    return Object.values(map).slice(0, 8);
  }, [tasks]);

  const typeData = useMemo(() => {
    const counts = { task: 0, bug: 0, user_story: 0 };
    tasks.forEach((t) => {
      if (counts[t.task_type] !== undefined) counts[t.task_type] += 1;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({
        name: TYPE_LABELS[k],
        value: v,
        fill: TYPE_COLORS[k],
      }));
  }, [tasks]);

  // 14-day completion trend (uses updated_at as proxy for completed_at)
  const trendData = useMemo(() => {
    const today = startOfDay(new Date());
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({ date: d, key: d.toISOString().slice(0, 10), label: formatShortDate(d), completed: 0 });
    }
    const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
    tasks.forEach((t) => {
      if (t.status !== "done" || !t.updated_at) return;
      const k = new Date(t.updated_at).toISOString().slice(0, 10);
      if (byKey[k]) byKey[k].completed += 1;
    });
    return days;
  }, [tasks]);

  const upcomingDeadlines = useMemo(() => {
    const now = startOfDay(new Date());
    return tasks
      .filter((t) => t.status !== "done" && t.due_date)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 7)
      .map((t) => {
        const due = new Date(t.due_date);
        const diff = daysBetween(due, now);
        let badgeClass = styles.deadlineNormal;
        let badgeText = `In ${diff} day${diff === 1 ? "" : "s"}`;
        if (diff < 0) {
          badgeClass = styles.deadlineOverdue;
          badgeText = `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} overdue`;
        } else if (diff === 0) {
          badgeClass = styles.deadlineToday;
          badgeText = "Due today";
        } else if (diff <= 3) {
          badgeClass = styles.deadlineSoon;
        }
        return { task: t, diff, badgeClass, badgeText };
      });
  }, [tasks]);

  // ── Render ──────────────────────────────────────────────────────────────

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const firstName = (user?.full_name || "").split(" ")[0] || "there";

  if (loading && tasks.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading your dashboard...</div>
      </div>
    );
  }

  if (!loading && tasks.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{greeting}, {firstName}</h1>
            <p className={styles.subtitle}>{formatLongDate(new Date())}</p>
          </div>
        </div>
        <div className={styles.emptyState}>
          <h2>No tasks assigned to you yet</h2>
          <p>Once tasks are assigned to you, they'll show up here with charts and insights.</p>
          <a href="/tasks" className={styles.emptyLink}>Browse all tasks →</a>
        </div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{greeting}, {firstName}</h1>
          <p className={styles.subtitle}>{formatLongDate(new Date())} · Here's what's on your plate</p>
        </div>
        <button className={styles.refreshBtn} onClick={fetchTasks} disabled={loading}>
          <IconRefresh /> {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* KPI Row */}
      <div className={styles.kpiRow}>
        <KpiCard icon={<IconTotal />} label="Total Tasks" value={kpis.total} accent="blue" subtext="Assigned to you" />
        <KpiCard icon={<IconProgress />} label="In Progress" value={kpis.inProgress} accent="amber" subtext="Currently active" />
        <KpiCard icon={<IconClock />} label="Due Soon" value={kpis.dueSoon} accent="red" subtext="Within 7 days" />
        <KpiCard icon={<IconCheck />} label="Completed" value={kpis.completedThisWeek} accent="green" subtext="Last 7 days" />
      </div>

      {/* Row 1: Status donut + Priority bars */}
      <div className={styles.gridTwo}>
        <ChartCard title="Status Breakdown" subtitle="Where your tasks stand right now">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={2}
                stroke={chartColors.pieStroke}
                strokeWidth={2}
              >
                {statusData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className={styles.legend}>
            {statusData.map((s) => (
              <div key={s.key} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: s.color }} />
                <span className={styles.legendName}>{s.name}</span>
                <span className={styles.legendValue}>{s.value}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Priority Distribution" subtitle="How urgent your workload looks">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={priorityData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartColors.grid} />
              <XAxis type="number" stroke={chartColors.axis} fontSize={12} />
              <YAxis type="category" dataKey="name" stroke={chartColors.axisStrong} fontSize={13} width={70} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: chartColors.cursorFill }} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={26}>
                {priorityData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2: Sprint workload + Type mix */}
      <div className={styles.gridTwo}>
        <ChartCard title="Sprint Workload" subtitle="Your tasks per sprint, stacked by status">
          {sprintData.length === 0 ? (
            <div className={styles.miniEmpty}>No sprint data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={sprintData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="name" stroke={chartColors.axis} fontSize={12} angle={-15} textAnchor="end" height={60} />
                <YAxis stroke={chartColors.axis} fontSize={12} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: chartColors.cursorFill }} />
                <Bar dataKey="todo" name="To Do" stackId="s" fill={STATUS_COLORS.todo} radius={[0, 0, 0, 0]} />
                <Bar dataKey="in_progress" name="In Progress" stackId="s" fill={STATUS_COLORS.in_progress} />
                <Bar dataKey="in_review" name="In Review" stackId="s" fill={STATUS_COLORS.in_review} />
                <Bar dataKey="done" name="Done" stackId="s" fill={STATUS_COLORS.done} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Task Type Mix" subtitle="Breakdown by category">
          {typeData.length === 0 ? (
            <div className={styles.miniEmpty}>No task type data.</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="30%"
                outerRadius="100%"
                barSize={22}
                data={typeData}
                startAngle={90}
                endAngle={-270}
              >
                <RadialBar background dataKey="value" cornerRadius={12} />
                <Legend
                  iconSize={10}
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ fontSize: 13, color: chartColors.legend }}
                />
                <Tooltip content={<CustomTooltip />} />
              </RadialBarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row 3: Completion trend full width */}
      <ChartCard
        title="Completion Trend"
        subtitle="Tasks you've completed in the last 14 days"
      >
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="completeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
            <XAxis dataKey="label" stroke={chartColors.axis} fontSize={12} />
            <YAxis stroke={chartColors.axis} fontSize={12} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="completed"
              name="Completed"
              stroke="#10b981"
              strokeWidth={2.5}
              fill="url(#completeGradient)"
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Row 4: Upcoming deadlines */}
      <ChartCard
        title="Upcoming Deadlines"
        subtitle="Your most pressing tasks. Click to open."
      >
        {upcomingDeadlines.length === 0 ? (
          <div className={styles.miniEmpty}>No deadlines on the horizon — nice work!</div>
        ) : (
          <div className={styles.deadlineList}>
            {upcomingDeadlines.map(({ task, badgeClass, badgeText }) => (
              <button
                key={task._id}
                type="button"
                className={styles.deadlineRow}
                onClick={() => setViewTaskId(task._id)}
              >
                <span
                  className={styles.deadlineStripe}
                  style={{ background: PRIORITY_COLORS[task.priority] || "#cbd5e1" }}
                />
                <div className={styles.deadlineMain}>
                  <div className={styles.deadlineTitle}>{task.title}</div>
                  <div className={styles.deadlineMeta}>
                    <span>{TYPE_LABELS[task.task_type] || task.task_type}</span>
                    <span className={styles.dotSep}>·</span>
                    <span>{STATUS_LABELS[task.status] || task.status}</span>
                    <span className={styles.dotSep}>·</span>
                    <span>{PRIORITY_LABELS[task.priority] || task.priority}</span>
                  </div>
                </div>
                <span className={`${styles.deadlineBadge} ${badgeClass}`}>{badgeText}</span>
                <span className={styles.deadlineDate}>{formatShortDate(task.due_date)}</span>
              </button>
            ))}
          </div>
        )}
      </ChartCard>

      {viewTaskId && (
        <ViewTaskModal
          taskId={viewTaskId}
          onClose={() => setViewTaskId(null)}
          onUpdated={() => {
            setViewTaskId(null);
            setToast({ message: "Task updated.", type: "success" });
            fetchTasks();
          }}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
