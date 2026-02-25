/**
 * project-form.js — Create / edit project modal
 */

import { getState } from "./store.js";
import { createProject, updateProject, deleteProject } from "./db.js";
import { openModal, closeModal, toast } from "./ui-utils.js";

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

  const stageRows = stages.map((s, i) => stageRow(s.id, s.name, i, s.imageUrl ?? "")).join("");

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
      ${isEdit ? `
      <div id="pf-delete-confirm" class="delete-confirm-panel hidden">
        <p class="delete-confirm-msg">
          This will permanently delete <strong>${esc(project.name)}</strong> and all its tasks.
          Type the project name to confirm:
        </p>
        <input type="text" id="pf-delete-name" placeholder="${esc(project.name)}" autocomplete="off" spellcheck="false" />
        <div class="delete-confirm-actions">
          <button type="button" class="btn-ghost btn-sm" id="pf-delete-back">← Cancel</button>
          <button type="button" class="btn-danger" id="pf-delete-confirm-btn" disabled>Delete forever</button>
        </div>
      </div>
      ` : ""}
    </form>
  `;

  openModal(isEdit ? "Edit Project" : "New Project 🌟", html);

  document.getElementById("pf-cancel").addEventListener("click", closeModal);

  document.getElementById("pf-add-stage").addEventListener("click", () => {
    const list  = document.getElementById("pf-stages");
    const count = list.querySelectorAll(".stage-row").length;
    list.insertAdjacentHTML("beforeend", stageRow(crypto.randomUUID(), "", count, ""));
  });

  if (isEdit) {
    const confirmPanel  = document.getElementById("pf-delete-confirm");
    const nameInput     = document.getElementById("pf-delete-name");
    const confirmBtn    = document.getElementById("pf-delete-confirm-btn");

    // "Delete project" → reveal the type-to-confirm panel
    document.getElementById("pf-delete").addEventListener("click", () => {
      confirmPanel.classList.remove("hidden");
      nameInput.focus();
    });

    // Enable confirm button only when typed name matches exactly
    nameInput.addEventListener("input", () => {
      confirmBtn.disabled = nameInput.value !== project.name;
    });

    // "← Cancel" within the panel hides it again
    document.getElementById("pf-delete-back").addEventListener("click", () => {
      confirmPanel.classList.add("hidden");
      nameInput.value = "";
      confirmBtn.disabled = true;
    });

    // Confirmed delete
    confirmBtn.addEventListener("click", async () => {
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
    id:       el.dataset.stageId,
    name:     el.querySelector(".stage-name-input").value.trim(),
    imageUrl: el.querySelector(".stage-img-input").value.trim() || null,
    order:    i,
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

function stageRow(id, name, order, imageUrl = "") {
  return `
    <div class="stage-row" data-stage-id="${id}" draggable="true">
      <span class="drag-handle">⠿</span>
      <input type="text" class="stage-name-input" value="${esc(name)}"
             placeholder="Stage name" maxlength="60" />
      <button type="button" class="btn-icon stage-img-btn" title="Set column cover image">🖼</button>
      <button type="button" class="btn-icon stage-remove" title="Remove stage">✕</button>
      <div class="stage-img-row hidden">
        ${imageUrl ? `<img class="stage-img-preview" src="${esc(imageUrl)}" alt="cover" />` : `<div class="stage-img-preview stage-img-placeholder"></div>`}
        <input type="url" class="stage-img-input" placeholder="Paste column cover image URL…" value="${esc(imageUrl)}" />
      </div>
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
    if (e.target.classList.contains("stage-img-btn")) {
      e.target.closest(".stage-row").querySelector(".stage-img-row").classList.toggle("hidden");
    }
  });

  list.addEventListener("input", e => {
    if (!e.target.classList.contains("stage-img-input")) return;
    const row    = e.target.closest(".stage-row");
    const imgRow = row.querySelector(".stage-img-row");
    const url    = e.target.value.trim();
    let preview  = imgRow.querySelector(".stage-img-preview");
    if (url) {
      if (preview.tagName !== "IMG") {
        const img = document.createElement("img");
        img.className = "stage-img-preview";
        img.alt = "cover";
        imgRow.replaceChild(img, preview);
        preview = img;
      }
      preview.src = url;
    } else {
      if (preview.tagName === "IMG") {
        const placeholder = document.createElement("div");
        placeholder.className = "stage-img-preview stage-img-placeholder";
        imgRow.replaceChild(placeholder, preview);
      }
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
