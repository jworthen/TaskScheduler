/**
 * project-form.js — Create / edit project modal
 */

import { getState } from "./store.js";
import { createProject, updateProject, deleteProject } from "./db.js";
import { openModal, closeModal, toast, confirmAction } from "./ui-utils.js";

export function openProjectForm(project = null) {
  const isEdit = !!project;
  const stages = project?.stages
    ? [...project.stages].sort((a, b) => a.order - b.order)
    : [
        { id: crypto.randomUUID(), name: "Research",    order: 0 },
        { id: crypto.randomUUID(), name: "Drafting",    order: 1 },
        { id: crypto.randomUUID(), name: "Testing",     order: 2 },
        { id: crypto.randomUUID(), name: "Photography", order: 3 },
        { id: crypto.randomUUID(), name: "Launch",      order: 4 },
      ];

  const stageRows = stages.map((s, i) => stageRow(s.id, s.name, i)).join("");

  const html = `
    <form id="proj-form" autocomplete="off">
      <div class="form-row">
        <label>Project name <span class="req">*</span></label>
        <input type="text" id="pf-name" required maxlength="100"
               value="${esc(project?.name ?? "")}" placeholder="e.g. Tulip Garden Pattern" />
      </div>
      <div class="form-row">
        <label>Pipeline stages <span class="hint">(drag to reorder)</span></label>
        <div id="pf-stages" class="stages-list">
          ${stageRows}
        </div>
        <button type="button" class="btn-ghost btn-sm mt-sm" id="pf-add-stage">+ Add stage</button>
      </div>
      <div class="form-actions">
        ${isEdit ? `<button type="button" class="btn-danger" id="pf-delete">Delete project</button>` : ""}
        <button type="button" class="btn-ghost" id="pf-cancel">Cancel</button>
        <button type="submit" class="btn-primary">${isEdit ? "Save changes" : "Create project 🌟"}</button>
      </div>
    </form>
  `;

  openModal(isEdit ? "Edit Project" : "New Project 🌟", html);

  document.getElementById("pf-cancel").addEventListener("click", closeModal);

  document.getElementById("pf-add-stage").addEventListener("click", () => {
    const list  = document.getElementById("pf-stages");
    const count = list.querySelectorAll(".stage-row").length;
    list.insertAdjacentHTML("beforeend", stageRow(crypto.randomUUID(), "", count));
  });

  if (isEdit) {
    document.getElementById("pf-delete").addEventListener("click", async () => {
      if (!confirmAction(`Delete project "${project.name}" and all its tasks? This cannot be undone.`)) return;
      try {
        await deleteProject(project.id);
        toast("Project deleted.", "info");
        closeModal();
      } catch (err) {
        toast("Error: " + err.message, "error");
      }
    });
  }

  // Drag-to-reorder stages (simple mouse-based)
  enableStageDrag();

  document.getElementById("proj-form").addEventListener("submit", async e => {
    e.preventDefault();
    await submitProjectForm(project);
  });
}

async function submitProjectForm(existing) {
  const name = document.getElementById("pf-name").value.trim();
  if (!name) { toast("Project name is required", "error"); return; }

  const stageEls = document.querySelectorAll("#pf-stages .stage-row");
  const stages = Array.from(stageEls).map((el, i) => ({
    id:    el.dataset.stageId,
    name:  el.querySelector(".stage-name-input").value.trim(),
    order: i,
  })).filter(s => s.name);

  if (!stages.length) { toast("Add at least one stage", "error"); return; }

  try {
    if (existing) {
      await updateProject(existing.id, { name, stages });
      toast("Project updated!", "success");
    } else {
      await createProject({ name, stages });
      toast("Project created! 🌟", "success");
    }
    closeModal();
  } catch (err) {
    toast("Error: " + err.message, "error");
  }
}

function stageRow(id, name, order) {
  return `
    <div class="stage-row" data-stage-id="${id}" draggable="true">
      <span class="drag-handle">⠿</span>
      <input type="text" class="stage-name-input" value="${esc(name)}"
             placeholder="Stage name" maxlength="60" />
      <button type="button" class="btn-icon stage-remove" title="Remove stage">✕</button>
    </div>
  `;
}

function enableStageDrag() {
  const list = document.getElementById("pf-stages");
  if (!list) return;

  list.addEventListener("click", e => {
    if (e.target.classList.contains("stage-remove")) {
      e.target.closest(".stage-row").remove();
    }
  });

  let dragging = null;
  list.addEventListener("dragstart", e => {
    dragging = e.target.closest(".stage-row");
    dragging?.classList.add("dragging");
  });
  list.addEventListener("dragend", () => {
    dragging?.classList.remove("dragging");
    dragging = null;
  });
  list.addEventListener("dragover", e => {
    e.preventDefault();
    const after = getDragAfterElement(list, e.clientY);
    if (dragging) {
      if (after) list.insertBefore(dragging, after);
      else list.appendChild(dragging);
    }
  });
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".stage-row:not(.dragging)")];
  return els.reduce((closest, el) => {
    const box = el.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: el };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
