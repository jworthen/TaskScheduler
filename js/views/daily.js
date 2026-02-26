/**
 * views/daily.js — Daily Focus view
 */

import { getState, setState } from "../store.js";
import { fromTs } from "../db.js";
import { openTaskForm } from "../task-form.js";
import { completeCard } from "../trello.js";
import { formatTime, formatDate, priorityBadge, toast, addDays } from "../ui-utils.js";

let dayOffset = 0;

export function renderDaily() {
  const el = document.getElementById("view-daily");
  const { tasks } = getState();

  const base  = new Date(); base.setHours(0,0,0,0);
  const today = addDays(base, dayOffset);

  const dayTasks = tasks
    .filter(t => {
      const s = fromTs(t.scheduledStart);
      return s && s.toDateString() === today.toDateString();
    })
    .sort((a, b) => {
      const sa = fromTs(a.scheduledStart);
      const sb = fromTs(b.scheduledStart);
      return (sa ?? 0) - (sb ?? 0);
    });

  const totalHours   = dayTasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
  const completedHrs = dayTasks.filter(t => t.completed).reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
  const pct = totalHours > 0 ? Math.round((completedHrs / totalHours) * 100) : 0;

  const isToday = dayOffset === 0;
  const dateLabel = isToday ? "Today" : formatDate(today);

  el.innerHTML = `
    <div class="view-header">
      <h2>Daily Focus ☀️</h2>
      <div class="header-actions">
        <button class="btn-ghost" id="df-prev">← Prev</button>
        <span class="day-label">${dateLabel}</span>
        <button class="btn-ghost" id="df-next">Next →</button>
        <button class="btn-ghost" id="df-today">Today</button>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="day-progress-card">
      <div class="progress-labels">
        <span>${completedHrs.toFixed(1)}h done</span>
        <span>${totalHours.toFixed(1)}h total</span>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="progress-pct">${pct}% complete</div>
    </div>

    <!-- Task timeline -->
    <div class="daily-timeline">
      ${dayTasks.length
        ? dayTasks.map(t => dailyTaskCard(t)).join("")
        : `<div class="empty-state">
             <div class="empty-icon">🌸</div>
             <p>No tasks scheduled for ${dateLabel}.</p>
             <p class="empty-hint">Run the auto-scheduler in Settings, or drag cards in the Weekly view.</p>
           </div>`
      }
    </div>

    <!-- Unscheduled blockers warning -->
    ${buildBlockedWarning(tasks)}
  `;

  // Nav
  el.querySelector("#df-prev").addEventListener("click", () => { dayOffset--; renderDaily(); });
  el.querySelector("#df-next").addEventListener("click", () => { dayOffset++; renderDaily(); });
  el.querySelector("#df-today").addEventListener("click", () => { dayOffset = 0; renderDaily(); });

  // Complete toggle — marks dueComplete in Trello
  el.querySelectorAll(".complete-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const taskId = btn.closest("[data-task-id]").dataset.taskId;
      const task   = getState().tasks.find(t => t.id === taskId);
      if (!task || task.completed) return;
      try {
        await completeCard(taskId);
        const { tasks } = getState();
        setState({ tasks: tasks.map(t => t.id === taskId ? { ...t, completed: true } : t) });
        toast("Task complete! 🎉", "success");
        renderDaily();
      } catch (err) {
        toast("Error: " + err.message, "error");
      }
    });
  });

  // Edit on card click
  el.querySelectorAll(".daily-task-card:not(.task-completed)").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest(".complete-btn")) return;
      const task = getState().tasks.find(t => t.id === card.dataset.taskId);
      if (task) openTaskForm(task);
    });
  });
}

function dailyTaskCard(task) {
  const start  = fromTs(task.scheduledStart);
  const end    = fromTs(task.scheduledEnd);

  return `
    <div class="daily-task-card ${task.completed ? "task-completed" : ""}"
         data-task-id="${task.id}"
         style="border-left: 4px solid var(--brand)">
      <div class="daily-card-time">
        <span>${start ? formatTime(start) : "—"}</span>
        ${end ? `<span class="time-end">${formatTime(end)}</span>` : ""}
      </div>
      <div class="daily-card-body">
        <div class="daily-card-header">
          <span class="task-name ${task.completed ? "strikethrough" : ""}">${esc(task.name)}</span>
          <button class="complete-btn ${task.completed ? "completed" : ""}" title="Mark complete">
            ${task.completed ? "✅" : "⬜"}
          </button>
        </div>
        <div class="daily-card-meta">
          ${priorityBadge(task.priority)}
          <span class="task-hours">⏱ ${task.estimatedHours}h</span>
          ${task.recurring ? `<span class="recurring-badge">🔄 Recurring</span>` : ""}
        </div>
        ${task.notes ? `<div class="daily-card-notes">${esc(task.notes)}</div>` : ""}
        ${task.blockerIds?.length ? `<div class="blocker-warning">🚫 Has blockers</div>` : ""}
      </div>
    </div>
  `;
}

function buildBlockedWarning(tasks) {
  const warnTasks = tasks.filter(t => {
    if (t.completed) return false;
    const due = fromTs(t.dueDate);
    if (!due) return false;
    const soonCutoff = new Date(); soonCutoff.setDate(soonCutoff.getDate() + 7);
    return due <= soonCutoff && !fromTs(t.scheduledStart);
  });
  if (!warnTasks.length) return "";
  return `
    <div class="schedule-warning">
      <strong>⚠️ ${warnTasks.length} task${warnTasks.length > 1 ? "s" : ""} due soon but not scheduled.</strong>
      Check for blockers or run the auto-scheduler.
    </div>
  `;
}

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
