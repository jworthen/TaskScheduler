/**
 * views/settings.js — Settings panel
 *
 * Sections:
 *   1. Trello connection (API key + OAuth token)
 *   2. Working hours per day of week
 *   3. Time slot types (work bands on calendar)
 *   4. Auto-scheduler
 *   5. Google Calendar (optional busy-block integration)
 */

import { getState, setState } from "../store.js";
import { saveSettings } from "../db.js";
import { connectCalendar, isCalendarConnected } from "../calendar.js";
import { runScheduler } from "../scheduler.js";
import { toast } from "../ui-utils.js";
import {
  isConnected, getApiKey, startOAuth, clearCredentials, loadCredentials,
} from "../trello.js";
import { loadTrelloData, rerenderCurrent } from "../main.js";

const DAY_NAMES  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAY_ABBREV = ["Su","Mo","Tu","We","Th","Fr","Sa"];

export function renderSettings() {
  const el = document.getElementById("view-settings");
  const { settings } = getState();
  const wh        = settings?.workingHours ?? {};
  const workSlots = settings?.workSlots    ?? [];

  const connected   = isConnected();
  const allBoards   = getState().allBoards ?? [];
  const enabledIds  = settings?.enabledBoardIds ?? null;

  el.innerHTML = `
    <div class="view-header">
      <h2>Settings ⚙️</h2>
    </div>

    <!-- Trello connection -->
    <section class="settings-section">
      <h3>Trello Connection</h3>
      <p class="settings-hint">
        Connect your Trello account so the app can read your boards and cards.
        Your API key and token are stored only in your browser's localStorage.
      </p>
      <div class="cal-status">
        Status: <span id="trello-status-text">${connected ? "✅ Connected" : "❌ Not connected"}</span>
      </div>

      ${connected ? `
        <div class="settings-hint" style="margin-top: 0.5rem;">
          API key: <code>${esc(getApiKey())}</code>
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem;">
          <button class="btn-secondary" id="trello-refresh">🔄 Refresh boards &amp; cards</button>
          <button class="btn-ghost"     id="trello-disconnect">Disconnect</button>
        </div>

        ${allBoards.length ? `
        <div style="margin-top:1.25rem;">
          <p class="settings-hint" style="margin-bottom:8px;">Import cards from these boards:</p>
          <div class="board-filter-list">
            ${allBoards.map(b => `
              <label class="board-filter-row">
                <input type="checkbox" class="board-enabled-chk" data-board-id="${b.id}"
                       ${(!enabledIds || enabledIds.includes(b.id)) ? "checked" : ""} />
                ${esc(b.name)}
              </label>
            `).join("")}
          </div>
          <button class="btn-ghost btn-sm mt-sm" id="save-board-filter">Save board selection</button>
        </div>
        ` : ""}
      ` : `
        <div class="form-row" style="margin-top:0.75rem;">
          <label>Trello API Key <span class="hint">— from <a href="https://trello.com/app-key" target="_blank" rel="noopener">trello.com/app-key</a></span></label>
          <input type="text" id="trello-api-key" placeholder="Paste your API key here" autocomplete="off"
                 value="${esc(localStorage.getItem("trello_key_pending") ?? "")}" />
        </div>
        <button class="btn-primary" id="trello-connect">Connect Trello →</button>
      `}

      <details class="setup-instructions" style="margin-top:1rem;">
        <summary>Setup instructions</summary>
        <ol>
          <li>Go to <a href="https://trello.com/app-key" target="_blank" rel="noopener">trello.com/app-key</a> and copy your API Key.</li>
          <li>Paste it in the field above and click "Connect Trello →".</li>
          <li>Trello will ask you to approve access — click Allow.</li>
          <li>You'll be redirected back here automatically.</li>
        </ol>
      </details>
    </section>

    <!-- Working hours -->
    <section class="settings-section">
      <h3>Working Hours</h3>
      <p class="settings-hint">Set your available working hours per day. Leave blank to mark a day off.</p>
      <div class="working-hours-grid">
        ${DAY_NAMES.map((name, dow) => {
          const h = wh[dow];
          return `
            <div class="wh-row">
              <label class="wh-day">
                <input type="checkbox" class="wh-enabled" data-dow="${dow}" ${h ? "checked" : ""} />
                ${name}
              </label>
              <input type="time" class="wh-start" data-dow="${dow}" value="${h?.start ?? "09:00"}" ${!h ? "disabled" : ""} />
              <span>–</span>
              <input type="time" class="wh-end" data-dow="${dow}" value="${h?.end ?? "17:00"}" ${!h ? "disabled" : ""} />
            </div>
          `;
        }).join("")}
      </div>
      <button class="btn-primary" id="save-working-hours">Save working hours</button>
    </section>

    <!-- Time Slot Types -->
    <section class="settings-section">
      <h3>Time Slot Types</h3>
      <p class="settings-hint">
        Define named time windows (e.g. "Morning", "Afternoons", "Evenings") that can be assigned
        to tasks and shown as colour bands on the calendar.
      </p>
      <div id="ws-list" class="ws-list">
        ${workSlots.map(s => workSlotRow(s)).join("")}
      </div>
      <button class="btn-ghost" id="add-work-slot">+ Add time slot</button>
    </section>

    <!-- Scheduler -->
    <section class="settings-section">
      <h3>Auto-Scheduler</h3>
      <p class="settings-hint">Automatically place unscheduled Trello cards in the latest available slot before their due date.</p>
      <button class="btn-primary" id="run-scheduler">🗓 Run auto-scheduler</button>
      <div id="scheduler-result" class="scheduler-result hidden"></div>
    </section>

    <!-- Google Calendar -->
    <section class="settings-section">
      <h3>Google Calendar</h3>
      <p class="settings-hint">
        Connect your Google Calendar so the scheduler can avoid your busy blocks.<br/>
        <strong>Read-only</strong> — this app never writes to your calendar.
      </p>
      <div class="cal-status">
        Status: <span id="cal-status-text">${isCalendarConnected() ? "✅ Connected" : "❌ Not connected"}</span>
      </div>
      <button class="btn-secondary" id="connect-calendar">
        ${isCalendarConnected() ? "🔄 Reconnect Calendar" : "📆 Connect Google Calendar"}
      </button>
      <details class="setup-instructions">
        <summary>Setup instructions</summary>
        <ol>
          <li>Open <code>js/firebase-config.js</code> and set <code>GOOGLE_CALENDAR_CLIENT_ID</code>.</li>
          <li>In Google Cloud Console, enable the <em>Google Calendar API</em>.</li>
          <li>Create an OAuth 2.0 Web Client ID; add this page's origin to Authorized JS origins.</li>
          <li>Add your email as a test user in the OAuth consent screen.</li>
          <li>Click "Connect Google Calendar" above and sign in.</li>
        </ol>
      </details>
    </section>
  `;

  // ── Trello section ────────────────────────────────────────────────────────────
  if (connected) {
    el.querySelector("#trello-refresh").addEventListener("click", async () => {
      const btn = el.querySelector("#trello-refresh");
      btn.disabled = true;
      btn.textContent = "⏳ Refreshing…";
      try {
        await loadTrelloData();
        toast("Boards and cards refreshed! 🔄", "success");
      } catch (err) {
        toast("Refresh failed: " + err.message, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "🔄 Refresh boards & cards";
      }
    });

    const saveBoardFilterBtn = el.querySelector("#save-board-filter");
    if (saveBoardFilterBtn) {
      saveBoardFilterBtn.addEventListener("click", async () => {
        const checked = [...el.querySelectorAll(".board-enabled-chk:checked")]
          .map(c => c.dataset.boardId);
        saveSettings({ enabledBoardIds: checked });
        setState({ settings: { ...getState().settings, enabledBoardIds: checked } });
        saveBoardFilterBtn.disabled = true;
        saveBoardFilterBtn.textContent = "⏳ Reloading…";
        try {
          await loadTrelloData();
          toast("Board selection saved!", "success");
        } finally {
          saveBoardFilterBtn.disabled = false;
          saveBoardFilterBtn.textContent = "Save board selection";
        }
      });
    }

    el.querySelector("#trello-disconnect").addEventListener("click", () => {
      if (!confirm("Disconnect Trello? This will clear your API key and token from the browser.")) return;
      clearCredentials();
      setState({ trelloConnected: false, projects: [], tasks: [] });
      toast("Trello disconnected.", "info");
      renderSettings();
      document.getElementById("config-banner").style.display = "";
    });
  } else {
    el.querySelector("#trello-connect").addEventListener("click", () => {
      const key = el.querySelector("#trello-api-key").value.trim();
      if (!key) { toast("Please paste your Trello API key first.", "error"); return; }
      startOAuth(key);
    });
  }

  // ── Working hours ─────────────────────────────────────────────────────────────
  el.querySelectorAll(".wh-enabled").forEach(chk => {
    chk.addEventListener("change", () => {
      const dow   = chk.dataset.dow;
      const start = el.querySelector(`.wh-start[data-dow="${dow}"]`);
      const end   = el.querySelector(`.wh-end[data-dow="${dow}"]`);
      start.disabled = !chk.checked;
      end.disabled   = !chk.checked;
    });
  });

  el.querySelector("#save-working-hours").addEventListener("click", () => {
    const workingHours = {};
    for (let dow = 0; dow < 7; dow++) {
      const chk   = el.querySelector(`.wh-enabled[data-dow="${dow}"]`);
      const start = el.querySelector(`.wh-start[data-dow="${dow}"]`).value;
      const end   = el.querySelector(`.wh-end[data-dow="${dow}"]`).value;
      workingHours[dow] = chk.checked ? { start, end } : null;
    }
    const updated = { ...(getState().settings ?? {}), workingHours };
    setState({ settings: updated });
    saveSettings({ workingHours });
    toast("Working hours saved! 🕐", "success");
  });

  // ── Work slot CRUD ────────────────────────────────────────────────────────────
  el.querySelector("#add-work-slot").addEventListener("click", () => {
    const list = el.querySelector("#ws-list");
    const newSlot = {
      id:        crypto.randomUUID(),
      name:      "",
      startTime: "09:00",
      endTime:   "17:00",
      color:     "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"),
      days:      [1, 2, 3, 4, 5],
    };
    list.insertAdjacentHTML("beforeend", workSlotRow(newSlot));
    const newRow = list.lastElementChild;
    newRow.querySelector(".ws-name").focus();
    bindWorkSlotRow(newRow);
  });

  el.querySelectorAll(".ws-row").forEach(row => bindWorkSlotRow(row));

  // ── Auto-scheduler ────────────────────────────────────────────────────────────
  el.querySelector("#run-scheduler").addEventListener("click", async () => {
    const btn = el.querySelector("#run-scheduler");
    const resultDiv = el.querySelector("#scheduler-result");
    btn.disabled = true;
    btn.textContent = "⏳ Scheduling…";
    try {
      const { scheduled, late, warnings } = await runScheduler();
      resultDiv.classList.remove("hidden");
      resultDiv.innerHTML = `
        <p>✅ Scheduled <strong>${scheduled.length}</strong> task${scheduled.length !== 1 ? "s" : ""}.</p>
        ${late.length ? `<p class="warn-text">⚠️ <strong>${late.length}</strong> task${late.length !== 1 ? "s" : ""} scheduled past their due date: ${late.map(t => esc(t.name)).join(", ")}</p>` : ""}
        ${warnings.length ? `<p class="warn-text">⛔ <strong>${warnings.length}</strong> task${warnings.length !== 1 ? "s" : ""} could not be scheduled: ${warnings.map(t => esc(t.name)).join(", ")}</p>` : ""}
      `;
      toast(`Scheduled ${scheduled.length} task${scheduled.length !== 1 ? "s" : ""}! 🗓`, "success");
      rerenderCurrent();
    } catch (err) {
      toast("Scheduler error: " + err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "🗓 Run auto-scheduler";
    }
  });

  // ── Google Calendar ───────────────────────────────────────────────────────────
  el.querySelector("#connect-calendar").addEventListener("click", async () => {
    try {
      await connectCalendar();
      el.querySelector("#cal-status-text").textContent = "✅ Connected";
      toast("Calendar connected! 📆", "success");
    } catch (err) {
      toast("Calendar error: " + err.message, "error");
    }
  });
}

// ─── Work slot helpers ────────────────────────────────────────────────────────

function workSlotRow(slot) {
  const dayBtns = DAY_ABBREV.map((label, i) => {
    const dow    = [0,1,2,3,4,5,6][i];
    const active = (slot.days ?? []).includes(dow);
    return `<button type="button" class="ws-day-btn ${active ? "active" : ""}" data-dow="${dow}">${label}</button>`;
  }).join("");
  return `
    <div class="ws-row" data-ws-id="${slot.id}">
      <input type="color" class="ws-color" value="${slot.color}" title="Slot colour" />
      <input type="text"  class="ws-name"  value="${esc(slot.name)}" placeholder="Slot name (e.g. Morning)" maxlength="40" />
      <input type="time"  class="ws-start" value="${slot.startTime}" />
      <span class="ws-sep">–</span>
      <input type="time"  class="ws-end"   value="${slot.endTime}" />
      <div class="ws-days">${dayBtns}</div>
      <button type="button" class="btn-ghost btn-sm ws-save"   title="Save">💾</button>
      <button type="button" class="btn-ghost btn-sm ws-delete" title="Delete">🗑️</button>
    </div>
  `;
}

function bindWorkSlotRow(row) {
  row.querySelectorAll(".ws-day-btn").forEach(btn => {
    btn.addEventListener("click", () => btn.classList.toggle("active"));
  });

  row.querySelector(".ws-save").addEventListener("click", () => {
    saveWorkSlotsFromDOM();
    toast("Time slots saved! 🕐", "success");
  });

  row.querySelector(".ws-delete").addEventListener("click", () => {
    row.remove();
    saveWorkSlotsFromDOM();
    toast("Time slot removed.", "info");
  });
}

function saveWorkSlotsFromDOM() {
  const rows = document.querySelectorAll(".ws-row");
  const workSlots = Array.from(rows).map(row => ({
    id:        row.dataset.wsId,
    name:      row.querySelector(".ws-name").value.trim(),
    startTime: row.querySelector(".ws-start").value,
    endTime:   row.querySelector(".ws-end").value,
    color:     row.querySelector(".ws-color").value,
    days:      Array.from(row.querySelectorAll(".ws-day-btn.active"))
                    .map(b => parseInt(b.dataset.dow)),
  })).filter(s => s.name);

  const updated = { ...(getState().settings ?? {}), workSlots };
  setState({ settings: updated });
  saveSettings({ workSlots });
}

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
