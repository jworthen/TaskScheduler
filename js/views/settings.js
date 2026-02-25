/**
 * views/settings.js — Settings panel
 * - Working hours per day of week
 * - Category management (add / rename / delete / recolor)
 * - Google Calendar OAuth setup
 * - Run auto-scheduler button
 */

import { getState, setState } from "../store.js";
import { saveSettings } from "../db.js";
import { connectCalendar, isCalendarConnected } from "../calendar.js";
import { runScheduler } from "../scheduler.js";
import { toast } from "../ui-utils.js";

const DAY_NAMES  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAY_ABBREV = ["Su","Mo","Tu","We","Th","Fr","Sa"];

export function renderSettings() {
  const el = document.getElementById("view-settings");
  const { settings } = getState();
  const wh         = settings?.workingHours ?? {};
  const cats       = settings?.categories   ?? [];
  const workSlots  = settings?.workSlots    ?? [];

  el.innerHTML = `
    <div class="view-header">
      <h2>Settings ⚙️</h2>
    </div>

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

    <!-- Categories -->
    <section class="settings-section">
      <h3>Categories</h3>
      <p class="settings-hint">Organise your tasks by category. Pick a colour for each.</p>
      <div id="cat-list" class="cat-list">
        ${cats.map(c => catRow(c)).join("")}
      </div>
      <button class="btn-ghost" id="add-category">+ Add category</button>
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
      <p class="settings-hint">Automatically place unscheduled tasks in the latest available slot before their due date.</p>
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

    <!-- Firebase config -->
    <section class="settings-section">
      <h3>Firebase / Firestore</h3>
      <p class="settings-hint">
        Edit <code>js/firebase-config.js</code> to add your Firebase project credentials.
        See the comments at the top of that file for step-by-step instructions.
      </p>
    </section>
  `;

  // Working hours checkboxes enable/disable time inputs
  el.querySelectorAll(".wh-enabled").forEach(chk => {
    chk.addEventListener("change", () => {
      const dow   = chk.dataset.dow;
      const start = el.querySelector(`.wh-start[data-dow="${dow}"]`);
      const end   = el.querySelector(`.wh-end[data-dow="${dow}"]`);
      start.disabled = !chk.checked;
      end.disabled   = !chk.checked;
    });
  });

  // Save working hours
  el.querySelector("#save-working-hours").addEventListener("click", async () => {
    const workingHours = {};
    for (let dow = 0; dow < 7; dow++) {
      const chk   = el.querySelector(`.wh-enabled[data-dow="${dow}"]`);
      const start = el.querySelector(`.wh-start[data-dow="${dow}"]`).value;
      const end   = el.querySelector(`.wh-end[data-dow="${dow}"]`).value;
      workingHours[dow] = chk.checked ? { start, end } : null;
    }
    try {
      const updated = { ...(getState().settings ?? {}), workingHours };
      setState({ settings: updated });
      await saveSettings({ workingHours });
      toast("Working hours saved! 🕐", "success");
    } catch (err) {
      toast("Error saving: " + err.message, "error");
    }
  });

  // Category management
  el.querySelector("#add-category").addEventListener("click", () => {
    const list = el.querySelector("#cat-list");
    const newCat = {
      id:    crypto.randomUUID(),
      name:  "",
      color: "#" + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,"0"),
    };
    list.insertAdjacentHTML("beforeend", catRow(newCat));
    const newRow = list.lastElementChild;
    newRow.querySelector(".cat-name-input").focus();
    bindCatRow(newRow);
  });

  el.querySelectorAll(".cat-row").forEach(row => bindCatRow(row));

  // Work slot CRUD
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

  // Run scheduler
  el.querySelector("#run-scheduler").addEventListener("click", async () => {
    const btn = el.querySelector("#run-scheduler");
    const resultDiv = el.querySelector("#scheduler-result");
    btn.disabled = true;
    btn.textContent = "⏳ Scheduling…";
    try {
      const { scheduled, warnings } = await runScheduler();
      resultDiv.classList.remove("hidden");
      resultDiv.innerHTML = `
        <p>✅ Scheduled <strong>${scheduled.length}</strong> task${scheduled.length !== 1 ? "s" : ""}.</p>
        ${warnings.length ? `<p class="warn-text">⚠️ <strong>${warnings.length}</strong> task${warnings.length !== 1 ? "s" : ""} could not be scheduled before their deadline: ${warnings.map(t => esc(t.name)).join(", ")}</p>` : ""}
      `;
      toast(`Scheduled ${scheduled.length} task${scheduled.length !== 1 ? "s" : ""}! 🗓`, "success");
    } catch (err) {
      toast("Scheduler error: " + err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "🗓 Run auto-scheduler";
    }
  });

  // Connect calendar
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

function catRow(cat) {
  const img = cat.imageUrl ?? "";
  return `
    <div class="cat-row" data-cat-id="${cat.id}">
      <div class="cat-row-main">
        <input type="color" class="cat-color" value="${cat.color}" title="Category colour" />
        <input type="text"  class="cat-name-input" value="${esc(cat.name)}" placeholder="Category name" maxlength="60" />
        <button class="btn-ghost btn-sm cat-img-toggle" title="Set cover image">🖼</button>
        <button class="btn-ghost btn-sm cat-save"   title="Save">💾</button>
        <button class="btn-ghost btn-sm cat-delete" title="Delete">🗑️</button>
      </div>
      <div class="cat-img-row ${img ? "" : "hidden"}">
        ${img ? `<img class="cat-img-preview" src="${esc(img)}" alt="cover" />` : `<div class="cat-img-preview cat-img-placeholder"></div>`}
        <input type="url" class="cat-img-input" placeholder="Paste image URL…" value="${esc(img)}" />
      </div>
    </div>
  `;
}

function bindCatRow(row) {
  row.querySelector(".cat-save").addEventListener("click", async () => {
    await saveCategoriesFromDOM();
    toast("Categories saved!", "success");
  });
  row.querySelector(".cat-delete").addEventListener("click", async () => {
    row.remove();
    await saveCategoriesFromDOM();
    toast("Category removed.", "info");
  });

  // Toggle image URL row
  row.querySelector(".cat-img-toggle").addEventListener("click", () => {
    row.querySelector(".cat-img-row").classList.toggle("hidden");
  });

  // Live-update preview when URL changes
  const imgInput = row.querySelector(".cat-img-input");
  const imgArea  = row.querySelector(".cat-img-row");
  imgInput.addEventListener("input", () => {
    const url = imgInput.value.trim();
    let preview = imgArea.querySelector(".cat-img-preview");
    if (url) {
      if (preview.tagName !== "IMG") {
        const img = document.createElement("img");
        img.className = "cat-img-preview";
        img.alt = "cover";
        imgArea.replaceChild(img, preview);
        preview = img;
      }
      preview.src = url;
    } else {
      if (preview.tagName === "IMG") {
        const placeholder = document.createElement("div");
        placeholder.className = "cat-img-preview cat-img-placeholder";
        imgArea.replaceChild(placeholder, preview);
      }
    }
  });
}

async function saveCategoriesFromDOM() {
  const rows = document.querySelectorAll(".cat-row");
  const categories = Array.from(rows).map(row => ({
    id:       row.dataset.catId,
    name:     row.querySelector(".cat-name-input").value.trim(),
    color:    row.querySelector(".cat-color").value,
    imageUrl: row.querySelector(".cat-img-input").value.trim() || null,
  })).filter(c => c.name);

  const updated = { ...(getState().settings ?? {}), categories };
  setState({ settings: updated });
  await saveSettings({ categories });
}

// ─── Work slot helpers ────────────────────────────────────────────────────────

function workSlotRow(slot) {
  const dayBtns = DAY_ABBREV.map((label, i) => {
    // i maps: 0=Su,1=Mo,2=Tu,3=We,4=Th,5=Fr,6=Sa → dow index
    const dow = [0,1,2,3,4,5,6][i];
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
  // Day toggle buttons
  row.querySelectorAll(".ws-day-btn").forEach(btn => {
    btn.addEventListener("click", () => btn.classList.toggle("active"));
  });

  row.querySelector(".ws-save").addEventListener("click", async () => {
    await saveWorkSlotsFromDOM();
    toast("Time slots saved! 🕐", "success");
  });

  row.querySelector(".ws-delete").addEventListener("click", async () => {
    row.remove();
    await saveWorkSlotsFromDOM();
    toast("Time slot removed.", "info");
  });
}

async function saveWorkSlotsFromDOM() {
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
  await saveSettings({ workSlots });
}

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
