/**
 * main.js — Application entry point
 * Initialises Firebase, loads data, wires up navigation, starts real-time listeners.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import { firebaseConfig, FIREBASE_CONFIGURED } from "./firebase-config.js";
import { initDb, watchProjects, watchTasks, watchSettings, loadSettings } from "./db.js";
import { setState, getState, subscribe } from "./store.js";
import { initModal, toast } from "./ui-utils.js";
import { initCalendar } from "./calendar.js";

import { renderDashboard } from "./views/dashboard.js";
import { renderWeekly }    from "./views/weekly.js";
import { renderDaily }     from "./views/daily.js";
import { renderProjects }  from "./views/projects.js";
import { renderTasks }     from "./views/tasks.js";
import { renderSettings }  from "./views/settings.js";

// ─── View registry ───────────────────────────────────────────────────────────

const VIEWS = {
  dashboard: renderDashboard,
  weekly:    renderWeekly,
  daily:     renderDaily,
  projects:  renderProjects,
  tasks:     renderTasks,
  settings:  renderSettings,
};

function switchView(name) {
  if (!VIEWS[name]) return;
  setState({ currentView: name });

  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  document.getElementById(`view-${name}`).classList.add("active");

  document.querySelectorAll(".nav-links a").forEach(a => {
    a.classList.toggle("active", a.dataset.view === name);
  });

  VIEWS[name]();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  initModal();

  // Navigation
  document.querySelectorAll("[data-view]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      switchView(el.dataset.view);
    });
  });

  // Calendar button in sidebar
  document.getElementById("btn-connect-calendar")?.addEventListener("click", () => {
    switchView("settings");
    document.getElementById("connect-calendar")?.scrollIntoView({ behavior: "smooth" });
  });

  if (!FIREBASE_CONFIGURED) {
    document.getElementById("config-banner").style.display = "";
    setState({ projects: [], tasks: [], settings: { categories: [], workingHours: {} } });
    switchView("dashboard");
    toast("Add your Firebase credentials to js/firebase-config.js to get started.", "warn");
    return;
  }

  // Firebase
  let app;
  try {
    app = initializeApp(firebaseConfig);
  } catch (err) {
    console.error("Firebase init failed:", err);
    document.getElementById("config-banner").style.display = "";
    switchView("settings");
    toast("Firebase init failed — check your config.", "error");
    return;
  }

  initDb(app);

  // ── localStorage mirror ─────────────────────────────────────────────────────
  // Display cached data IMMEDIATELY on load (before Firestore responds).
  // Every time Firestore fires, the cache is refreshed, so it's always current.
  // This makes the app work even when the Firestore round-trip is slow or the
  // page is refreshed before the server has fully confirmed a write.
  function readCache(key) {
    try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
  }
  function writeCache(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
  function clearCacheKey(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  const cached = {
    projects: readCache("ts_projects"),
    tasks:    readCache("ts_tasks"),
    settings: readCache("ts_settings"),
  };
  if (cached.projects) setState({ projects: cached.projects });
  if (cached.tasks)    setState({ tasks:    cached.tasks    });
  if (cached.settings) setState({ settings: cached.settings });

  // Seed the settings doc with defaults on first run.
  loadSettings().catch(() => {});

  // Real-time listeners — update store, mirror to localStorage, re-render
  const onFirestoreErr = err => {
    console.error("Firestore listener error:", err);
    toast(`Firestore error: ${err.message}. Check your security rules and network connection.`, "error");
  };

  watchSettings(settings => {
    if (settings) writeCache("ts_settings", settings);
    setState({ settings });
    rerenderCurrent();
  }, onFirestoreErr);

  watchProjects(projects => {
    console.log(`[Firestore] watchProjects: ${projects.length} project(s)`);
    writeCache("ts_projects", projects);
    setState({ projects });
    rerenderCurrent();
  }, onFirestoreErr);

  watchTasks(tasks => {
    console.log(`[Firestore] watchTasks: ${tasks.length} task(s)`);
    writeCache("ts_tasks", tasks);
    setState({ tasks });
    rerenderCurrent();
  }, onFirestoreErr);

  // Google Calendar (non-blocking)
  await initCalendar().catch(() => {});

  switchView("dashboard");
}

function rerenderCurrent() {
  const { currentView } = getState();
  if (VIEWS[currentView]) VIEWS[currentView]();
}

document.addEventListener("DOMContentLoaded", init);
