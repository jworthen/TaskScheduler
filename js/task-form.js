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
import { openModal, closeModal, toast } from "./ui-utils.js";
import { rerenderCurrent } from "./main.js";

/**
 * Open the scheduling metadata modal for a Trello card.
 * @param {object} task — task object from the store (already converted from Trello card)
 */
export function openTaskForm(task) {
  if (!task) return;

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

    const patch = {
      estimatedHours: hours,
    };
    if (priority) patch.priority = priority;

    saveSchedMeta(task.id, patch);

    // Update in-memory store so views reflect the change immediately
    const { tasks: currentTasks } = getState();
    const updated = currentTasks.map(t =>
      t.id === task.id ? { ...t, ...patch } : t
    );
    setState({ tasks: updated });

    closeModal();
    toast("Scheduling info saved!", "success");
    rerenderCurrent();
  });
}

function esc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
