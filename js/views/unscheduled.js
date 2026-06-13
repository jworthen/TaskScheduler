/**
 * views/unscheduled.js — Trello cards that have no due date yet
 *
 * Surfaces every open card without a due date so they can be triaged.
 * Due dates live in Trello, so each row links out to the card to add one.
 * Clicking a row opens the scheduling metadata modal (same as All Cards).
 */

import { getState } from "../store.js";
import { fromTs } from "../db.js";
import { openTaskForm } from "../task-form.js";
import { priorityBadge, statusBadge } from "../ui-utils.js";

export function renderUnscheduled() {
  const el = document.getElementById("view-unscheduled");
  const { projects } = getState();

  el.innerHTML = `
    <div class="view-header">
      <h2>Unscheduled</h2>
      <div class="header-actions">
        <span class="settings-hint" style="font-size:0.85rem;">Cards with no due date — open in Trello to add one</span>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters-bar">
      <select id="unsched-filter-project">
        <option value="">All projects</option>
        ${projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}
      </select>
      <select id="unsched-filter-priority">
        <option value="">All priorities</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <input type="text" id="unsched-filter-search" placeholder="Search cards..." />
    </div>

    <!-- Card table -->
    <div id="unsched-table-container">
      <!-- rendered by applyFilters -->
    </div>
  `;

  ["unsched-filter-project","unsched-filter-priority","unsched-filter-search"]
    .forEach(id => el.querySelector("#" + id).addEventListener("input", () => applyFilters(el)));

  applyFilters(el);
}

function applyFilters(el) {
  const { tasks } = getState();

  const projectId = el.querySelector("#unsched-filter-project").value;
  const priority  = el.querySelector("#unsched-filter-priority").value;
  const search    = el.querySelector("#unsched-filter-search").value.toLowerCase();

  // Unscheduled = open card with no due date
  let filtered = tasks.filter(t => {
    if (t.completed) return false;
    if (fromTs(t.dueDate)) return false;
    if (projectId && t.projectId !== projectId) return false;
    if (priority  && t.priority  !== priority)  return false;
    if (search && !t.name.toLowerCase().includes(search)) return false;
    return true;
  });

  const po = { high: 0, medium: 1, low: 2 };
  filtered.sort((a, b) => {
    // Higher priority first, then alphabetical
    const pd = (po[a.priority] ?? 1) - (po[b.priority] ?? 1);
    if (pd !== 0) return pd;
    return a.name.localeCompare(b.name);
  });

  const container = el.querySelector("#unsched-table-container");
  if (!filtered.length) {
    container.innerHTML = `<p class="empty-state">🎉 Every card has a due date.</p>`;
    return;
  }

  container.innerHTML = `
    <table class="task-table">
      <thead>
        <tr>
          <th>Card</th>
          <th>Board</th>
          <th>Priority</th>
          <th>Est. hrs</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(taskRow).join("")}
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

function taskRow(task) {
  const { projects } = getState();
  const project = projects.find(p => p.id === task.projectId);
  const stage   = project?.stages?.find(s => s.id === task.stageId);
  const isActive = !task.completed && task.status === "active";
  const isOnHold = !task.completed && task.status === "onhold";

  return `
    <tr data-task-id="${task.id}" class="${isActive ? "row-active" : ""} ${isOnHold ? "row-onhold" : ""}">
      <td class="task-name-cell">
        ${esc(task.name)}
        ${task.completed ? "" : statusBadge(task.status)}
        ${task.trelloUrl ? ` <a href="${task.trelloUrl}" target="_blank" rel="noopener" class="trello-card-link" onclick="event.stopPropagation()" title="Open in Trello">↗</a>` : ""}
      </td>
      <td>${project ? esc(project.name) : "—"}${stage ? ` <span class="task-list-name">(${esc(stage.name)})</span>` : ""}</td>
      <td>${priorityBadge(task.priority)}</td>
      <td>${task.estimatedHours}h</td>
      <td class="task-actions" onclick="event.stopPropagation()">
        <button class="btn-icon task-edit-btn" data-task-id="${task.id}" title="Edit scheduling">⚙️</button>
      </td>
    </tr>
  `;
}

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
