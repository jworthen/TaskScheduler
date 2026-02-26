/**
 * views/tasks.js — All Trello cards with filtering, sorting, and scheduling actions
 *
 * Task data comes from Trello (loaded in main.js).
 * "Complete" marks the card's due date as complete in Trello.
 * "Archive" closes the card in Trello (equivalent of delete).
 * Clicking a row opens the scheduling metadata modal.
 */

import { getState, setState, getBlockedTasks } from "../store.js";
import { fromTs } from "../db.js";
import { openTaskForm } from "../task-form.js";
import { priorityBadge, formatDate } from "../ui-utils.js";

export function renderTasks() {
  const el = document.getElementById("view-tasks");
  const { tasks, projects } = getState();

  el.innerHTML = `
    <div class="view-header">
      <h2>All Cards ✅</h2>
      <div class="header-actions">
        <span class="settings-hint" style="font-size:0.85rem;">Add cards in Trello, then refresh here</span>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters-bar">
      <select id="filter-project">
        <option value="">All projects</option>
        ${projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}
      </select>
      <select id="filter-priority">
        <option value="">All priorities</option>
        <option value="high">🔴 High</option>
        <option value="medium">🟡 Medium</option>
        <option value="low">🟢 Low</option>
      </select>
      <select id="filter-status">
        <option value="active">Active</option>
        <option value="completed">Completed</option>
        <option value="blocked">Blocked</option>
        <option value="all">All</option>
      </select>
      <input type="text" id="filter-search" placeholder="Search tasks..." />
    </div>

    <!-- Task table -->
    <div id="task-table-container">
      <!-- rendered by applyFilters -->
    </div>
  `;

  // Filter listeners
  ["filter-project","filter-priority","filter-status","filter-search"]
    .forEach(id => el.querySelector("#" + id).addEventListener("input", () => applyFilters(el)));

  applyFilters(el);
}

function applyFilters(el) {
  const { tasks } = getState();
  const blocked    = getBlockedTasks().map(t => t.id);

  const projectId  = el.querySelector("#filter-project").value;
  const priority   = el.querySelector("#filter-priority").value;
  const status     = el.querySelector("#filter-status").value;
  const search     = el.querySelector("#filter-search").value.toLowerCase();

  let filtered = tasks.filter(t => {
    if (projectId  && t.projectId  !== projectId)  return false;
    if (priority   && t.priority   !== priority)    return false;
    if (status === "active"    && t.completed)       return false;
    if (status === "completed" && !t.completed)      return false;
    if (status === "blocked"   && !blocked.includes(t.id)) return false;
    if (search && !t.name.toLowerCase().includes(search)) return false;
    return true;
  });

  // Sort: incomplete first, then by priority, then due date
  filtered.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const po = { high: 0, medium: 1, low: 2 };
    const pd = (po[a.priority] ?? 1) - (po[b.priority] ?? 1);
    if (pd !== 0) return pd;
    const da = fromTs(a.dueDate) ?? new Date(9999,0);
    const db = fromTs(b.dueDate) ?? new Date(9999,0);
    return da - db;
  });

  const container = el.querySelector("#task-table-container");
  if (!filtered.length) {
    container.innerHTML = `<p class="empty-state">No tasks match your filters.</p>`;
    return;
  }

  container.innerHTML = `
    <table class="task-table">
      <thead>
        <tr>
          <th>Done</th>
          <th>Card</th>
          <th>Board</th>
          <th>Priority</th>
          <th>Due</th>
          <th>Est. hrs</th>
          <th>Scheduled</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(t => taskRow(t, blocked)).join("")}
      </tbody>
    </table>
  `;

  // Edit scheduling metadata
  container.querySelectorAll(".task-edit-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const task = getState().tasks.find(t => t.id === btn.dataset.taskId);
      if (task) openTaskForm(task);
    });
  });

  // Row click → edit
  container.querySelectorAll("tr[data-task-id]").forEach(row => {
    row.addEventListener("click", () => {
      const task = getState().tasks.find(t => t.id === row.dataset.taskId);
      if (task) openTaskForm(task);
    });
  });
}

function taskRow(task, blockedIds) {
  const { projects } = getState();
  const project   = projects.find(p => p.id === task.projectId);
  const due       = fromTs(task.dueDate);
  const sched     = fromTs(task.scheduledStart);
  const isBlocked = blockedIds.includes(task.id);
  const now       = new Date();

  return `
    <tr data-task-id="${task.id}" class="${task.completed ? "row-completed" : ""} ${isBlocked ? "row-blocked" : ""}">
      <td>${task.completed ? "✅" : "⬜"}</td>
      <td class="task-name-cell">
        ${esc(task.name)}
        ${isBlocked ? ` <span class="blocked-badge">🚫</span>` : ""}
        ${task.trelloUrl ? ` <a href="${task.trelloUrl}" target="_blank" rel="noopener" class="trello-card-link" onclick="event.stopPropagation()" title="Open in Trello">↗</a>` : ""}
      </td>
      <td>${project ? esc(project.name) : "—"}</td>
      <td>${priorityBadge(task.priority)}</td>
      <td class="${due && due < now && !task.completed ? "overdue" : ""}">${due ? formatDate(due) : "—"}</td>
      <td>${task.estimatedHours}h</td>
      <td>${sched ? formatDate(sched) : "—"}</td>
      <td class="task-actions" onclick="event.stopPropagation()">
        <button class="btn-icon task-edit-btn" data-task-id="${task.id}" title="Edit scheduling">⚙️</button>
      </td>
    </tr>
  `;
}

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
