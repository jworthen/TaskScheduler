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
  getAvailableBoards, enrichBoards, getCards,
  getTrelloCache, setTrelloCache,
} from "./trello.js";

import { runScheduler }    from "./scheduler.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderWeekly, navigateWeek } from "./views/weekly.js";
import { renderDaily, navigateDay }   from "./views/daily.js";
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

  document.querySelectorAll(".nav-links a, .mobile-nav-item").forEach(a => {
    a.classList.toggle("active", a.dataset.view === name);
  });
  // Scroll main content back to top on view change
  document.getElementById("main-content").scrollTop = 0;

  VIEWS[name]();
}

export function rerenderCurrent() {
  const { currentView } = getState();
  if (VIEWS[currentView]) VIEWS[currentView]();
}

// ─── Trello data loading ──────────────────────────────────────────────────────

export async function loadTrelloData() {
  if (!isConnected()) return;

  // Show cached data immediately so the UI is responsive on load
  const cached = getTrelloCache();
  if (cached) {
    setState({ projects: cached.projects, tasks: cached.tasks, trelloConnected: true });
    rerenderCurrent();
  }

  try {
    setState({ loading: true });

    // Cheap fetch — populates the board-selection list in Settings
    const allBoards = await getAvailableBoards();
    setState({ allBoards });

    // Filter to user-selected boards (default: all)
    const { settings } = getState();
    const enabledIds = settings?.enabledBoardIds;
    const toLoad = enabledIds?.length
      ? allBoards.filter(b => enabledIds.includes(b.id))
      : allBoards;

    const projects = await enrichBoards(toLoad);

    // Fetch cards from selected boards in parallel
    const cardArrays = await Promise.all(projects.map(p => getCards(p.id, p.stages.map(s => s.id))));
    const tasks = cardArrays.flat();

    setState({ projects, tasks, loading: false, trelloConnected: true });
    setTrelloCache(projects, tasks);
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

  const schedulerBtn = document.getElementById("btn-run-scheduler");
  schedulerBtn?.addEventListener("click", async () => {
    schedulerBtn.disabled = true;
    schedulerBtn.textContent = "Scheduling…";
    try {
      const { scheduled, late, warnings } = await runScheduler();
      rerenderCurrent();
      const lateMsg = late.length ? `, ${late.length} past due` : "";
      const warnMsg = warnings.length ? `, ${warnings.length} unschedulable` : "";
      toast(`Scheduled ${scheduled.length} task${scheduled.length !== 1 ? "s" : ""}${lateMsg}${warnMsg}`, "success");
    } catch (err) {
      toast("Scheduler error: " + err.message, "error");
    } finally {
      schedulerBtn.disabled = false;
      schedulerBtn.textContent = "Run Scheduler";
    }
  });

  // Handle Trello OAuth redirect — Trello appends #token=<value> to the URL
  const urlToken = extractTokenFromUrl();
  if (urlToken) {
    const pendingKey = localStorage.getItem("trello_key_pending") ?? "";
    if (pendingKey) {
      saveCredentials(pendingKey, urlToken);
      localStorage.removeItem("trello_key_pending");
      toast("Trello connected!", "success");
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

  // Refresh Trello data every 15 minutes
  setInterval(loadTrelloData, 15 * 60 * 1000);

  // Auto-refresh when the user returns to the tab after 30+ minutes away
  let hiddenAt = null;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
    } else if (hiddenAt && Date.now() - hiddenAt >= 30 * 60 * 1000) {
      hiddenAt = null;
      loadTrelloData();
    } else {
      hiddenAt = null;
    }
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", e => {
    // Don't fire when typing in an input or while a modal is open
    if (e.target.matches("input, textarea, select")) return;
    if (!document.getElementById("modal-overlay").classList.contains("hidden")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const { currentView } = getState();

    switch (e.key) {
      case "ArrowLeft":
        if (currentView === "weekly") { e.preventDefault(); navigateWeek(-1); }
        if (currentView === "daily")  { e.preventDefault(); navigateDay(-1); }
        break;
      case "ArrowRight":
        if (currentView === "weekly") { e.preventDefault(); navigateWeek(1); }
        if (currentView === "daily")  { e.preventDefault(); navigateDay(1); }
        break;
      case "s":
        switchView("settings");
        break;
      case "r": {
        const btn = document.getElementById("btn-run-scheduler");
        btn?.click();
        break;
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
