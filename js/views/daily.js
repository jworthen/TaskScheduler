/**
 * views/daily.js — Daily Focus view
 */

import { getState } from "../store.js";
import { fromTs } from "../db.js";
import { openTaskForm } from "../task-form.js";
import { formatTime, formatDate, priorityBadge, addDays } from "../ui-utils.js";

let dayOffset = 0;

export function renderDaily() {
  const el = document.getElementById("view-daily");
  const { tasks } = getState();

  const base  = new Date(); base.setHours(0,0,0,0);
  const today = addDays(base, dayOffset);

  // Build display entries — one per block that falls on this day.
  // Split tasks contribute one entry per block on this day; single-block
  // tasks contribute one entry using scheduledStart/scheduledEnd.
  const dayEntries = [];
  for (const t of tasks) {
    if (t.scheduledBlocks?.length > 1) {
      t.scheduledBlocks.forEach((b, i) => {
        const bs = new Date(b.start);
        if (bs.toDateString() === today.toDateString()) {
          dayEntries.push({ task: t, start: bs, end: new Date(b.end),
            blockIndex: i, totalBlocks: t.scheduledBlocks.length });
        }
      });
    } else {
      const s = fromTs(t.scheduledStart);
      if (s && s.toDateString() === today.toDateString()) {
        dayEntries.push({ task: t, start: s, end: fromTs(t.scheduledEnd), blockIndex: 0, totalBlocks: 1 });
      }
    }
  }
  dayEntries.sort((a, b) => a.start - b.start);

  const blockHours = ({ task, start, end, totalBlocks }) =>
    totalBlocks > 1 ? (end - start) / 3600000 : (task.estimatedHours ?? 0);
  const totalHours   = dayEntries.reduce((s, e) => s + blockHours(e), 0);
  const completedHrs = dayEntries.filter(e => e.task.completed).reduce((s, e) => s + blockHours(e), 0);
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
      ${dayEntries.length
        ? dayEntries.map(entry => dailyTaskCard(entry)).join("")
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

  // Edit on card click
  el.querySelectorAll(".daily-task-card:not(.task-completed)").forEach(card => {
    card.addEventListener("click", e => {
      const task = getState().tasks.find(t => t.id === card.dataset.taskId);
      if (task) openTaskForm(task);
    });
  });
}

export function navigateDay(delta) {
  dayOffset += delta;
  renderDaily();
}

function dailyTaskCard({ task, start, end, blockIndex, totalBlocks }) {
  const project = getState().projects.find(p => p.id === task.projectId);
  const stage   = project?.stages?.find(s => s.id === task.stageId);
  const isSplit = totalBlocks > 1;
  const blockHours = isSplit && end ? ((end - start) / 3600000).toFixed(1) : null;

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
          <span class="task-name ${task.completed ? "strikethrough" : ""}">${esc(task.name)}${stage ? ` <span class="task-list-name">(${esc(stage.name)})</span>` : ""}</span>
          <span class="complete-indicator">${task.completed ? "✅" : "⬜"}</span>
        </div>
        <div class="daily-card-meta">
          ${priorityBadge(task.priority)}
          ${isSplit
            ? `<span class="task-hours">⏱ ${blockHours}h</span><span class="split-badge">Part ${blockIndex + 1} of ${totalBlocks}</span>`
            : `<span class="task-hours">⏱ ${task.estimatedHours}h</span>`}
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
