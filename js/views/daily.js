/**
 * views/daily.js — Focus for Today
 *
 * Always shows today. Surfaces the top 3 tasks to focus on,
 * plus a completed-today column and a compact list of remaining scheduled tasks.
 */

import { getState } from "../store.js";
import { fromTs } from "../db.js";
import { openTaskForm } from "../task-form.js";
import { formatTime, formatDate, priorityBadge, addDays } from "../ui-utils.js";

// Project colors — must match dashboard.js
const PROJECT_COLORS = [
  "#1FA8B4","#3D4BB5","#C94B8C","#7CB518",
  "#F5A623","#6B7FD7","#E85D4A","#20B2AA",
];
function projectColor(projectId, projects) {
  const idx = projects.findIndex(p => p.id === projectId);
  return PROJECT_COLORS[(idx < 0 ? 0 : idx) % PROJECT_COLORS.length];
}

export function renderDaily() {
  const el = document.getElementById("view-daily");
  const { tasks, projects } = getState();

  const now      = new Date();
  const todayStr = now.toDateString();
  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // ── Completed today ───────────────────────────────────────────────────────
  const completedToday = tasks
    .filter(t => t.completed && t.completedAt && new Date(t.completedAt).toDateString() === todayStr)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  // ── Progress ──────────────────────────────────────────────────────────────
  const scheduledToday = tasks.filter(t => {
    const s = fromTs(t.scheduledStart);
    return s && s.toDateString() === todayStr;
  });
  const totalHours     = scheduledToday.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
  const completedHrs   = completedToday.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
  const pct            = totalHours > 0 ? Math.round((completedHrs / totalHours) * 100) : 0;

  // ── Top 3 selection ───────────────────────────────────────────────────────
  const top3 = pickTop3(tasks, todayStr, now);
  const top3Ids = new Set(top3.filter(Boolean).map(t => t.id));

  // ── Also today — scheduled today but not in top 3 ────────────────────────
  const alsoToday = tasks.filter(t => {
    if (t.completed) return false;
    if (top3Ids.has(t.id)) return false;
    const s = fromTs(t.scheduledStart);
    return s && s.toDateString() === todayStr;
  }).sort((a, b) => fromTs(a.scheduledStart) - fromTs(b.scheduledStart));

  el.innerHTML = `
    <div class="view-header">
      <h2>Focus for Today</h2>
      <span class="dash-date">${dateLabel}</span>
    </div>

    <!-- Progress bar -->
    <div class="day-progress-card">
      <div class="progress-labels">
        <span>${completedHrs.toFixed(1)}h done</span>
        <span>${totalHours.toFixed(1)}h scheduled today</span>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="progress-pct">${pct}% complete</div>
    </div>

    <!-- Two-column layout -->
    <div class="focus-layout">

      <!-- Left: top 3 + also today -->
      <div class="focus-main">
        <div class="section-title" style="margin-bottom:16px">Where to focus</div>
        <div class="focus-cards">
          ${top3.map((task, i) => focusCard(task, i + 1, projects)).join("")}
        </div>

        ${alsoToday.length ? `
        <div class="focus-also">
          <div class="section-title">Also scheduled today</div>
          <div class="task-list">
            ${alsoToday.map(t => alsoRow(t, projects)).join("")}
          </div>
        </div>` : ""}
      </div>

      <!-- Right: completed today -->
      ${completedToday.length ? `
      <div class="focus-done">
        <div class="section-title">Completed today
          <span class="section-badge section-badge--success">${completedToday.length} done · ${completedHrs.toFixed(1)}h</span>
        </div>
        <div class="focus-done-list">
          ${completedToday.map(t => completedRow(t, projects)).join("")}
        </div>
      </div>` : ""}

    </div>

    ${buildUnscheduledWarning(tasks)}
  `;

  el.querySelectorAll(".focus-card[data-task-id]").forEach(card => {
    card.addEventListener("click", () => {
      const task = getState().tasks.find(t => t.id === card.dataset.taskId);
      if (task) openTaskForm(task);
    });
  });

  el.querySelectorAll(".also-row[data-task-id]").forEach(row => {
    row.addEventListener("click", () => {
      const task = getState().tasks.find(t => t.id === row.dataset.taskId);
      if (task) openTaskForm(task);
    });
  });
}

// ── Top 3 algorithm ───────────────────────────────────────────────────────────
// Priority pool order: overdue → scheduled today → due this week (unscheduled) → anything else
function pickTop3(tasks, todayStr, now) {
  const weekEnd = addDays(now, 7);
  const po = { high: 0, medium: 1, low: 2 };
  const byPriorityThenDue = (a, b) => {
    const pd = (po[a.priority] ?? 1) - (po[b.priority] ?? 1);
    if (pd !== 0) return pd;
    return (fromTs(a.dueDate) ?? new Date(9999,0)) - (fromTs(b.dueDate) ?? new Date(9999,0));
  };

  const seen = new Set();
  const bucket = arr => {
    const out = arr.filter(t => !seen.has(t.id));
    out.forEach(t => seen.add(t.id));
    return out;
  };

  const overdue = bucket(
    tasks.filter(t => !t.completed && fromTs(t.dueDate) && fromTs(t.dueDate) < now)
         .sort(byPriorityThenDue)
  );

  const scheduledToday = bucket(
    tasks.filter(t => {
      if (t.completed) return false;
      const s = fromTs(t.scheduledStart);
      return s && s.toDateString() === todayStr;
    }).sort(byPriorityThenDue)
  );

  const dueSoon = bucket(
    tasks.filter(t => {
      if (t.completed) return false;
      const due = fromTs(t.dueDate);
      return due && due >= now && due <= weekEnd;
    }).sort(byPriorityThenDue)
  );

  const rest = bucket(
    tasks.filter(t => !t.completed).sort(byPriorityThenDue)
  );

  const pool = [...overdue, ...scheduledToday, ...dueSoon, ...rest];
  const top3 = pool.slice(0, 3);
  while (top3.length < 3) top3.push(null);
  return top3;
}

// ── Card components ───────────────────────────────────────────────────────────

function focusCard(task, num, projects) {
  if (!task) {
    return `
      <div class="focus-card focus-card--empty">
        <div class="focus-card-num">${num}</div>
        <div class="focus-card-empty-msg">Nothing else to focus on</div>
      </div>
    `;
  }

  const project = projects.find(p => p.id === task.projectId);
  const stage   = project?.stages?.find(s => s.id === task.stageId);
  const color   = projectColor(task.projectId, projects);
  const due     = fromTs(task.dueDate);
  const now     = new Date();
  const isOverdue = due && due < now;
  const sched   = fromTs(task.scheduledStart);

  return `
    <div class="focus-card" data-task-id="${task.id}" style="--project-color:${color}">
      <div class="focus-card-strip"></div>
      <div class="focus-card-inner">
        <div class="focus-card-num">${num}</div>
        <div class="focus-card-content">
          <div class="focus-card-name">${esc(task.name)}</div>
          ${project ? `<div class="focus-card-project">${esc(project.name)}${stage ? ` · ${esc(stage.name)}` : ""}</div>` : ""}
          <div class="focus-card-meta">
            ${priorityBadge(task.priority)}
            <span class="task-hours">${task.estimatedHours}h</span>
            ${due ? `<span class="task-due ${isOverdue ? "overdue" : ""}">Due ${formatDate(due)}</span>` : ""}
            ${sched && !isOverdue ? `<span class="task-time">Starts ${formatTime(sched)}</span>` : ""}
          </div>
          ${task.notes ? `<div class="focus-card-notes">${esc(task.notes.slice(0, 120))}${task.notes.length > 120 ? "…" : ""}</div>` : ""}
        </div>
      </div>
    </div>
  `;
}

function alsoRow(task, projects) {
  const project = projects.find(p => p.id === task.projectId);
  const color   = projectColor(task.projectId, projects);
  const sched   = fromTs(task.scheduledStart);
  const due     = fromTs(task.dueDate);
  const now     = new Date();

  return `
    <div class="task-row also-row" data-task-id="${task.id}" style="--project-color:${color}">
      <div class="task-row-project-strip"></div>
      <div class="task-row-body">
        <div class="task-row-main">
          <span class="task-name">${esc(task.name)}</span>
          ${priorityBadge(task.priority)}
        </div>
        <div class="task-row-meta">
          ${sched ? `<span class="task-time">${formatTime(sched)}</span>` : ""}
          ${due ? `<span class="task-due ${due < now ? "overdue" : ""}">Due ${formatDate(due)}</span>` : ""}
          <span class="task-hours">${task.estimatedHours}h</span>
          ${project ? `<span class="task-list-name">${esc(project.name)}</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

function completedRow(task, projects) {
  const project = projects.find(p => p.id === task.projectId);
  const color   = projectColor(task.projectId, projects);
  const doneAt  = task.completedAt ? formatTime(new Date(task.completedAt)) : null;

  return `
    <div class="task-row task-row--completed" style="--project-color:${color}">
      <div class="task-row-project-strip"></div>
      <div class="task-row-body">
        <div class="task-row-main">
          <span class="task-name">${esc(task.name)}</span>
        </div>
        <div class="task-row-meta">
          ${doneAt ? `<span class="task-time task-time--done">Done ${doneAt}</span>` : ""}
          <span class="task-hours">${task.estimatedHours}h</span>
          ${project ? `<span class="task-list-name">${esc(project.name)}</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

function buildUnscheduledWarning(tasks) {
  const now = new Date();
  const soonCutoff = addDays(now, 7);
  const warnTasks = tasks.filter(t => {
    if (t.completed) return false;
    const due = fromTs(t.dueDate);
    return due && due <= soonCutoff && !fromTs(t.scheduledStart);
  });
  if (!warnTasks.length) return "";
  return `
    <div class="schedule-warning">
      <strong>${warnTasks.length} task${warnTasks.length > 1 ? "s" : ""} due soon but not scheduled.</strong>
      Check for blockers or run the auto-scheduler in Settings.
    </div>
  `;
}

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
