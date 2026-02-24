/**
 * scheduler.js — Scheduling logic
 *
 * Strategy: "Latest possible" placement
 * For each schedulable task (sorted by priority then due date):
 *   - Walk backward from the due date
 *   - Find the latest contiguous window of available time that fits
 *     estimatedHours, respecting working hours and calendar busy blocks
 *   - If no window found before today → mark as "cannot schedule" warning
 */

import { fromTs, toTs, updateTask } from "./db.js";
import { getState, getSchedulableTasks } from "./store.js";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

/**
 * Build a list of available time slots for a given date range.
 * @param {Date} from
 * @param {Date} to
 * @param {object} workingHours  — { 0: null | {start,end}, 1: ..., ... }
 * @param {Array}  busyBlocks    — [{ start: Date, end: Date }, ...]
 * @returns {Array<{start:Date, end:Date, freeMinutes:number}>} one entry per day
 */
export function buildAvailableSlots(from, to, workingHours, busyBlocks) {
  const slots = [];
  const cursor = startOfDay(from);
  const end    = startOfDay(to);

  while (cursor <= end) {
    const dow = cursor.getDay();
    const wh  = workingHours[dow];
    if (wh) {
      const dayStart = parseTime(cursor, wh.start);
      const dayEnd   = parseTime(cursor, wh.end);

      // Subtract busy blocks that overlap this day
      const dayBusy = busyBlocks.filter(b =>
        b.start < dayEnd && b.end > dayStart
      ).map(b => ({
        start: b.start < dayStart ? dayStart : b.start,
        end:   b.end   > dayEnd   ? dayEnd   : b.end,
      }));

      const freeMinutes = freeTimeInDay(dayStart, dayEnd, dayBusy);
      slots.push({ date: new Date(cursor), start: dayStart, end: dayEnd, dayBusy, freeMinutes });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return slots;
}

/**
 * Schedule all unscheduled schedulable tasks.
 * Mutates Firestore via updateTask.
 * Returns { scheduled: [...], warnings: [...] }
 */
export async function runScheduler() {
  const { settings, calendarEvents } = getState();
  const workingHours = settings?.workingHours ?? defaultWorkingHours();
  const busyBlocks   = calendarEvents.map(e => ({
    start: new Date(e.start),
    end:   new Date(e.end),
  }));

  const tasks = getSchedulableTasks().filter(t => !t.manuallyScheduled);
  // Sort: priority first, then earliest due date
  tasks.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    const da = fromTs(a.dueDate) ?? new Date(9999, 0);
    const db_ = fromTs(b.dueDate) ?? new Date(9999, 0);
    return da - db_;
  });

  const now        = new Date();
  const horizon    = new Date(now);
  horizon.setDate(horizon.getDate() + 60); // look 60 days ahead

  // Build a mutable occupied list (already-scheduled tasks count as busy)
  const occupied = []; // {start:Date, end:Date}

  const scheduled = [];
  const warnings  = [];

  for (const task of tasks) {
    if (!task.dueDate) continue; // can't schedule without a due date

    const due          = fromTs(task.dueDate);
    const neededMins   = (task.estimatedHours ?? 1) * 60;
    const rangeEnd     = due   < horizon ? due   : horizon;
    const rangeStart   = now   < rangeEnd ? now   : rangeEnd;

    const slots = buildAvailableSlots(rangeStart, rangeEnd, workingHours, [
      ...busyBlocks,
      ...occupied,
    ]);

    // Walk backward: latest slot first
    const placed = placeLatest(slots, neededMins, due);
    if (placed) {
      await updateTask(task.id, {
        scheduledStart: placed.start,
        scheduledEnd:   placed.end,
      });
      occupied.push({ start: placed.start, end: placed.end });
      scheduled.push({ task, placed });
    } else {
      warnings.push(task);
    }
  }

  return { scheduled, warnings };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function placeLatest(slots, neededMins, due) {
  // Try from the last day backward
  for (let i = slots.length - 1; i >= 0; i--) {
    const slot = slots[i];
    const available = buildFreeIntervals(slot.start, slot.end, slot.dayBusy);
    // Try from end of each free interval
    for (let j = available.length - 1; j >= 0; j--) {
      const interval = available[j];
      const duration = (interval.end - interval.start) / 60000; // minutes
      if (duration >= neededMins) {
        // Place at latest possible moment within interval
        const end   = interval.end > due ? due : interval.end;
        const start = new Date(end.getTime() - neededMins * 60000);
        if (start >= interval.start) {
          return { start, end };
        }
      }
    }
  }
  return null;
}

function buildFreeIntervals(dayStart, dayEnd, busyBlocks) {
  const sorted = [...busyBlocks].sort((a, b) => a.start - b.start);
  const free = [];
  let cursor = dayStart;
  for (const b of sorted) {
    if (b.start > cursor) free.push({ start: cursor, end: b.start });
    if (b.end > cursor) cursor = b.end;
  }
  if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd });
  return free;
}

function freeTimeInDay(dayStart, dayEnd, busyBlocks) {
  const intervals = buildFreeIntervals(dayStart, dayEnd, busyBlocks);
  return intervals.reduce((sum, i) => sum + (i.end - i.start) / 60000, 0);
}

function parseTime(date, timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function defaultWorkingHours() {
  return {
    0: null,
    1: { start: "09:00", end: "17:00" },
    2: { start: "09:00", end: "17:00" },
    3: { start: "09:00", end: "17:00" },
    4: { start: "09:00", end: "17:00" },
    5: { start: "09:00", end: "17:00" },
    6: null,
  };
}
