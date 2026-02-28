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
 * Fetch custom field definitions for a board and cache the Effort and Priority field IDs.
 * Matches the first number-type field whose name contains "effort" or "hours",
 * and the first list/text-type field whose name contains "priority".
 */
async function loadCustomFieldDefs(boardId) {
  try {
    const defs = await get(`/boards/${boardId}/customFields`);
    const effortField   = defs.find(f => f.type === "number" && /effort|hours/i.test(f.name));
    const priorityField = defs.find(f => /priority/i.test(f.name));
    const blockedByField = defs.find(f => f.type === "text" && /blocked.?by|blocker/i.test(f.name));

    // For list-type priority fields, build an idValue → normalised string map
    let priorityOptions = null;
    if (priorityField?.type === "list") {
      priorityOptions = {};
      for (const opt of priorityField.options ?? []) {
        priorityOptions[opt.id] = opt.value?.text ?? "";
      }
    }

    _cfCache.set(boardId, {
      effortFieldId:    effortField?.id    ?? null,
      priorityFieldId:  priorityField?.id  ?? null,
      priorityFieldType: priorityField?.type ?? null,
      priorityOptions,
      blockedByFieldId: blockedByField?.id ?? null,
    });
  } catch {
    _cfCache.set(boardId, { effortFieldId: null, priorityFieldId: null, priorityFieldType: null, priorityOptions: null, blockedByFieldId: null });
  }
}

/**
 * Lightweight fetch of all open boards the user owns.
 * Returns id/name/url only — no stages or custom field enrichment.
 * Used to populate the board-selection UI in Settings.
 */
export async function getAvailableBoards() {
  return get("/members/me/boards", {
    filter: "open",
    fields: "id,name,shortUrl",
    membership_type: "admin",
  });
}

/**
 * Enrich a subset of boards with their open lists (stages) and
 * custom field definitions, ready for card fetching.
 */
export async function enrichBoards(boards) {
  return Promise.all(
    boards.map(async b => {
      const [stages] = await Promise.all([getLists(b.id), loadCustomFieldDefs(b.id)]);
      return { id: b.id, name: b.name, url: b.shortUrl, stages };
    })
  );
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

/** Fetch open cards that have a due date and are not yet complete.
 *  openListIds filters out cards whose list has been archived (Trello's
 *  card-level "open" filter does not exclude cards in archived lists). */
export async function getCards(boardId, openListIds) {
  const cards = await get(`/boards/${boardId}/cards`, {
    filter: "open",
    fields: "id,name,desc,due,dueComplete,start,idList,labels,shortUrl",
    customFieldItems: "true",
  });
  const openListSet = new Set(openListIds);
  const relevant = cards.filter(c => c.due && !c.dueComplete && openListSet.has(c.idList));

  // Build shortLink → cardId map so "Blocked By" field values can be resolved.
  // The shortUrl looks like "https://trello.com/c/Abc12345"; we extract "Abc12345".
  const shortLinkMap = {};
  for (const c of relevant) {
    const link = c.shortUrl?.split("/c/")[1];
    if (link) shortLinkMap[link] = c.id;
  }

  return relevant.map(c => cardToTask(c, boardId, shortLinkMap));
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

/**
 * Strip the `blockerIds` field from every ts_sched_* localStorage entry,
 * leaving all other scheduling metadata (hours, schedule, etc.) intact.
 * Call this before a Trello re-import to ensure Trello is the sole source
 * of truth for blocker relationships.
 */
export function clearAllBlockerIds() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(SCHED_NS)) keys.push(key);
  }
  for (const key of keys) {
    try {
      const meta = JSON.parse(localStorage.getItem(key) ?? "{}");
      if ("blockerIds" in meta) {
        delete meta.blockerIds;
        localStorage.setItem(key, JSON.stringify(meta));
      }
    } catch { /* ignore malformed entries */ }
  }
}

// ─── Data converters ──────────────────────────────────────────────────────────

function labelsToPriority(labels) {
  if (!labels?.length) return "medium";
  const colors = new Set(labels.map(l => l.color));
  if (colors.has("red") || colors.has("orange")) return "high";
  if (colors.has("green") || colors.has("sky") || colors.has("blue") || colors.has("purple")) return "low";
  return "medium";
}

/**
 * Normalise a raw priority string to "high" | "medium" | "low" | null.
 * Accepts values like "High", "P1", "1", "urgent", etc.
 */
function normalisePriority(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (/high|urgent|critical|p1|^1$/.test(s)) return "high";
  if (/med|normal|p2|^2$/.test(s))           return "medium";
  if (/low|minor|p3|^3$/.test(s))            return "low";
  return null;
}

/**
 * Extract a normalised priority string from a custom field item.
 * Handles list, text, and number field types.
 */
function priorityFromItem(item, fieldType, options) {
  if (!item) return null;
  if (fieldType === "list")   return normalisePriority(options?.[item.idValue]);
  if (fieldType === "text")   return normalisePriority(item.value?.text);
  if (fieldType === "number") return normalisePriority(item.value?.number);
  return null;
}

/** Convert a Trello card API response to the internal task shape. */
export function cardToTask(card, boardId, shortLinkMap = {}) {
  const meta = getSchedMeta(card.id);

  const { effortFieldId, priorityFieldId, priorityFieldType, priorityOptions, blockedByFieldId } = _cfCache.get(boardId) ?? {};

  // Read estimatedHours from the Trello "Effort" custom field if available
  const effortItem = effortFieldId
    ? (card.customFieldItems ?? []).find(f => f.idCustomField === effortFieldId)
    : null;
  const effortFromTrello = effortItem?.value?.number != null
    ? parseFloat(effortItem.value.number)
    : null;

  // Read priority from the Trello "Priority" custom field if available,
  // falling back to label-colour derivation.
  const priorityItem = priorityFieldId
    ? (card.customFieldItems ?? []).find(f => f.idCustomField === priorityFieldId)
    : null;
  const priorityFromTrello = priorityFromItem(priorityItem, priorityFieldType, priorityOptions);

  // Read blocker short links from the Trello "Blocked By" custom field (text type).
  // Expected format: comma- or space-separated card short links, e.g. "Abc12345, Xyz67890".
  // Short links are the 8-char IDs from card URLs (https://trello.com/c/<shortLink>).
  // When the board has a "Blocked By" field defined, Trello is always authoritative
  // (cards with no value set resolve to []). Only fall back to localStorage when the
  // board has no such custom field at all.
  const blockedByItem = blockedByFieldId
    ? (card.customFieldItems ?? []).find(f => f.idCustomField === blockedByFieldId)
    : null;
  const blockerIdsFromTrello = blockedByFieldId != null
    ? (blockedByItem?.value?.text ?? "")
        .split(/[\s,]+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(link => shortLinkMap[link] ?? null)
        .filter(Boolean)
    : null;

  return {
    id:                card.id,
    name:              card.name,
    notes:             card.desc             ?? "",
    projectId:         boardId,
    stageId:           card.idList,
    priority:          priorityFromTrello ?? meta.priority ?? labelsToPriority(card.labels),
    estimatedHours:    effortFromTrello ?? meta.estimatedHours ?? 1,
    dueDate:           card.due               ? new Date(card.due)   : null,
    startDate:         card.start             ? new Date(card.start) : null,
    completed:         card.dueComplete        ?? false,
    completedAt:       null,
    scheduledStart:     meta.scheduledStart    ? new Date(meta.scheduledStart) : null,
    scheduledEnd:       meta.scheduledEnd      ? new Date(meta.scheduledEnd)   : null,
    scheduledBlocks:    meta.scheduledBlocks
      ? meta.scheduledBlocks.map(b => ({ start: new Date(b.start), end: new Date(b.end) }))
      : null,
    schedUnschedulable:       meta.schedUnschedulable       ?? false,
    schedUnschedulableReason: meta.schedUnschedulableReason ?? null,
    manuallyScheduled:  meta.manuallyScheduled ?? false,
    blockerIds:        blockerIdsFromTrello ?? meta.blockerIds ?? [],
    recurring:         false,
    trelloUrl:         card.shortUrl,
    labels:            card.labels            ?? [],
  };
}
