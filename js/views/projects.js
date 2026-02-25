/**
 * views/projects.js — Kanban board per project, with stage columns
 */

import { getState } from "../store.js";
import { fromTs, updateTask } from "../db.js";
import { openTaskForm } from "../task-form.js";
import { openProjectForm } from "../project-form.js";
import { priorityBadge, toast, formatDate } from "../ui-utils.js";

export function renderProjects() {
  const el = document.getElementById("view-projects");
  const { projects, tasks } = getState();

  // Pick selected project (from dashboard chip click or first)
  let selectedId = window.__selectedProjectId ?? projects[0]?.id ?? null;
  if (!projects.find(p => p.id === selectedId)) selectedId = projects[0]?.id ?? null;

  el.innerHTML = `
    <div class="view-header">
      <h2>Projects 📁</h2>
      <div class="header-actions">
        <button class="btn-secondary" id="proj-new-project">+ New Project</button>
        ${selectedId ? `<button class="btn-ghost" id="proj-edit-project">✏ Edit project</button>` : ""}
        <button class="btn-primary"   id="proj-new-task" ${!selectedId ? "disabled" : ""}>+ Task</button>
      </div>
    </div>

    <!-- Project tabs -->
    <div class="project-tabs">
      ${projects.map(p => `
        <button class="project-tab ${p.id === selectedId ? "active" : ""}" data-project-id="${p.id}">
          ${esc(p.name)}
        </button>
      `).join("")}
      ${!projects.length ? `<p class="empty-state">No projects yet.</p>` : ""}
    </div>

    <!-- Board -->
    <div id="kanban-board" class="kanban-board">
      ${selectedId ? buildKanban(selectedId, projects, tasks) : `<p class="empty-state">Select or create a project.</p>`}
    </div>
  `;

  // Tab switching
  el.querySelectorAll(".project-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      window.__selectedProjectId = tab.dataset.projectId;
      renderProjects();
    });
  });

  el.querySelector("#proj-new-project").addEventListener("click", () => openProjectForm());
  if (selectedId) {
    const selectedProject = projects.find(p => p.id === selectedId);
    el.querySelector("#proj-edit-project")?.addEventListener("click", () => openProjectForm(selectedProject));
    el.querySelector("#proj-new-task").addEventListener("click", () => openTaskForm(null, selectedId));
  }

  // Task cards
  el.querySelectorAll(".kanban-task-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.defaultPrevented) return;
      const task = getState().tasks.find(t => t.id === card.dataset.taskId);
      if (task) openTaskForm(task);
    });
  });

  // Drag-and-drop between columns
  if (selectedId) initKanbanDrag(el, selectedId);
}

function buildKanban(projectId, projects, tasks) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return "";

  const stages  = [...(project.stages ?? [])].sort((a, b) => a.order - b.order);
  const projTasks = tasks.filter(t => t.projectId === projectId);

  return `
    <div class="kanban-columns">
      ${stages.map(stage => {
        const stageTasks = projTasks.filter(t => t.stageId === stage.id);
        const colCover = stage.imageUrl
          ? `<div class="kanban-col-cover" style="background-image:url('${esc(stage.imageUrl)}')"></div>`
          : "";
        return `
          <div class="kanban-col" data-stage-id="${stage.id}">
            ${colCover}
            <div class="kanban-col-header">
              <span class="col-name">${esc(stage.name)}</span>
              <span class="col-count">${stageTasks.length}</span>
            </div>
            <div class="kanban-col-body" data-stage-id="${stage.id}">
              ${stageTasks.map(t => kanbanCard(t)).join("")}
              <button class="btn-ghost kanban-add-btn" data-stage-id="${stage.id}">+ Add task</button>
            </div>
          </div>
        `;
      }).join("")}

      <!-- Tasks with no stage -->
      ${(() => {
        const unstaged = projTasks.filter(t => !t.stageId);
        if (!unstaged.length) return "";
        return `
          <div class="kanban-col" data-stage-id="">
            <div class="kanban-col-header">
              <span class="col-name">Unstaged</span>
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
    <div class="kanban-task-card ${task.completed ? "task-completed" : ""} ${task.blockerIds?.length ? "is-blocked" : ""}"
         data-task-id="${task.id}"
         draggable="true">
      <div class="card-name">${esc(task.name)}</div>
      <div class="card-meta">
        ${priorityBadge(task.priority)}
      </div>
      <div class="card-footer">
        ${due ? `<span class="card-due ${due < now ? "overdue" : ""}">📅 ${formatDate(due)}</span>` : ""}
        <span class="card-hours">⏱ ${task.estimatedHours}h</span>
        ${task.completed ? `<span class="done-badge">✅</span>` : ""}
        ${task.blockerIds?.length ? `<span class="blocked-badge">🚫</span>` : ""}
        ${task.recurring ? `<span class="recurring-badge">🔄</span>` : ""}
      </div>
    </div>
  `;
}

function initKanbanDrag(container, projectId) {
  let dragging = null;

  // Add-task buttons in column headers
  container.querySelectorAll(".kanban-add-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      openTaskForm(null, projectId);
    });
  });

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
    col.addEventListener("drop", async e => {
      e.preventDefault();
      col.classList.remove("drag-over");
      if (!dragging) return;

      const taskId  = dragging.dataset.taskId;
      const stageId = col.dataset.stageId || null;

      // Insert card visually
      const afterEl = getDragAfterCard(col, e.clientY);
      if (afterEl) col.insertBefore(dragging, afterEl);
      else {
        const addBtn = col.querySelector(".kanban-add-btn");
        if (addBtn) col.insertBefore(dragging, addBtn);
        else col.appendChild(dragging);
      }

      try {
        await updateTask(taskId, { stageId });
        toast("Stage updated!", "success");
      } catch (err) {
        toast("Could not update stage: " + err.message, "error");
      }
    });
  });
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
