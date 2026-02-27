/**
 * main.js — Application entry point
 *
 * Initialises Trello connection, loads boards/cards, wires up navigation.
 * Firebase / Firestore has been removed; all task data comes from Trello.
 * Settings (working hours, work slots, Google Calendar) are stored in localStorage.
 */

import { setState, getState }    from "./store.js";
import { initModal, toast }      from "./ui-utils.js";
import { initCalendar }          from "./calendar.js";
import { loadSettings, watchSettings } from "./db.js";
import {
  loadCredentials, isConnected,
  extractTokenFromUrl, saveCredentials,
  getBoards, getCards,
} from "./trello.js";

import { renderDashboard } from "./views/dashboard.js";
import { renderWeekly }    from "./views/weekly.js";
import { renderDaily }     from "./views/daily.js";
import { renderTasks }     from "./views/tasks.js";
import { renderSettings }  from "./views/settings.js";

// ─── View registry ────────────────────────────────────────────────────────────

const VIEWS = {
  dashboard: renderDashboard,
  weekly:    renderWeekly,
  daily:     renderDaily,
tasks:     renderTasks,
  settings:  renderSettings,
};

export function switchView(name) {
  if (!VIEWS[name]) return;
  setState({ currentView: name });

  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  document.getElementById(`view-${name}`).classList.add("active");

  document.querySelectorAll(".nav-links a").forEach(a => {
    a.classList.toggle("active", a.dataset.view === name);
  });

  VIEWS[name]();
}

export function rerenderCurrent() {
  const { currentView } = getState();
  if (VIEWS[currentView]) VIEWS[currentView]();
}

// ─── Trello data loading ──────────────────────────────────────────────────────

export async function loadTrelloData() {
  if (!isConnected()) return;
  try {
    setState({ loading: true });

    const projects = await getBoards();

    // Fetch cards from all boards in parallel
    const cardArrays = await Promise.all(projects.map(p => getCards(p.id, p.stages.map(s => s.id))));
    const tasks = cardArrays.flat();

    setState({ projects, tasks, loading: false, trelloConnected: true });
    rerenderCurrent();
  } catch (err) {
    setState({ loading: false });
    console.error("[Trello] load error:", err);
    toast("Trello error: " + err.message, "error");
  }
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

  document.getElementById("btn-connect-calendar")?.addEventListener("click", () => {
    switchView("settings");
    document.getElementById("connect-calendar")?.scrollIntoView({ behavior: "smooth" });
  });

  // Handle Trello OAuth redirect — Trello appends #token=<value> to the URL
  const urlToken = extractTokenFromUrl();
  if (urlToken) {
    const pendingKey = localStorage.getItem("trello_key_pending") ?? "";
    if (pendingKey) {
      saveCredentials(pendingKey, urlToken);
      localStorage.removeItem("trello_key_pending");
      toast("Trello connected! 🎉", "success");
    }
  }

  // Load Trello credentials from localStorage
  const connected = loadCredentials();
  setState({ trelloConnected: connected });

  // Load settings from localStorage (working hours, work slots, etc.)
  watchSettings(settings => setState({ settings }));

  if (!connected) {
    document.getElementById("config-banner").style.display = "";
    setState({ projects: [], tasks: [] });
    switchView("settings");
    return;
  }

  // Load boards + cards from Trello
  await loadTrelloData();

  // Google Calendar (non-blocking — optional integration)
  await initCalendar().catch(() => {});

  switchView("dashboard");

  // Refresh Trello data every 5 minutes
  setInterval(loadTrelloData, 5 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", init);
