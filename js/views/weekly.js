/**
 * views/weekly.js — 7-day calendar grid with drag-and-drop rescheduling
 */

import { getState, setState } from "../store.js";
import { fromTs } from "../db.js";
import { openTaskForm } from "../task-form.js";
import { saveSchedMeta } from "../trello.js";
import { toast, startOfWeek, addDays, isSameDay, formatTime } from "../ui-utils.js";

const HOUR_START = 7;   // 7 AM
const HOUR_END   = 22;  // 10 PM
const SLOT_H     = 60;  // px per hour

let weekOffset = 0; // 0 = current week

export function renderWeekly() {
  const el = document.getElementById("view-weekly");
  const { tasks, settings } = getState();
  const categories   = settings?.categories  ?? [];
  const workingHours = settings?.workingHours ?? null;

  const today    = new Date();
  today.setHours(0,0,0,0);
  const weekStart = addDays(startOfWeek(today), weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Build header labels
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  el.innerHTML = `
    <div class="view-header">
      <h2>Weekly View</h2>
      <div class="header-actions">
        <button class="btn-ghost" id="wk-prev">← Prev</button>
        <span class="wk-range">${formatDateShort(weekStart)} – ${formatDateShort(days[6])}</span>
        <button class="btn-ghost" id="wk-next">Next →</button>
        <button class="btn-ghost" id="wk-today">Today</button>
      </div>
    </div>

    <div class="week-grid-wrapper">
      <!-- Time gutter -->
      <div class="time-gutter">
        ${buildTimeGutter()}
      </div>

      <!-- Day columns -->
      <div class="week-columns">
        ${days.map((day, i) => {
          const isToday = isSameDay(day, today);
          const dayTasks = tasks.filter(t => {
            const s = fromTs(t.scheduledStart);
            return s && isSameDay(s, day);
          });
          return `
            <div class="week-col ${isToday ? "today-col" : ""}" data-date="${day.toISOString()}">
              <div class="week-col-header ${isToday ? "today-header" : ""}">
                <span class="dow-name">${dayNames[day.getDay()]}</span>
                <span class="dow-date">${day.getDate()}</span>
              </div>
              <div class="week-col-body" data-date="${day.toISOString()}">
                ${buildDaySlots(day, workingHours)}
                ${layoutDayTasks(dayTasks, day).map(item => buildTaskBlock(item, categories)).join("")}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>

    <!-- Unscheduled task list -->
    <section class="unscheduled-section">
      <h3 class="section-title">Unscheduled tasks
        <span class="unschedule-hint">— drag scheduled tasks here to remove from calendar</span>
      </h3>
      <div class="unscheduled-list" id="unscheduled-drop-zone">
        ${buildUnscheduledList(tasks, categories)}
      </div>
    </section>
  `;

  // Nav buttons
  el.querySelector("#wk-prev").addEventListener("click", () => { weekOffset--; renderWeekly(); });
  el.querySelector("#wk-next").addEventListener("click", () => { weekOffset++; renderWeekly(); });
  el.querySelector("#wk-today").addEventListener("click", () => { weekOffset = 0; renderWeekly(); });


  // Task click → edit
  el.querySelectorAll(".week-task-block").forEach(block => {
    block.addEventListener("click", e => {
      if (e.defaultPrevented) return;
      const task = getState().tasks.find(t => t.id === block.dataset.taskId);
      if (task) openTaskForm(task);
    });
  });

  // Drag-and-drop
  initDragDrop(el);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HEADER_H = 44; // must match .week-col-header height in CSS

function buildTimeGutter() {
  let html = "";
  for (let h = HOUR_START; h <= HOUR_END; h++) {
    const label = h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`;
    html += `<div class="time-label" style="top:${HEADER_H + (h - HOUR_START) * SLOT_H}px">${label}</div>`;
  }
  return html;
}

function buildDaySlots(day, workingHours) {
  const totalHours = HOUR_END - HOUR_START;
  let html = "";

  // ── Non-working hour overlay ───────────────────────────────────────────────
  if (workingHours !== null) {
    const dow = day.getDay();
    const wh  = workingHours[dow];
    if (!wh) {
      html += `<div class="hour-block-nonworking" style="top:0;height:${totalHours * SLOT_H}px"></div>`;
    } else {
      const [sH, sM] = wh.start.split(":").map(Number);
      const [eH, eM] = wh.end.split(":").map(Number);
      const workStart = sH + sM / 60;
      const workEnd   = eH + eM / 60;
      if (workStart > HOUR_START) {
        const h = (workStart - HOUR_START) * SLOT_H;
        html += `<div class="hour-block-nonworking" style="top:0;height:${h}px"></div>`;
      }
      if (workEnd < HOUR_END) {
        const top = (workEnd - HOUR_START) * SLOT_H;
        const h   = (HOUR_END - workEnd) * SLOT_H;
        html += `<div class="hour-block-nonworking" style="top:${top}px;height:${h}px"></div>`;
      }
    }
  }

  // ── Hour drop-target slots ─────────────────────────────────────────────────
  for (let h = 0; h < totalHours; h++) {
    html += `<div class="hour-slot" style="top:${h * SLOT_H}px;height:${SLOT_H}px" data-hour="${HOUR_START + h}"></div>`;
  }

  return html;
}

// Compute a task's clamped time interval (in fractional hours) for the given day.
function taskInterval(task, day) {
  const start = fromTs(task.scheduledStart);
  const end   = fromTs(task.scheduledEnd);
  if (!start || !end) return null;

  const dayStart = new Date(day); dayStart.setHours(HOUR_START, 0, 0, 0);
  const dayEnd   = new Date(day); dayEnd.setHours(HOUR_END, 0, 0, 0);

  const clampedStart = start < dayStart ? dayStart : start;
  const clampedEnd   = end   > dayEnd   ? dayEnd   : end;

  const startH = clampedStart.getHours() + clampedStart.getMinutes() / 60;
  const endH   = clampedEnd.getHours()   + clampedEnd.getMinutes()   / 60;

  return { task, start: clampedStart, startH, endH };
}

// Assign overlapping tasks to side-by-side columns (calendar-style layout).
// Each returned item gets `col` (0-based column index) and `cols` (columns in
// its overlap cluster) so blocks can share the available width instead of
// stacking on top of one another.
function layoutDayTasks(dayTasks, day) {
  const items = dayTasks.map(t => taskInterval(t, day)).filter(Boolean);
  items.sort((a, b) => a.startH - b.startH || a.endH - b.endH);

  let cluster = [];
  let columnEnds = [];   // last end time per column in the current cluster
  let clusterEnd = -Infinity;

  const flush = () => {
    const cols = columnEnds.length || 1;
    cluster.forEach(it => { it.cols = cols; });
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };

  for (const it of items) {
    // Start a new cluster once this task no longer overlaps the current one.
    if (cluster.length && it.startH >= clusterEnd) flush();

    // Reuse the first column whose previous task has already ended.
    let placed = false;
    for (let c = 0; c < columnEnds.length; c++) {
      if (it.startH >= columnEnds[c]) {
        columnEnds[c] = it.endH;
        it.col = c;
        placed = true;
        break;
      }
    }
    if (!placed) {
      it.col = columnEnds.length;
      columnEnds.push(it.endH);
    }

    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endH);
  }
  flush();

  return items;
}

const CASCADE_OFFSET = 22; // px each overlapping block is shifted right

function buildTaskBlock(item, categories) {
  const { task, start, startH, endH } = item;
  const col = item.col || 0;

  const cat   = categories.find(c => c.id === task.categoryId);
  const color = cat?.color ?? "#1FA8B4";

  const topPx    = (startH - HOUR_START) * SLOT_H;
  const heightPx = (endH - startH) * SLOT_H;

  // Cascade: each subsequent overlapping block is nudged to the right and
  // layered on top, leaving a sliver of the ones behind it visible.
  const leftPx  = 2 + col * CASCADE_OFFSET;
  const zIndex  = 1 + col;

  return `
    <div class="week-task-block ${task.completed ? "task-completed" : ""}"
         data-task-id="${task.id}"
         draggable="true"
         style="top:${topPx}px;height:${Math.max(heightPx,20)}px;left:${leftPx}px;right:2px;--block-z:${zIndex};background:linear-gradient(${color}2b,${color}2b),#fff;border-left:3px solid ${color}">
      <div class="block-name">${esc(task.name)}</div>
      <div class="block-time">${formatTime(start)}</div>
    </div>
  `;
}

function buildUnscheduledList(tasks, categories) {
  const unscheduled = tasks.filter(t => !t.completed && !fromTs(t.scheduledStart));
  if (!unscheduled.length) return `<p class="empty-state">All tasks are scheduled! 🎉</p>`;
  return unscheduled.map(t => {
    const cat = categories.find(c => c.id === t.categoryId);
    const color = cat?.color ?? "#1FA8B4";
    return `
      <div class="unscheduled-task" data-task-id="${t.id}" draggable="true"
           style="border-left:3px solid ${color}">
        <span>${esc(t.name)}</span>
        <span class="task-hours">⏱ ${t.estimatedHours}h</span>
      </div>
    `;
  }).join("");
}

function initDragDrop(container) {
  let dragTaskId       = null;
  let dragOffsetY      = 0;
  let dragIsScheduled  = false; // true when dragging from the calendar grid

  container.addEventListener("dragstart", e => {
    const block = e.target.closest("[data-task-id]");
    if (!block) return;
    dragTaskId      = block.dataset.taskId;
    dragOffsetY     = e.offsetY;
    dragIsScheduled = block.classList.contains("week-task-block");
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => block.classList.add("dragging"), 0);

    // Show unschedule drop zone hint when dragging a scheduled block
    if (dragIsScheduled) {
      const zone = container.querySelector("#unscheduled-drop-zone");
      zone?.classList.add("unschedule-zone-active");
    }
  });

  container.addEventListener("dragend", () => {
    container.querySelectorAll(".dragging").forEach(el => el.classList.remove("dragging"));
    container.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
    container.querySelector("#unscheduled-drop-zone")?.classList.remove("unschedule-zone-active", "unschedule-zone-hover");
    dragTaskId      = null;
    dragIsScheduled = false;
  });

  // ── Calendar column drop (reschedule) ──────────────────────────────────────
  container.querySelectorAll(".week-col-body").forEach(col => {
    col.addEventListener("dragover", e => {
      e.preventDefault();
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", async e => {
      e.preventDefault();
      col.classList.remove("drag-over");
      if (!dragTaskId) return;

      const task = getState().tasks.find(t => t.id === dragTaskId);
      if (!task) return;

      const colRect     = col.getBoundingClientRect();
      const dropY       = e.clientY - colRect.top - dragOffsetY;
      const droppedHour = HOUR_START + dropY / SLOT_H;

      const dateStr  = col.dataset.date;
      const newStart = new Date(dateStr);
      const h = Math.floor(droppedHour);
      const m = Math.round((droppedHour - h) * 60 / 15) * 15;
      newStart.setHours(Math.min(h, HOUR_END - 1), m, 0, 0);
      const newEnd = new Date(newStart.getTime() + (task.estimatedHours ?? 1) * 3600000);

      saveSchedMeta(task.id, {
        scheduledStart:    newStart.toISOString(),
        scheduledEnd:      newEnd.toISOString(),
        manuallyScheduled: true,
      });
      // Update store and re-render
      const { tasks } = getState();
      setState({ tasks: tasks.map(t => t.id === task.id
        ? { ...t, scheduledStart: newStart, scheduledEnd: newEnd, manuallyScheduled: true }
        : t)
      });
      toast("Task rescheduled! 📅", "success");
      renderWeekly();
    });
  });

  // ── Unschedule drop zone ───────────────────────────────────────────────────
  const dropZone = container.querySelector("#unscheduled-drop-zone");
  if (dropZone) {
    dropZone.addEventListener("dragover", e => {
      if (!dragIsScheduled) return;
      e.preventDefault();
      dropZone.classList.add("unschedule-zone-hover");
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("unschedule-zone-hover");
    });
    dropZone.addEventListener("drop", async e => {
      e.preventDefault();
      dropZone.classList.remove("unschedule-zone-hover", "unschedule-zone-active");
      if (!dragTaskId || !dragIsScheduled) return;

      saveSchedMeta(dragTaskId, {
        scheduledStart:    null,
        scheduledEnd:      null,
        manuallyScheduled: false,
      });
      // Update store and re-render
      const { tasks } = getState();
      setState({ tasks: tasks.map(t => t.id === dragTaskId
        ? { ...t, scheduledStart: null, scheduledEnd: null, manuallyScheduled: false }
        : t)
      });
      toast("Task removed from calendar.", "info");
      renderWeekly();
    });
  }
}

export function navigateWeek(delta) {
  weekOffset += delta;
  renderWeekly();
}

function formatDateShort(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
