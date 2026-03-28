/**
 * views/dashboard.js — Dashboard view
 */

import { getState, getBlockedTasks } from "../store.js";
import { fromTs } from "../db.js";
import { formatDate, priorityBadge } from "../ui-utils.js";
import { openTaskForm } from "../task-form.js";

// Brand-palette project colors — assigned round-robin by project index
const PROJECT_COLORS = [
  "#1FA8B4", // teal
  "#3D4BB5", // navy
  "#C94B8C", // hot pink
  "#7CB518", // chartreuse
  "#F5A623", // amber
  "#6B7FD7", // periwinkle
  "#E85D4A", // coral
  "#20B2AA", // sea green
];

function projectColor(projectId, projects) {
  const idx = projects.findIndex(p => p.id === projectId);
  return PROJECT_COLORS[(idx < 0 ? 0 : idx) % PROJECT_COLORS.length];
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function renderDashboard() {
  const el = document.getElementById("view-dashboard");
  const { tasks, projects } = getState();

  const now     = new Date();
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
  const todayStr = now.toDateString();

  const todayTasks = tasks
    .filter(t => {
      if (t.completed) return false;
      const s = fromTs(t.scheduledStart);
      return s && s.toDateString() === todayStr;
    })
    .sort((a, b) => fromTs(a.scheduledStart) - fromTs(b.scheduledStart));

  const completedToday = tasks
    .filter(t => {
      if (!t.completed || !t.completedAt) return false;
      return new Date(t.completedAt).toDateString() === todayStr;
    })
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  const hoursToday      = todayTasks.reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0);
  const hoursCompleted  = completedToday.reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0);

  const dueSoon = tasks
    .filter(t => {
      if (t.completed) return false;
      const due = fromTs(t.dueDate);
      return due && due <= weekEnd && due >= now;
    })
    .sort((a, b) => fromTs(a.dueDate) - fromTs(b.dueDate));

  const overdue = tasks.filter(t => {
    if (t.completed) return false;
    const due = fromTs(t.dueDate);
    return due && due < now;
  });

  const blocked = getBlockedTasks();

  const scheduledPastDue = tasks.filter(t => {
    if (t.completed) return false;
    const due   = fromTs(t.dueDate);
    const sched = fromTs(t.scheduledStart);
    if (!due || !sched) return false;
    const dueDay   = new Date(due);   dueDay.setHours(0, 0, 0, 0);
    const schedDay = new Date(sched); schedDay.setHours(0, 0, 0, 0);
    return schedDay > dueDay;
  }).sort((a, b) => fromTs(a.dueDate) - fromTs(b.dueDate));

  const unschedulable = tasks.filter(t => !t.completed && t.schedUnschedulable)
    .sort((a, b) => fromTs(a.dueDate) - fromTs(b.dueDate));

  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  el.innerHTML = `
    <div class="view-header dash-header">
      <div>
        <h2>${greeting()}</h2>
        <p class="dash-date">${dateLabel}</p>
      </div>
    </div>

    <!-- Stats row -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${hoursToday.toFixed(1)}<span class="stat-unit">h</span></div>
        <div class="stat-label">Scheduled today</div>
      </div>
      <div class="stat-card ${dueSoon.length ? "" : "stat-ok"}">
        <div class="stat-value">${dueSoon.length}</div>
        <div class="stat-label">Due this week</div>
      </div>
      <div class="stat-card ${overdue.length ? "stat-danger" : "stat-ok"}">
        <div class="stat-value">${overdue.length}</div>
        <div class="stat-label">Overdue</div>
      </div>
      <div class="stat-card ${blocked.length ? "stat-warn" : "stat-ok"}">
        <div class="stat-value">${blocked.length}</div>
        <div class="stat-label">Blocked</div>
      </div>
    </div>

    <!-- ── TODAY ZONE ────────────────────────────────────────── -->
    <div class="dash-zone">
      <div class="dash-zone-label">Today</div>

      <section class="dash-section">
        <h3 class="section-title">Up next
          ${hoursToday > 0 ? `<span class="section-badge">${hoursToday.toFixed(1)}h scheduled</span>` : ""}
        </h3>
        ${todayTasks.length
          ? `<div class="task-list">${todayTasks.map(t => taskRow(t, projects, true)).join("")}</div>`
          : `<p class="empty-state">Nothing scheduled for today</p>`}
      </section>

      ${completedToday.length ? `
      <section class="dash-section">
        <h3 class="section-title">Completed today
          <span class="section-badge section-badge--success">${completedToday.length} done · ${hoursCompleted.toFixed(1)}h</span>
        </h3>
        <div class="task-list">
          ${completedToday.map(t => taskRow(t, projects, false, true)).join("")}
        </div>
      </section>` : ""}
    </div>

    <!-- ── RADAR ZONE ─────────────────────────────────────────── -->
    ${(overdue.length || dueSoon.length || blocked.length || scheduledPastDue.length || unschedulable.length) ? `
    <div class="dash-zone">
      <div class="dash-zone-label">On your radar</div>

      ${overdue.length ? `
      <section class="dash-section">
        <h3 class="section-title danger-title">Overdue</h3>
        <div class="task-list">${overdue.map(t => taskRow(t, projects)).join("")}</div>
      </section>` : ""}

      ${dueSoon.length ? `
      <section class="dash-section">
        <h3 class="section-title">Due this week</h3>
        <div class="task-list">${dueSoon.map(t => taskRow(t, projects)).join("")}</div>
      </section>` : ""}

      ${blocked.length ? `
      <section class="dash-section">
        <h3 class="section-title warn-title">Blocked</h3>
        <div class="task-list">${blocked.map(t => taskRow(t, projects)).join("")}</div>
      </section>` : ""}

      ${scheduledPastDue.length ? `
      <section class="dash-section">
        <h3 class="section-title warn-title">Scheduled past due</h3>
        <div class="task-list">${scheduledPastDue.map(t => taskRow(t, projects, true, false, true)).join("")}</div>
      </section>` : ""}

      ${unschedulable.length ? `
      <section class="dash-section">
        <h3 class="section-title danger-title">Cannot be scheduled</h3>
        <div class="task-list">${unschedulable.map(t => taskRow(t, projects)).join("")}</div>
      </section>` : ""}
    </div>` : `
    <div class="dash-zone">
      <p class="empty-state dash-all-clear">You're all caught up — nothing on the radar.</p>
    </div>`}
  `;

  el.querySelectorAll(".task-row").forEach(row => {
    if (row.dataset.completed) return; // completed tasks are read-only
    row.addEventListener("click", () => {
      const task = getState().tasks.find(t => t.id === row.dataset.taskId);
      if (task) openTaskForm(task);
    });
  });
}

function taskRow(task, projects, showTime = false, isCompleted = false, showScheduledDate = false) {
  const project = projects.find(p => p.id === task.projectId);
  const stage   = project?.stages?.find(s => s.id === task.stageId);
  const color   = projectColor(task.projectId, projects);
  const due     = fromTs(task.dueDate);
  const sStart  = fromTs(task.scheduledStart);

  let schedMeta = "";
  if (showScheduledDate && sStart) {
    schedMeta = `<span class="task-time">Scheduled ${formatDate(sStart)} ${formatTime(sStart)}</span>`;
  } else if (showTime && sStart) {
    schedMeta = `<span class="task-time">${formatTime(sStart)}</span>`;
  }

  const completedTime = isCompleted && task.completedAt
    ? `<span class="task-time task-time--done">Done at ${formatTime(new Date(task.completedAt))}</span>`
    : "";

  return `
    <div class="task-row ${isCompleted ? "task-row--completed" : ""}" data-task-id="${task.id}" ${isCompleted ? 'data-completed="1"' : ""} style="--project-color:${color}">
      <div class="task-row-project-strip"></div>
      <div class="task-row-body">
        <div class="task-row-main">
          <span class="task-name">${esc(task.name)}${stage ? ` <span class="task-list-name">${esc(stage.name)}</span>` : ""}</span>
          ${isCompleted ? "" : priorityBadge(task.priority)}
        </div>
        <div class="task-row-meta">
          ${completedTime}
          ${schedMeta}
          ${due ? `<span class="task-due ${!isCompleted && due < new Date() ? "overdue" : ""}">Due ${formatDate(due)}</span>` : ""}
          <span class="task-hours">${task.estimatedHours}h</span>
          ${task.blockerIds?.length ? `<span class="blocked-badge">Blocked</span>` : ""}
          ${task.recurring ? `<span class="recurring-badge">Recurring</span>` : ""}
          ${task.schedUnschedulableReason ? `<span class="unschedulable-reason">${unschedulableReasonLabel(task.schedUnschedulableReason)}</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

function unschedulableReasonLabel(reason) {
  if (reason === "blocker_beyond_horizon") return "Blocker scheduled beyond 60-day window";
  if (reason === "blocker_unschedulable")  return "Blocked by an unschedulable task";
  return "Not enough free time in the next 60 days";
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
