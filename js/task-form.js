/**
 * task-form.js — Scheduling metadata modal for Trello cards
 *
 * Since task data (name, description, due date, list) is managed in Trello,
 * this modal only exposes the scheduling metadata that lives locally:
 *   - Estimated hours (for the auto-scheduler)
 *   - Priority override (defaults to label colour mapping)
 *
 * A "Open in Trello" link is provided to edit the card itself.
 */

import { getState, setState } from "./store.js";
import { saveSchedMeta } from "./trello.js";
import { runScheduler } from "./scheduler.js";
import { openModal, closeModal, toast } from "./ui-utils.js";
import { rerenderCurrent } from "./main.js";

/**
 * Open the scheduling metadata modal for a Trello card.
 * @param {object} task — task object from the store (already converted from Trello card)
 */
export function openTaskForm(task) {
  if (!task) return;

  // Candidate blockers: other open cards in the same Trello list, sorted by name.
  const { tasks: allTasks } = getState();
  const siblings = allTasks
    .filter(t => t.id !== task.id && t.stageId === task.stageId && !t.completed)
    .sort((a, b) => a.name.localeCompare(b.name));
  const currentBlockers = new Set(task.blockerIds ?? []);

  const html = `
    <form id="sched-form" autocomplete="off">
      <div class="form-row">
        <label>Card</label>
        <div class="task-name-display">
          <strong>${esc(task.name)}</strong>
          ${task.trelloUrl
            ? `<a href="${task.trelloUrl}" target="_blank" rel="noopener" class="trello-link">Open in Trello ↗</a>`
            : ""}
        </div>
      </div>

      <div class="form-2col">
        <div class="form-row">
          <label>Estimated hours <span class="hint">(for scheduler)</span></label>
          <input type="number" id="sf-hours" min="0.25" max="999" step="0.25"
                 value="${task.estimatedHours ?? 1}" />
        </div>
        <div class="form-row">
          <label>Priority override <span class="hint">(overrides label colour)</span></label>
          <select id="sf-priority">
            <option value="">(use Trello label)</option>
            <option value="high"   ${task.priority === "high"   ? "selected" : ""}>High</option>
            <option value="medium" ${task.priority === "medium" ? "selected" : ""}>Medium</option>
            <option value="low"    ${task.priority === "low"    ? "selected" : ""}>Low</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <label>Status <span class="hint">(Active pins to the top; On Hold sinks to the bottom)</span></label>
        <select id="sf-status">
          <option value="todo"   ${task.status === "active" || task.status === "onhold" ? "" : "selected"}>To Do</option>
          <option value="active" ${task.status === "active" ? "selected" : ""}>Active (in progress)</option>
          <option value="onhold" ${task.status === "onhold" ? "selected" : ""}>On Hold (paused)</option>
        </select>
      </div>

      <div class="form-row">
        <label>Blocked by <span class="hint">(cards in this list that must finish first)</span></label>
        ${siblings.length
          ? `<div class="blocker-picker" id="sf-blockers">
               ${siblings.map(s => `
                 <label class="blocker-option">
                   <input type="checkbox" value="${esc(s.id)}" ${currentBlockers.has(s.id) ? "checked" : ""} />
                   <span>${esc(s.name)}</span>
                 </label>`).join("")}
             </div>`
          : `<p class="hint">No other open cards in this list to block on.</p>`}
      </div>

      <div class="form-actions">
        <button type="button" class="btn-ghost" id="sf-cancel">Cancel</button>
        <button type="submit" class="btn-primary">Save scheduling info</button>
      </div>
    </form>
  `;

  openModal("Scheduling Settings", html);

  document.getElementById("sf-cancel").addEventListener("click", closeModal);

  document.getElementById("sched-form").addEventListener("submit", async e => {
    e.preventDefault();

    const hours    = parseFloat(document.getElementById("sf-hours").value) || 1;
    const priority = document.getElementById("sf-priority")?.value || null;
    const status   = document.getElementById("sf-status")?.value || "todo";

    const patch = {
      estimatedHours: hours,
      status,
    };
    if (priority) patch.priority = priority;

    // Collect blockers from the picker (only present when this list has sibling cards).
    // Preserve any existing blockers that live outside this list — the picker only
    // covers same-list cards, so we must not silently drop the others.
    let blockersChanged = false;
    const blockerPicker = document.getElementById("sf-blockers");
    if (blockerPicker) {
      const siblingIds = new Set(siblings.map(s => s.id));
      const checked    = Array.from(blockerPicker.querySelectorAll("input:checked")).map(i => i.value);
      const preserved  = Array.from(currentBlockers).filter(id => !siblingIds.has(id));
      const next       = [...checked, ...preserved];
      patch.blockerIds = next;
      blockersChanged  = next.length !== currentBlockers.size
        || next.some(id => !currentBlockers.has(id));
    }

    saveSchedMeta(task.id, patch);

    // Update in-memory store so views reflect the change immediately
    const { tasks: currentTasks } = getState();
    const updated = currentTasks.map(t =>
      t.id === task.id ? { ...t, ...patch } : t
    );
    setState({ tasks: updated });

    closeModal();
    toast("Scheduling info saved!", "success");

    // Changing blockers alters dependency order — reflow the schedule
    if (blockersChanged) await runScheduler();
    rerenderCurrent();
  });
}

function esc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
