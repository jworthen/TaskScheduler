/**
 * ui-utils.js — Shared UI helpers: modal, toast, form building
 */

// ─── Toast ───────────────────────────────────────────────────────────────────

export function toast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = message;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    t.addEventListener("transitionend", () => t.remove());
  }, 3500);
}

// ─── Modal ───────────────────────────────────────────────────────────────────

let _onModalClose = null;

export function openModal(titleHtml, bodyHtml, onClose) {
  document.getElementById("modal-content").innerHTML =
    `<h2 class="modal-title">${titleHtml}</h2><div class="modal-body">${bodyHtml}</div>`;
  document.getElementById("modal-overlay").classList.remove("hidden");
  _onModalClose = onClose ?? null;
}

export function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.getElementById("modal-content").innerHTML = "";
  if (_onModalClose) { _onModalClose(); _onModalClose = null; }
}

export function initModal() {
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", e => {
    if (e.target === document.getElementById("modal-overlay")) closeModal();
  });
}

// ─── Priority badge ──────────────────────────────────────────────────────────

export function priorityBadge(priority) {
  const map = { high: "High", medium: "Medium", low: "Low" };
  return `<span class="badge badge-priority badge-${priority}">${map[priority] ?? priority}</span>`;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

export function formatDate(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function formatTime(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

export function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// ─── Category color chip ─────────────────────────────────────────────────────

export function categoryChip(category) {
  if (!category) return "";
  return `<span class="category-chip" style="background:${category.color}20;color:${category.color};border-color:${category.color}40">${category.name}</span>`;
}

// ─── Confirm dialog ──────────────────────────────────────────────────────────

export function confirmAction(message) {
  return window.confirm(message);
}
