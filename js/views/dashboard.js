/**
 * views/dashboard.js — Dashboard view
 */

import { getState, getBlockedTasks } from "../store.js";
import { fromTs } from "../db.js";
import { formatDate, priorityBadge } from "../ui-utils.js";
import { openTaskForm } from "../task-form.js";

export function renderDashboard() {
  const el = document.getElementById("view-dashboard");
  const { tasks, projects, settings } = getState();

  const now        = new Date();
  const weekEnd    = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
  const dueSoon = tasks
    .filter(t => {
      if (t.completed) return false;
      const due = fromTs(t.dueDate);
      return due && due <= weekEnd && due >= now;
    })
    .sort((a, b) => fromTs(a.dueDate) - fromTs(b.dueDate));

  const todayTasks = tasks.filter(t => {
    if (t.completed) return false;
    const s = fromTs(t.scheduledStart);
    if (!s) return false;
    return s.toDateString() === now.toDateString();
  });

  const hoursToday = todayTasks.reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0);
  const blocked    = getBlockedTasks();

  // Overdue tasks
  const overdue = tasks.filter(t => {
    if (t.completed) return false;
    const due = fromTs(t.dueDate);
    return due && due < now;
  });

  el.innerHTML = `
    <div class="view-header">
      <h2>Dashboard 🏠</h2>
    </div>

    <!-- Stats row -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${dueSoon.length}</div>
        <div class="stat-label">Due this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${hoursToday.toFixed(1)}h</div>
        <div class="stat-label">Scheduled today</div>
      </div>
      <div class="stat-card ${blocked.length ? "stat-warn" : ""}">
        <div class="stat-value">${blocked.length}</div>
        <div class="stat-label">Blocked tasks</div>
      </div>
      <div class="stat-card ${overdue.length ? "stat-danger" : ""}">
        <div class="stat-value">${overdue.length}</div>
        <div class="stat-label">Overdue</div>
      </div>
    </div>

    ${overdue.length ? `
    <section class="dash-section">
      <h3 class="section-title danger-title">⚠️ Overdue</h3>
      <div class="task-list">
        ${overdue.map(t => taskRow(t)).join("")}
      </div>
    </section>` : ""}

    <section class="dash-section">
      <h3 class="section-title">📅 Due this week</h3>
      ${dueSoon.length
        ? `<div class="task-list">${dueSoon.map(t => taskRow(t)).join("")}</div>`
        : `<p class="empty-state">Nothing due in the next 7 days 🎉</p>`}
    </section>

    <section class="dash-section">
      <h3 class="section-title">☀️ Today's schedule</h3>
      ${todayTasks.length
        ? `<div class="task-list">${todayTasks.map(t => taskRow(t, true)).join("")}</div>`
        : `<p class="empty-state">No tasks scheduled for today</p>`}
    </section>

    ${blocked.length ? `
    <section class="dash-section">
      <h3 class="section-title">🚫 Blocked</h3>
      <div class="task-list">
        ${blocked.map(t => taskRow(t)).join("")}
      </div>
    </section>` : ""}

    <section class="dash-section">
      <h3 class="section-title">📁 Boards</h3>
      ${projects.length
        ? `<div class="project-chips">${projects.map(projectChip).join("")}</div>`
        : `<p class="empty-state">No Trello boards found. Connect in Settings.</p>`}
    </section>
  `;

  el.querySelectorAll(".task-row").forEach(row => {
    row.addEventListener("click", () => {
      const task = getState().tasks.find(t => t.id === row.dataset.taskId);
      if (task) openTaskForm(task);
    });
  });

  el.querySelectorAll(".project-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const id = chip.dataset.projectId;
      document.querySelector(`[data-view="projects"]`).click();
      // Will be picked up by the projects view
      window.__selectedProjectId = id;
    });
  });
}

function taskRow(task, showTime = false) {
  const { projects } = getState();
  const project = projects.find(p => p.id === task.projectId);
  const stage   = project?.stages?.find(s => s.id === task.stageId);
  const due  = fromTs(task.dueDate);
  const sStart = fromTs(task.scheduledStart);

  return `
    <div class="task-row" data-task-id="${task.id}">
      <div class="task-row-main">
        <span class="task-name">${esc(task.name)}${stage ? ` <span class="task-list-name">(${esc(stage.name)})</span>` : ""}</span>
        ${priorityBadge(task.priority)}
      </div>
      <div class="task-row-meta">
        ${showTime && sStart ? `<span class="task-time">🕐 ${formatTime(sStart)}</span>` : ""}
        ${due ? `<span class="task-due ${due < new Date() ? "overdue" : ""}">📅 ${formatDate(due)}</span>` : ""}
        <span class="task-hours">⏱ ${task.estimatedHours}h</span>
        ${task.blockerIds?.length ? `<span class="blocked-badge">🚫 Blocked</span>` : ""}
        ${task.recurring ? `<span class="recurring-badge">🔄</span>` : ""}
      </div>
    </div>
  `;
}

function projectChip(project) {
  const taskCount = getState().tasks.filter(t => t.projectId === project.id && !t.completed).length;
  return `
    <div class="project-chip" data-project-id="${project.id}">
      <span class="project-chip-name">${esc(project.name)}</span>
      <span class="project-chip-count">${taskCount} card${taskCount !== 1 ? "s" : ""}</span>
      ${project.url ? `<a href="${project.url}" target="_blank" rel="noopener" class="trello-card-link" onclick="event.stopPropagation()" title="Open in Trello">↗</a>` : ""}
    </div>
  `;
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
