/**
 * views/tasks.js — All tasks list with filtering and sorting
 */

import { getState, getBlockedTasks } from "../store.js";
import { fromTs, completeTask, deleteTask } from "../db.js";
import { openTaskForm } from "../task-form.js";
import { categoryChip, priorityBadge, formatDate, toast, confirmAction } from "../ui-utils.js";

export function renderTasks() {
  const el = document.getElementById("view-tasks");
  const { tasks, projects, settings } = getState();
  const categories = settings?.categories ?? [];

  el.innerHTML = `
    <div class="view-header">
      <h2>All Tasks ✅</h2>
      <div class="header-actions">
        <button class="btn-primary" id="tasks-new">+ New Task</button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters-bar">
      <select id="filter-project">
        <option value="">All projects</option>
        ${projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}
      </select>
      <select id="filter-category">
        <option value="">All categories</option>
        ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}
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

  el.querySelector("#tasks-new").addEventListener("click", () => openTaskForm());

  // Filter listeners
  ["filter-project","filter-category","filter-priority","filter-status","filter-search"]
    .forEach(id => el.querySelector("#" + id).addEventListener("input", () => applyFilters(el)));

  applyFilters(el);
}

function applyFilters(el) {
  const { tasks, settings } = getState();
  const categories = settings?.categories ?? [];
  const blocked    = getBlockedTasks().map(t => t.id);

  const projectId  = el.querySelector("#filter-project").value;
  const categoryId = el.querySelector("#filter-category").value;
  const priority   = el.querySelector("#filter-priority").value;
  const status     = el.querySelector("#filter-status").value;
  const search     = el.querySelector("#filter-search").value.toLowerCase();

  let filtered = tasks.filter(t => {
    if (projectId  && t.projectId  !== projectId)  return false;
    if (categoryId && t.categoryId !== categoryId)  return false;
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
          <th>Task</th>
          <th>Project</th>
          <th>Category</th>
          <th>Priority</th>
          <th>Due</th>
          <th>Hours</th>
          <th>Scheduled</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(t => taskRow(t, categories, blocked)).join("")}
      </tbody>
    </table>
  `;

  // Complete toggle
  container.querySelectorAll(".complete-toggle").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const task   = getState().tasks.find(t => t.id === taskId);
      if (!task) return;
      try {
        await completeTask(task);
        toast(task.recurring ? "Done! Next occurrence created 🔄" : "Done! 🎉", "success");
      } catch (err) {
        toast("Error: " + err.message, "error");
      }
    });
  });

  // Edit
  container.querySelectorAll(".task-edit-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const task = getState().tasks.find(t => t.id === btn.dataset.taskId);
      if (task) openTaskForm(task);
    });
  });

  // Delete
  container.querySelectorAll(".task-delete-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirmAction("Delete this task?")) return;
      try {
        await deleteTask(btn.dataset.taskId);
        toast("Task deleted.", "info");
      } catch (err) {
        toast("Error: " + err.message, "error");
      }
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

function taskRow(task, categories, blockedIds) {
  const { projects } = getState();
  const cat     = categories.find(c => c.id === task.categoryId);
  const project = projects.find(p => p.id === task.projectId);
  const due     = fromTs(task.dueDate);
  const sched   = fromTs(task.scheduledStart);
  const isBlocked = blockedIds.includes(task.id);
  const now     = new Date();

  return `
    <tr data-task-id="${task.id}" class="${task.completed ? "row-completed" : ""} ${isBlocked ? "row-blocked" : ""}">
      <td>
        <button class="complete-toggle" data-task-id="${task.id}" title="Toggle complete">
          ${task.completed ? "✅" : "⬜"}
        </button>
      </td>
      <td class="task-name-cell">
        ${esc(task.name)}
        ${task.recurring ? ` <span class="recurring-badge">🔄</span>` : ""}
        ${isBlocked ? ` <span class="blocked-badge">🚫</span>` : ""}
      </td>
      <td>${project ? esc(project.name) : "—"}</td>
      <td>${cat ? categoryChip(cat) : "—"}</td>
      <td>${priorityBadge(task.priority)}</td>
      <td class="${due && due < now && !task.completed ? "overdue" : ""}">${due ? formatDate(due) : "—"}</td>
      <td>${task.estimatedHours}h</td>
      <td>${sched ? formatDate(sched) : "—"}</td>
      <td class="task-actions" onclick="event.stopPropagation()">
        <button class="btn-icon task-edit-btn"   data-task-id="${task.id}" title="Edit">✏️</button>
        <button class="btn-icon task-delete-btn" data-task-id="${task.id}" title="Delete">🗑️</button>
      </td>
    </tr>
  `;
}

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
