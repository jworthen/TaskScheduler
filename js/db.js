/**
 * db.js — Local settings store (localStorage)
 *
 * Previously backed by Firestore. Now uses localStorage since all task and
 * project data comes directly from the Trello API.
 *
 * fromTs / toTs are kept as generic date-coercion helpers for compatibility
 * with views that were originally written against the Firestore data model.
 */

// ─── Date utilities ───────────────────────────────────────────────────────────

/** Coerce a Firestore Timestamp, ISO string, or JS Date → JS Date (or null). */
export function fromTs(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  // Firestore Timestamp shape: { seconds, nanoseconds }
  if (typeof val === "object" && val.seconds !== undefined)
    return new Date(val.seconds * 1000 + (val.nanoseconds ?? 0) / 1e6);
  return new Date(val);
}

/** Coerce a value to a JS Date (or null). Lightweight alias kept for compat. */
export function toTs(val) {
  if (!val) return null;
  return val instanceof Date ? val : new Date(val);
}

// ─── Default settings ─────────────────────────────────────────────────────────

export const DEFAULT_WORK_SLOTS = [
  { id: "morning",   name: "Morning",   startTime: "09:00", endTime: "12:00", color: "#f0e557", days: [1,2,3,4,5] },
  { id: "afternoon", name: "Afternoon", startTime: "13:00", endTime: "17:00", color: "#54c5ba", days: [1,2,3,4,5] },
  { id: "evening",   name: "Evening",   startTime: "18:00", endTime: "21:00", color: "#a02cb4", days: [1,2,3,4,5,6,0] },
];

const DEFAULT_WORKING_HOURS = {
  0: null,
  1: { start: "09:00", end: "17:00" },
  2: { start: "09:00", end: "17:00" },
  3: { start: "09:00", end: "17:00" },
  4: { start: "09:00", end: "17:00" },
  5: { start: "09:00", end: "17:00" },
  6: null,
};

// ─── Settings (localStorage) ──────────────────────────────────────────────────

const SETTINGS_KEY = "ts_settings";

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    workingHours:      DEFAULT_WORKING_HOURS,
    workSlots:         DEFAULT_WORK_SLOTS,
    calendarConnected: false,
  };
}

export function saveSettings(patch) {
  const current = loadSettings();
  const updated  = { ...current, ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  return updated;
}

/**
 * watchSettings — kept for API compatibility with main.js.
 * Calls cb once synchronously with the current settings; returns a no-op unsubscribe.
 */
export function watchSettings(cb) {
  cb(loadSettings());
  return () => {};
}
