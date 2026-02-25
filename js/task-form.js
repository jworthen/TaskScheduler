/**
 * task-form.js — Create / edit task modal
 */

import { getState } from "./store.js";
import { createTask, updateTask, fromTs } from "./db.js";
import { openModal, closeModal, toast } from "./ui-utils.js";

/**
 * Open the task creation/editing modal.
 * @param {object|null} task  — existing task to edit, or null for new
 * @param {string|null} projectId — pre-select a project
 */
export function openTaskForm(task = null, projectId = null) {
  const { projects, settings } = getState();
  const categories = settings?.categories ?? [];
  const workSlots  = settings?.workSlots  ?? [];
  const isEdit = !!task;

  // Build project options
  const projectOptions = projects.map(p =>
    `<option value="${p.id}" ${(task?.projectId ?? projectId) === p.id ? "selected" : ""}>${p.name}</option>`
  ).join("");

  // Build category options
  const catOptions = `<option value="">— none —</option>` + categories.map(c =>
    `<option value="${c.id}" ${task?.categoryId === c.id ? "selected" : ""}>${c.name}</option>`
  ).join("");

  // Initial stage options (re-rendered via JS when project changes)
  const selectedProject = projects.find(p => p.id === (task?.projectId ?? projectId));
  const stageOptions = buildStageOptions(selectedProject, task?.stageId);

  const existingTasks = getState().tasks.filter(t => t.id !== task?.id);
  const blockerOptions = existingTasks.map(t =>
    `<option value="${t.id}" ${task?.blockerIds?.includes(t.id) ? "selected" : ""}>${t.name}</option>`
  ).join("");

  const dueVal  = task?.dueDate ? toDateInputValue(fromTs(task.dueDate)) : "";
  const recFreq = task?.recurringFrequency ?? "weekly";
  const recInt  = task?.recurringInterval  ?? 7;

  const html = `
    <form id="task-form" autocomplete="off">
      <div class="form-row">
        <label>Task name <span class="req">*</span></label>
        <input type="text" id="tf-name" required maxlength="200"
               value="${esc(task?.name ?? "")}" placeholder="e.g. Draft tulip block pattern" />
      </div>
      <div class="form-row">
        <label>Project <span class="req">*</span></label>
        <select id="tf-project" required>
          <option value="">— select project —</option>
          ${projectOptions}
        </select>
      </div>
      <div class="form-row">
        <label>Stage</label>
        <select id="tf-stage">
          <option value="">— select stage —</option>
          ${stageOptions}
        </select>
      </div>
      <div class="form-row">
        <label>Category</label>
        <select id="tf-category">${catOptions}</select>
      </div>
      <div class="form-row">
        <label>Preferred time slot <span class="hint">(for scheduling)</span></label>
        <select id="tf-work-slot">
          <option value="">— any time —</option>
          ${workSlots.map(s =>
            `<option value="${s.id}" ${task?.workSlotId === s.id ? "selected" : ""}>${s.name} (${s.startTime}–${s.endTime})</option>`
          ).join("")}
        </select>
      </div>
      <div class="form-2col">
        <div class="form-row">
          <label>Estimated hours</label>
          <input type="number" id="tf-hours" min="0.25" max="999" step="0.25"
                 value="${task?.estimatedHours ?? 1}" />
        </div>
        <div class="form-row">
          <label>Priority</label>
          <select id="tf-priority">
            <option value="high"   ${task?.priority === "high"   ? "selected" : ""}>🔴 High</option>
            <option value="medium" ${(task?.priority ?? "medium") === "medium" ? "selected" : ""}>🟡 Medium</option>
            <option value="low"    ${task?.priority === "low"    ? "selected" : ""}>🟢 Low</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <label>Due date</label>
        <input type="date" id="tf-due" value="${dueVal}" />
      </div>
      <div class="form-row">
        <label>Blockers <span class="hint">(tasks that must be done first)</span></label>
        <select id="tf-blockers" multiple size="4" class="multi-select">
          ${blockerOptions}
        </select>
      </div>
      <div class="form-row">
        <label class="toggle-label">
          <input type="checkbox" id="tf-recurring" ${task?.recurring ? "checked" : ""} />
          Recurring task
        </label>
      </div>
      <div id="tf-recurring-panel" class="${task?.recurring ? "" : "hidden"}">
        <div class="form-row">
          <label>Frequency</label>
          <select id="tf-freq">
            <option value="daily"   ${recFreq === "daily"   ? "selected" : ""}>Daily</option>
            <option value="weekly"  ${recFreq === "weekly"  ? "selected" : ""}>Weekly</option>
            <option value="monthly" ${recFreq === "monthly" ? "selected" : ""}>Monthly</option>
            <option value="custom"  ${recFreq === "custom"  ? "selected" : ""}>Custom interval</option>
          </select>
        </div>
        <div class="form-row" id="tf-interval-row" style="${recFreq === "custom" ? "" : "display:none"}">
          <label>Every N days</label>
          <input type="number" id="tf-interval" min="1" max="365" value="${recInt}" />
        </div>
      </div>
      <div class="form-row">
        <label>Notes</label>
        <textarea id="tf-notes" rows="3" maxlength="2000">${esc(task?.notes ?? "")}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="tf-cancel">Cancel</button>
        <button type="submit" class="btn-primary">${isEdit ? "Save changes" : "Add task ✨"}</button>
      </div>
    </form>
  `;

  openModal(isEdit ? "Edit Task" : "New Task ✨", html);

  // Wire up project → stage cascade
  const tfProject = document.getElementById("tf-project");
  const tfStage   = document.getElementById("tf-stage");
  tfProject.addEventListener("change", () => {
    const proj = projects.find(p => p.id === tfProject.value);
    tfStage.innerHTML = `<option value="">— select stage —</option>` + buildStageOptions(proj, null);
  });

  // Recurring toggle
  const tfRecurring = document.getElementById("tf-recurring");
  const panel       = document.getElementById("tf-recurring-panel");
  tfRecurring.addEventListener("change", () => panel.classList.toggle("hidden", !tfRecurring.checked));

  // Freq → interval row
  const tfFreq        = document.getElementById("tf-freq");
  const intervalRow   = document.getElementById("tf-interval-row");
  tfFreq.addEventListener("change", () => {
    intervalRow.style.display = tfFreq.value === "custom" ? "" : "none";
  });

  document.getElementById("tf-cancel").addEventListener("click", closeModal);

  document.getElementById("task-form").addEventListener("submit", async e => {
    e.preventDefault();
    await submitTaskForm(task);
  });
}

async function submitTaskForm(existingTask) {
  const name      = document.getElementById("tf-name").value.trim();
  const projectId = document.getElementById("tf-project").value;
  const stageId   = document.getElementById("tf-stage").value || null;
  const catId     = document.getElementById("tf-category").value || null;
  const hours     = parseFloat(document.getElementById("tf-hours").value) || 1;
  const priority  = document.getElementById("tf-priority").value;
  const dueRaw    = document.getElementById("tf-due").value;
  const recurring = document.getElementById("tf-recurring").checked;
  const freq      = document.getElementById("tf-freq").value;
  const interval  = parseInt(document.getElementById("tf-interval").value) || 7;
  const notes     = document.getElementById("tf-notes").value.trim();

  const blockerSelect = document.getElementById("tf-blockers");
  const blockerIds    = Array.from(blockerSelect.selectedOptions).map(o => o.value);
  const workSlotId    = document.getElementById("tf-work-slot").value || null;

  if (!name) { toast("Task name is required", "error"); return; }
  if (!projectId) { toast("Please select a project", "error"); return; }

  const data = {
    name,
    projectId,
    stageId,
    categoryId:         catId,
    estimatedHours:     hours,
    priority,
    dueDate:            dueRaw ? new Date(dueRaw + "T23:59:59") : null,
    blockerIds,
    recurring,
    recurringFrequency: recurring ? freq      : null,
    recurringInterval:  recurring && freq === "custom" ? interval : null,
    notes,
    workSlotId,
  };

  try {
    if (existingTask) {
      await updateTask(existingTask.id, data);
      toast("Task updated!", "success");
    } else {
      await createTask(data);
      toast("Task created! 🎉", "success");
    }
    closeModal();
  } catch (err) {
    console.error(err);
    toast("Error saving task: " + err.message, "error");
  }
}

function buildStageOptions(project, selectedStageId) {
  if (!project?.stages?.length) return "";
  const sorted = [...project.stages].sort((a, b) => a.order - b.order);
  return sorted.map(s =>
    `<option value="${s.id}" ${selectedStageId === s.id ? "selected" : ""}>${s.name}</option>`
  ).join("");
}

function toDateInputValue(date) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
