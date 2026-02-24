/**
 * main.js — Application entry point
 * Initialises Firebase, loads data, wires up navigation, starts real-time listeners.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import { firebaseConfig, FIREBASE_CONFIGURED } from "./firebase-config.js";
import { initDb, watchProjects, watchTasks, watchSettings } from "./db.js";
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

  // Real-time listeners — update store and re-render current view
  watchSettings(settings => {
    setState({ settings });
    rerenderCurrent();
  });

  watchProjects(projects => {
    setState({ projects });
    rerenderCurrent();
  });

  watchTasks(tasks => {
    setState({ tasks });
    rerenderCurrent();
  });

  // Google Calendar (non-blocking)
  await initCalendar().catch(() => {});

  switchView("dashboard");
}

function rerenderCurrent() {
  const { currentView } = getState();
  if (VIEWS[currentView]) VIEWS[currentView]();
}

document.addEventListener("DOMContentLoaded", init);
