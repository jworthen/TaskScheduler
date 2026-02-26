/**
 * trello.js — Trello API integration layer
 *
 * Replaces Firestore as the data source.
 *   Board  → Project  (id, name, url, stages: lists)
 *   List   → Stage    (id, name, order)
 *   Card   → Task     (id, name, dueDate, labels→priority, desc→notes)
 *
 * Auth: API Key + OAuth Token (browser-only, no server required).
 *   1. User enters their Trello API key in Settings.
 *   2. App redirects to Trello OAuth, which appends #token=<value> on return.
 *   3. Key + token are persisted in localStorage.
 *
 * estimatedHours is read from the Trello "Effort" custom field (read-only).
 * All other scheduling metadata (scheduledStart/End, priority override,
 * manuallyScheduled, blockerIds) remains in localStorage.
 */

const API = "https://api.trello.com/1";

let _key   = "";
let _token = "";

// Cache of custom field definitions per board: boardId → { effortFieldId: string|null }
const _cfCache = new Map();

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function loadCredentials() {
  _key   = localStorage.getItem("trello_key")   ?? "";
  _token = localStorage.getItem("trello_token") ?? "";
  return isConnected();
}

export function saveCredentials(key, token) {
  _key   = key;
  _token = token;
  localStorage.setItem("trello_key",   key);
  localStorage.setItem("trello_token", token);
}

export function clearCredentials() {
  _key = _token = "";
  localStorage.removeItem("trello_key");
  localStorage.removeItem("trello_token");
}

export function isConnected() {
  return Boolean(_key && _token);
}

export function getApiKey() { return _key; }

/**
 * Extract the OAuth token from the URL hash after Trello redirects back.
 * Trello appends #token=<value> to the return_url.
 * Returns the token string, or null if not present.
 */
export function extractTokenFromUrl() {
  const hash   = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const token  = params.get("token");
  if (token) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    return token;
  }
  return null;
}

/**
 * Redirect to Trello's OAuth page.
 * On approval, Trello appends #token=<value> to the current page URL.
 */
export function startOAuth(apiKey) {
  localStorage.setItem("trello_key_pending", apiKey);
  const returnUrl = window.location.origin + window.location.pathname;
  const url = new URL("https://trello.com/1/authorize");
  url.searchParams.set("expiration",    "never");
  url.searchParams.set("scope",         "read,write");
  url.searchParams.set("response_type", "token");
  url.searchParams.set("name",          "TaskScheduler");
  url.searchParams.set("key",           apiKey);
  url.searchParams.set("return_url",    returnUrl);
  window.location.href = url.toString();
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function authQS(extra = {}) {
  return new URLSearchParams({ key: _key, token: _token, ...extra }).toString();
}

async function get(path, params = {}) {
  const res = await fetch(`${API}${path}?${authQS(params)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trello ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Boards (Projects) ────────────────────────────────────────────────────────

/**
 * Fetch custom field definitions for a board and cache the Effort field ID.
 * Matches the first number-type field whose name contains "effort" or "hours".
 */
async function loadCustomFieldDefs(boardId) {
  try {
    const defs = await get(`/boards/${boardId}/customFields`);
    const field = defs.find(f => f.type === "number" && /effort|hours/i.test(f.name));
    _cfCache.set(boardId, { effortFieldId: field?.id ?? null });
  } catch {
    _cfCache.set(boardId, { effortFieldId: null });
  }
}

/**
 * Fetch all open boards for the authenticated user,
 * enriched with their lists (stages) and custom field definitions.
 */
export async function getBoards() {
  const boards = await get("/members/me/boards", {
    filter: "open",
    fields: "id,name,shortUrl",
  });
  const enriched = await Promise.all(
    boards.map(async b => {
      const [stages] = await Promise.all([getLists(b.id), loadCustomFieldDefs(b.id)]);
      return { id: b.id, name: b.name, url: b.shortUrl, stages };
    })
  );
  return enriched;
}

// ─── Lists (Stages) ───────────────────────────────────────────────────────────

export async function getLists(boardId) {
  const lists = await get(`/boards/${boardId}/lists`, {
    filter: "open",
    fields: "id,name,pos",
  });
  return lists
    .sort((a, b) => a.pos - b.pos)
    .map((l, i) => ({ id: l.id, name: l.name, order: i }));
}

// ─── Cards (Tasks) ────────────────────────────────────────────────────────────

/** Fetch all open (non-archived) cards for a board, including custom field values. */
export async function getCards(boardId) {
  const cards = await get(`/boards/${boardId}/cards`, {
    filter: "open",
    fields: "id,name,desc,due,dueComplete,idList,labels,shortUrl",
    customFieldItems: "true",
  });
  return cards.map(c => cardToTask(c, boardId));
}

// ─── Scheduling metadata ──────────────────────────────────────────────────────
// estimatedHours is read from the Trello "Effort" custom field (read-only).
// All other scheduling metadata lives in localStorage.

const SCHED_NS = "ts_sched_";

export function getSchedMeta(cardId) {
  try {
    return JSON.parse(localStorage.getItem(SCHED_NS + cardId) ?? "{}");
  } catch { return {}; }
}

export function saveSchedMeta(cardId, patch) {
  const existing = getSchedMeta(cardId);
  localStorage.setItem(SCHED_NS + cardId, JSON.stringify({ ...existing, ...patch }));
}

export function clearSchedMeta(cardId) {
  localStorage.removeItem(SCHED_NS + cardId);
}

// ─── Data converters ──────────────────────────────────────────────────────────

function labelsToPriority(labels) {
  if (!labels?.length) return "medium";
  const colors = new Set(labels.map(l => l.color));
  if (colors.has("red") || colors.has("orange")) return "high";
  if (colors.has("green") || colors.has("sky") || colors.has("blue") || colors.has("purple")) return "low";
  return "medium";
}

/** Convert a Trello card API response to the internal task shape. */
export function cardToTask(card, boardId) {
  const meta = getSchedMeta(card.id);

  // Read estimatedHours from the Trello "Effort" custom field if available
  const { effortFieldId } = _cfCache.get(boardId) ?? {};
  const effortItem = effortFieldId
    ? (card.customFieldItems ?? []).find(f => f.idCustomField === effortFieldId)
    : null;
  const effortFromTrello = effortItem?.value?.number != null
    ? parseFloat(effortItem.value.number)
    : null;

  return {
    id:                card.id,
    name:              card.name,
    notes:             card.desc             ?? "",
    projectId:         boardId,
    stageId:           card.idList,
    priority:          meta.priority          ?? labelsToPriority(card.labels),
    estimatedHours:    effortFromTrello ?? meta.estimatedHours ?? 1,
    dueDate:           card.due               ? new Date(card.due) : null,
    completed:         card.dueComplete        ?? false,
    completedAt:       null,
    scheduledStart:    meta.scheduledStart    ? new Date(meta.scheduledStart) : null,
    scheduledEnd:      meta.scheduledEnd      ? new Date(meta.scheduledEnd)   : null,
    manuallyScheduled: meta.manuallyScheduled ?? false,
    blockerIds:        meta.blockerIds        ?? [],
    recurring:         false,
    trelloUrl:         card.shortUrl,
    labels:            card.labels            ?? [],
  };
}
