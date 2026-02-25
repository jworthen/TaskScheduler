/**
 * db.js — Firestore data layer
 * All Firestore reads/writes go through this module.
 *
 * Collections:
 *   projects/{id}         — Project documents
 *   tasks/{id}            — Task documents
 *   settings/app          — Single settings document
 */

import {
  getFirestore,
  collection, doc,
  getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot,
  serverTimestamp, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let db;
export function initDb(app) {
  db = getFirestore(app);
  return db;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function col(name)   { return collection(db, name); }
function docRef(col, id) { return doc(db, col, id); }

/** Convert a JS Date → Firestore Timestamp (handles null) */
export function toTs(date) {
  if (!date) return null;
  if (date instanceof Timestamp) return date;
  return Timestamp.fromDate(date instanceof Date ? date : new Date(date));
}

/** Convert Firestore Timestamp → JS Date (handles null) */
export function fromTs(ts) {
  if (!ts) return null;
  if (ts instanceof Timestamp) return ts.toDate();
  if (ts.seconds !== undefined) return new Timestamp(ts.seconds, ts.nanoseconds).toDate();
  return new Date(ts);
}

// ─── DEFAULT SEED DATA ───────────────────────────────────────────────────────

export const DEFAULT_CATEGORIES = [
  { id: "social",    name: "Social Media Content",    color: "#f4a261" },
  { id: "design",    name: "Pattern Design/Drafting",  color: "#9b5de5" },
  { id: "customer",  name: "Customer Communication",   color: "#00b4d8" },
  { id: "shipping",  name: "Shipping & Orders",        color: "#57cc99" },
];

export const DEFAULT_WORK_SLOTS = [
  { id: "morning",   name: "Morning",   startTime: "09:00", endTime: "12:00", color: "#f0e557", days: [1,2,3,4,5] },
  { id: "afternoon", name: "Afternoon", startTime: "13:00", endTime: "17:00", color: "#54c5ba", days: [1,2,3,4,5] },
  { id: "evening",   name: "Evening",   startTime: "18:00", endTime: "21:00", color: "#a02cb4", days: [1,2,3,4,5,6,0] },
];

const DEFAULT_WORKING_HOURS = {
  // 0=Sun … 6=Sat; null means day off
  0: null,
  1: { start: "09:00", end: "17:00" },
  2: { start: "09:00", end: "17:00" },
  3: { start: "09:00", end: "17:00" },
  4: { start: "09:00", end: "17:00" },
  5: { start: "09:00", end: "17:00" },
  6: null,
};

// ─── SETTINGS ────────────────────────────────────────────────────────────────

/** Load settings (creates defaults if missing) */
export async function loadSettings() {
  const ref = docRef("settings", "app");
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const defaults = {
    workingHours: DEFAULT_WORKING_HOURS,
    categories:   DEFAULT_CATEGORIES,
    workSlots:    DEFAULT_WORK_SLOTS,
    calendarConnected: false,
  };
  await setDoc(ref, defaults);
  return defaults;
}

export async function saveSettings(data) {
  await setDoc(docRef("settings", "app"), data, { merge: true });
}

/** Real-time listener for settings */
export function watchSettings(cb, onErr) {
  return onSnapshot(docRef("settings", "app"), snap => {
    cb(snap.exists() ? snap.data() : null);
  }, onErr ?? (err => console.error("watchSettings:", err)));
}

// ─── PROJECTS ────────────────────────────────────────────────────────────────

/**
 * Project shape:
 * {
 *   id, name,
 *   stages: [{ id, name, order }],   // user-defined pipeline
 *   createdAt, updatedAt
 * }
 */

export async function getProjects() {
  const snap = await getDocs(query(col("projects"), orderBy("createdAt")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getProject(id) {
  const snap = await getDoc(docRef("projects", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createProject(data) {
  const payload = {
    name: data.name,
    stages: data.stages ?? [
      { id: crypto.randomUUID(), name: "To Do",       order: 0 },
      { id: crypto.randomUUID(), name: "In Progress", order: 1 },
      { id: crypto.randomUUID(), name: "Done",        order: 2 },
    ],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(col("projects"), payload);
  return { id: ref.id, ...payload };
}

export async function updateProject(id, data) {
  await updateDoc(docRef("projects", id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteProject(id) {
  // Also delete all tasks belonging to this project
  const taskSnap = await getDocs(query(col("tasks"), where("projectId", "==", id)));
  await Promise.all(taskSnap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(docRef("projects", id));
}

export function watchProjects(cb, onErr) {
  return onSnapshot(query(col("projects"), orderBy("createdAt")), snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onErr ?? (err => console.error("watchProjects:", err)));
}

// ─── TASKS ───────────────────────────────────────────────────────────────────

/**
 * Task shape:
 * {
 *   id, name,
 *   projectId,            // required
 *   stageId,              // from that project's stages
 *   categoryId,           // references settings.categories[].id
 *   estimatedHours,       // number
 *   dueDate,              // Timestamp | null
 *   priority,             // "high" | "medium" | "low"
 *   blockerIds,           // string[] — task IDs that must be complete first
 *   recurring,            // boolean
 *   recurringFrequency,   // "daily" | "weekly" | "monthly" | "custom" | null
 *   recurringInterval,    // number (days) — used when frequency === "custom"
 *   notes,                // string
 *   completed,            // boolean
 *   completedAt,          // Timestamp | null
 *   scheduledStart,       // Timestamp | null — auto or manually placed
 *   scheduledEnd,         // Timestamp | null
 *   manuallyScheduled,    // boolean — true if user dragged it
 *   createdAt, updatedAt
 * }
 */

export async function getTasks(filters = {}) {
  let q = col("tasks");
  const constraints = [orderBy("createdAt")];
  if (filters.projectId) constraints.unshift(where("projectId", "==", filters.projectId));
  if (filters.completed !== undefined) constraints.unshift(where("completed", "==", filters.completed));
  q = query(q, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getTask(id) {
  const snap = await getDoc(docRef("tasks", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createTask(data) {
  const payload = {
    name:               data.name,
    projectId:          data.projectId,
    stageId:            data.stageId            ?? null,
    categoryId:         data.categoryId         ?? null,
    estimatedHours:     data.estimatedHours      ?? 1,
    dueDate:            data.dueDate             ? toTs(data.dueDate) : null,
    priority:           data.priority            ?? "medium",
    blockerIds:         data.blockerIds          ?? [],
    recurring:          data.recurring           ?? false,
    recurringFrequency: data.recurringFrequency  ?? null,
    recurringInterval:  data.recurringInterval   ?? null,
    notes:              data.notes               ?? "",
    workSlotId:         data.workSlotId          ?? null,
    completed:          false,
    completedAt:        null,
    scheduledStart:     null,
    scheduledEnd:       null,
    manuallyScheduled:  false,
    createdAt:          serverTimestamp(),
    updatedAt:          serverTimestamp(),
  };
  const ref = await addDoc(col("tasks"), payload);
  return { id: ref.id, ...payload };
}

export async function updateTask(id, data) {
  const update = { ...data, updatedAt: serverTimestamp() };
  // Coerce dates to Timestamps
  if (update.dueDate)       update.dueDate       = toTs(update.dueDate);
  if (update.scheduledStart) update.scheduledStart = toTs(update.scheduledStart);
  if (update.scheduledEnd)   update.scheduledEnd   = toTs(update.scheduledEnd);
  await updateDoc(docRef("tasks", id), update);
}

export async function deleteTask(id) {
  await deleteDoc(docRef("tasks", id));
}

/**
 * Mark a task complete. If it's recurring, spawn the next occurrence.
 */
export async function completeTask(task) {
  await updateDoc(docRef("tasks", task.id), {
    completed:   true,
    completedAt: serverTimestamp(),
    updatedAt:   serverTimestamp(),
  });

  if (task.recurring && task.recurringFrequency && task.dueDate) {
    const currentDue = fromTs(task.dueDate);
    const nextDue    = advanceDueDate(currentDue, task.recurringFrequency, task.recurringInterval);
    const nextTask   = { ...task };
    delete nextTask.id;
    nextTask.completed        = false;
    nextTask.completedAt      = null;
    nextTask.scheduledStart   = null;
    nextTask.scheduledEnd     = null;
    nextTask.manuallyScheduled = false;
    nextTask.dueDate          = nextDue;
    nextTask.createdAt        = serverTimestamp();
    nextTask.updatedAt        = serverTimestamp();
    await addDoc(col("tasks"), nextTask);
  }
}

function advanceDueDate(date, frequency, intervalDays) {
  const d = new Date(date);
  switch (frequency) {
    case "daily":   d.setDate(d.getDate() + 1); break;
    case "weekly":  d.setDate(d.getDate() + 7); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "custom":  d.setDate(d.getDate() + (intervalDays ?? 7)); break;
    default:        d.setDate(d.getDate() + 7);
  }
  return d;
}

export function watchTasks(cb, onErr, filters = {}) {
  const constraints = [orderBy("createdAt")];
  if (filters.projectId) constraints.unshift(where("projectId", "==", filters.projectId));
  return onSnapshot(query(col("tasks"), ...constraints), snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onErr ?? (err => console.error("watchTasks:", err)));
}
