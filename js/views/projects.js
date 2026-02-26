/**
 * views/projects.js — Kanban board view backed by Trello
 *
 * Boards → Projects (tabs)
 * Lists  → Columns
 * Cards  → Task cards
 *
 * Boards and lists are managed in Trello. Dragging cards between columns
 * calls the Trello API to move the card to the new list.
 * Clicking a card opens the scheduling metadata modal.
 */

import { getState, setState } from "../store.js";
import { fromTs } from "../db.js";
import { openTaskForm } from "../task-form.js";
import { priorityBadge, formatDate } from "../ui-utils.js";

export function renderProjects() {
  const el = document.getElementById("view-projects");
  const { projects, tasks } = getState();

  // Pick selected board
  let selectedId = window.__selectedProjectId ?? projects[0]?.id ?? null;
  if (!projects.find(p => p.id === selectedId)) selectedId = projects[0]?.id ?? null;

  const selectedBoard = projects.find(p => p.id === selectedId);

  el.innerHTML = `
    <div class="view-header">
      <h2>Projects 📁</h2>
      <div class="header-actions">
        ${selectedBoard?.url
          ? `<a href="${selectedBoard.url}" target="_blank" rel="noopener" class="btn-ghost">Open in Trello ↗</a>`
          : ""}
      </div>
    </div>

    <!-- Board tabs -->
    <div class="project-tabs">
      ${projects.map(p => `
        <button class="project-tab ${p.id === selectedId ? "active" : ""}" data-project-id="${p.id}">
          ${esc(p.name)}
        </button>
      `).join("")}
      ${!projects.length ? `<p class="empty-state">No Trello boards found. Make sure you're connected in Settings.</p>` : ""}
    </div>

    <!-- Kanban board -->
    <div id="kanban-board" class="kanban-board">
      ${selectedId ? buildKanban(selectedId, projects, tasks) : `<p class="empty-state">Select a board above.</p>`}
    </div>
  `;

  // Tab switching
  el.querySelectorAll(".project-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      window.__selectedProjectId = tab.dataset.projectId;
      renderProjects();
    });
  });

  // Card click → scheduling metadata modal
  el.querySelectorAll(".kanban-task-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.defaultPrevented) return;
      const task = getState().tasks.find(t => t.id === card.dataset.taskId);
      if (task) openTaskForm(task);
    });
  });

  // Drag-and-drop between columns
  if (selectedId) initKanbanDrag(el);
}

function buildKanban(boardId, projects, tasks) {
  const project = projects.find(p => p.id === boardId);
  if (!project) return "";

  const stages     = [...(project.stages ?? [])].sort((a, b) => a.order - b.order);
  const boardTasks = tasks.filter(t => t.projectId === boardId);

  return `
    <div class="kanban-columns">
      ${stages.map(stage => {
        const stageTasks = boardTasks.filter(t => t.stageId === stage.id);
        return `
          <div class="kanban-col" data-stage-id="${stage.id}">
            <div class="kanban-col-header">
              <span class="col-name">${esc(stage.name)}</span>
              <span class="col-count">${stageTasks.length}</span>
            </div>
            <div class="kanban-col-body" data-stage-id="${stage.id}">
              ${stageTasks.map(t => kanbanCard(t)).join("")}
            </div>
          </div>
        `;
      }).join("")}

      ${(() => {
        const unstaged = boardTasks.filter(t => !t.stageId);
        if (!unstaged.length) return "";
        return `
          <div class="kanban-col" data-stage-id="">
            <div class="kanban-col-header">
              <span class="col-name">Unsorted</span>
              <span class="col-count">${unstaged.length}</span>
            </div>
            <div class="kanban-col-body" data-stage-id="">
              ${unstaged.map(t => kanbanCard(t)).join("")}
            </div>
          </div>
        `;
      })()}
    </div>
  `;
}

function kanbanCard(task) {
  const due = fromTs(task.dueDate);
  const now = new Date();

  return `
    <div class="kanban-task-card ${task.completed ? "task-completed" : ""}"
         data-task-id="${task.id}"
         draggable="true">
      <div class="card-name">${esc(task.name)}</div>
      <div class="card-meta">
        ${priorityBadge(task.priority)}
        ${(task.labels ?? []).map(l => `<span class="trello-label" style="background:${labelColor(l.color)}">${esc(l.name ?? "")}</span>`).join("")}
      </div>
      <div class="card-footer">
        ${due ? `<span class="card-due ${due < now && !task.completed ? "overdue" : ""}">📅 ${formatDate(due)}</span>` : ""}
        <span class="card-hours">⏱ ${task.estimatedHours}h</span>
        ${task.completed ? `<span class="done-badge">✅</span>` : ""}
        ${task.trelloUrl ? `<a href="${task.trelloUrl}" target="_blank" rel="noopener" class="trello-card-link" title="Open in Trello" onclick="event.stopPropagation()">↗</a>` : ""}
      </div>
    </div>
  `;
}

function initKanbanDrag(container) {
  let dragging = null;

  container.addEventListener("dragstart", e => {
    const card = e.target.closest(".kanban-task-card");
    if (!card) return;
    dragging = card;
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => card.classList.add("dragging"), 0);
  });

  container.addEventListener("dragend", () => {
    dragging?.classList.remove("dragging");
    container.querySelectorAll(".kanban-col-body.drag-over")
      .forEach(el => el.classList.remove("drag-over"));
    dragging = null;
  });

  container.querySelectorAll(".kanban-col-body").forEach(col => {
    col.addEventListener("dragover", e => {
      e.preventDefault();
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", e => {
      e.preventDefault();
      col.classList.remove("drag-over");
      if (!dragging) return;

      const taskId = dragging.dataset.taskId;
      const listId = col.dataset.stageId || null;
      if (!listId) return; // don't allow dropping into the "Unsorted" pseudo-column

      // Optimistic UI
      const afterEl = getDragAfterCard(col, e.clientY);
      if (afterEl) col.insertBefore(dragging, afterEl);
      else col.appendChild(dragging);

      // Update store (local only — read-only mode, changes don't persist to Trello)
      const { tasks } = getState();
      const updated = tasks.map(t => t.id === taskId ? { ...t, stageId: listId } : t);
      setState({ tasks: updated });
    });
  });
}

/** Map Trello label colour names to CSS colour values. */
function labelColor(color) {
  const map = {
    red:    "#eb5a46", orange: "#ff9f1a", yellow: "#f2d600",
    green:  "#61bd4f", sky:    "#00c2e0", blue:   "#0079bf",
    purple: "#c377e0", pink:   "#ff78cb", lime:   "#51e898",
    black:  "#344563",
  };
  return map[color] ?? "#ddd";
}

function getDragAfterCard(col, y) {
  const cards = [...col.querySelectorAll(".kanban-task-card:not(.dragging)")];
  return cards.reduce((closest, card) => {
    const box    = card.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: card };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
