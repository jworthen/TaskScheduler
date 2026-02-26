/**
 * store.js — In-memory reactive store
 * Holds the current state and notifies subscribers on changes.
 */

const state = {
  projects:          [],
  tasks:             [],
  settings:          null,
  currentView:       "dashboard",
  calendarEvents:    [],   // read from Google Calendar
  calendarConnected: false,
  trelloConnected:   false,
  loading:           false,
};

const subscribers = {};

export function getState() {
  return state;
}

export function setState(partial) {
  Object.assign(state, partial);
  const keys = Object.keys(partial);
  keys.forEach(k => {
    (subscribers[k] || []).forEach(fn => fn(state[k], state));
    (subscribers["*"] || []).forEach(fn => fn(state));
  });
}

/** Subscribe to a specific key or "*" for any change */
export function subscribe(key, fn) {
  if (!subscribers[key]) subscribers[key] = [];
  subscribers[key].push(fn);
  return () => {
    subscribers[key] = subscribers[key].filter(f => f !== fn);
  };
}

// ─── Convenience selectors ───────────────────────────────────────────────────

export function getProject(id) {
  return state.projects.find(p => p.id === id) ?? null;
}

export function getCategory(id) {
  return (state.settings?.categories ?? []).find(c => c.id === id) ?? null;
}

export function getTask(id) {
  return state.tasks.find(t => t.id === id) ?? null;
}

/** Tasks that are not completed and not hard-blocked */
export function getSchedulableTasks() {
  const incomplete = state.tasks.filter(t => !t.completed);
  return incomplete.filter(t => {
    if (!t.blockerIds?.length) return true;
    return t.blockerIds.every(bid => {
      const blocker = getTask(bid);
      return blocker?.completed ?? true; // if blocker not found, treat as done
    });
  });
}

/** Tasks that are hard-blocked (at least one incomplete blocker) */
export function getBlockedTasks() {
  return state.tasks.filter(t => {
    if (t.completed) return false;
    if (!t.blockerIds?.length) return false;
    return t.blockerIds.some(bid => {
      const blocker = getTask(bid);
      return blocker && !blocker.completed;
    });
  });
}
