/**
 * scheduler.js — Scheduling logic
 *
 * Strategy: "Latest possible" placement with soft due-date fallback
 * For each schedulable task (sorted by priority then due date):
 *   1. Respect start date strictly — never schedule before task.startDate.
 *   2. Try to place the task as late as possible before its due date.
 *   3. If there is not enough capacity before the due date, find the earliest
 *      available slot AFTER the due date (up to the 60-day horizon) and
 *      schedule there — the task is marked "late" but still gets a slot.
 *   4. Only warn (unschedulable) if truly no slot exists anywhere.
 *
 * Scheduling metadata is persisted via saveSchedMeta (localStorage) since
 * tasks live in Trello rather than Firestore.
 */

import { fromTs } from "./db.js";
import { saveSchedMeta } from "./trello.js";
import { getState, getSchedulableTasks, setState } from "./store.js";

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
      const rawDayStart = parseTime(cursor, wh.start);
      const dayStart = new Date(Math.max(rawDayStart.getTime(), from.getTime()));
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
 * Persists scheduling metadata to localStorage via saveSchedMeta.
 * Returns { scheduled: [...], warnings: [...] }
 */
export async function runScheduler() {
  const { settings, calendarEvents, tasks: allTasks } = getState();
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

  const now     = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 60); // look 60 days ahead

  // Build a mutable occupied list (already-scheduled tasks count as busy)
  const occupied = []; // { start: Date, end: Date }

  const scheduled = [];
  const late      = []; // scheduled, but past due date
  const warnings  = []; // truly could not be placed anywhere

  // Track updated tasks to batch into a single setState call
  const updatedMeta = {}; // taskId → { scheduledStart, scheduledEnd }

  for (const task of tasks) {
    if (!task.dueDate) continue; // can't schedule without a due date

    // Ignore the time component on due dates — treat as end-of-day.
    const due        = endOfDay(fromTs(task.dueDate));
    const neededMins = (task.estimatedHours ?? 1) * 60;

    // Start date is respected strictly: never schedule before it.
    const earliest   = task.startDate ? new Date(Math.max(task.startDate.getTime(), now.getTime()))
                                       : now;

    const rangeEnd   = due < horizon ? due : horizon;
    const rangeStart = earliest < rangeEnd ? earliest : rangeEnd;

    const busyNow = [...busyBlocks, ...occupied];
    const slots   = buildAvailableSlots(rangeStart, rangeEnd, workingHours, busyNow);

    // ── Pass 1: single contiguous block before due date ───────────────────────
    let placedBlocks = null;
    const single = placeLatest(slots, neededMins, due);
    if (single) placedBlocks = [single];

    // ── Pass 1.5: split across multiple slots before due date ─────────────────
    if (!placedBlocks) {
      const split = placeSplit(slots, neededMins);
      if (split) placedBlocks = split;
    }

    // ── Pass 2: soft due date — earliest slot(s) after due date ───────────────
    let isLate = false;
    if (!placedBlocks) {
      const extStart  = new Date(Math.max(due.getTime(), earliest.getTime()));
      const lateSlots = buildAvailableSlots(extStart, horizon, workingHours, busyNow);
      const lateSingle = placeEarliest(lateSlots, neededMins);
      if (lateSingle) {
        placedBlocks = [lateSingle];
        isLate = true;
      } else {
        const lateSplit = placeSplit(lateSlots, neededMins, 30, true /* forward */);
        if (lateSplit) { placedBlocks = lateSplit; isLate = true; }
      }
      if (isLate) late.push(task);
    }

    if (placedBlocks) {
      const firstBlock = placedBlocks[0];
      const lastBlock  = placedBlocks[placedBlocks.length - 1];
      const metaPatch = {
        scheduledStart:     firstBlock.start.toISOString(),
        scheduledEnd:       lastBlock.end.toISOString(),
        scheduledBlocks:    placedBlocks.length > 1
          ? placedBlocks.map(b => ({ start: b.start.toISOString(), end: b.end.toISOString() }))
          : null,
        schedUnschedulable: false,
      };
      saveSchedMeta(task.id, metaPatch);
      for (const b of placedBlocks) occupied.push(b);
      updatedMeta[task.id] = {
        scheduledStart:     firstBlock.start,
        scheduledEnd:       lastBlock.end,
        scheduledBlocks:    placedBlocks.length > 1 ? placedBlocks : null,
        schedUnschedulable: false,
      };
      scheduled.push({ task, placed: firstBlock });
    } else {
      saveSchedMeta(task.id, { schedUnschedulable: true });
      updatedMeta[task.id] = { ...updatedMeta[task.id], schedUnschedulable: true };
      warnings.push(task);
    }
  }

  // Update the in-memory store in one pass
  if (Object.keys(updatedMeta).length) {
    const updated = allTasks.map(t =>
      updatedMeta[t.id] ? { ...t, ...updatedMeta[t.id] } : t
    );
    setState({ tasks: updated });
  }

  return { scheduled, late, warnings };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

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

/**
 * Split a task across multiple free intervals.
 * forward=false (default): latest-possible, working backwards through slots.
 * forward=true: earliest-possible, working forwards through slots.
 * Skips any free interval shorter than minChunkMins to avoid tiny fragments.
 * Returns chronologically-sorted [{start,end}] or null if fully unplaceable.
 */
function placeSplit(slots, neededMins, minChunkMins = 30, forward = false) {
  const blocks    = [];
  let remaining   = neededMins;
  const slotsIter = forward ? slots : [...slots].reverse();

  for (const slot of slotsIter) {
    if (remaining <= 0) break;
    const available  = buildFreeIntervals(slot.start, slot.end, slot.dayBusy);
    const intervals  = forward ? available : [...available].reverse();

    for (const interval of intervals) {
      if (remaining <= 0) break;
      const duration = (interval.end - interval.start) / 60000;
      if (duration < minChunkMins) continue; // too small — skip

      const chunkMins = Math.min(remaining, duration);
      const start = forward
        ? new Date(interval.start)
        : new Date(interval.end.getTime() - chunkMins * 60000);
      const end = forward
        ? new Date(interval.start.getTime() + chunkMins * 60000)
        : new Date(interval.end);
      blocks.push({ start, end });
      remaining -= chunkMins;
    }
  }

  return remaining <= 0 ? blocks.sort((a, b) => a.start - b.start) : null;
}

/** Place as early as possible — used when scheduling past the due date. */
function placeEarliest(slots, neededMins) {
  for (const slot of slots) {
    const available = buildFreeIntervals(slot.start, slot.end, slot.dayBusy);
    for (const interval of available) {
      const duration = (interval.end - interval.start) / 60000;
      if (duration >= neededMins) {
        const start = interval.start;
        const end   = new Date(start.getTime() + neededMins * 60000);
        if (end <= interval.end) return { start, end };
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

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
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
