/**
 * calendar.js — Google Calendar read-only integration
 *
 * SETUP (see also firebase-config.js):
 * 1. Enable the Google Calendar API in Google Cloud Console.
 * 2. Create an OAuth 2.0 Web Client ID.
 * 3. Paste the Client ID into firebase-config.js → GOOGLE_CALENDAR_CLIENT_ID.
 * 4. Add http://localhost:PORT to "Authorized JavaScript origins".
 *
 * This module uses the Google Identity Services (GIS) library for OAuth,
 * then calls the Calendar API via fetch — no gapi needed.
 */

import { GOOGLE_CALENDAR_CLIENT_ID } from "./firebase-config.js";
import { setState } from "./store.js";
import { saveSettings } from "./db.js";

const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";
let tokenClient  = null;
let accessToken  = null;

/** Load the GIS library dynamically and initialise the token client */
export function initCalendar() {
  return new Promise(resolve => {
    if (!GOOGLE_CALENDAR_CLIENT_ID || GOOGLE_CALENDAR_CLIENT_ID.includes("YOUR_")) {
      resolve(false);
      return;
    }
    const script = document.createElement("script");
    script.src   = "https://accounts.google.com/gsi/client";
    script.onload = () => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CALENDAR_CLIENT_ID,
        scope:     SCOPES,
        callback:  () => {}, // set per-call
      });
      resolve(true);
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

/** Trigger OAuth consent / token refresh */
export function connectCalendar() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) { reject(new Error("Calendar not initialised")); return; }
    tokenClient.callback = async (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      accessToken = resp.access_token;
      setState({ calendarConnected: true });
      await saveSettings({ calendarConnected: true });
      await refreshCalendarEvents();
      resolve(true);
    };
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

/** Fetch busy blocks for the next 60 days from all calendars */
export async function refreshCalendarEvents() {
  if (!accessToken) return;

  const now    = new Date();
  const future = new Date();
  future.setDate(future.getDate() + 60);

  const url = new URL("https://www.googleapis.com/calendar/v3/freeBusy");
  const body = {
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    items:   [{ id: "primary" }],
  };

  const resp = await fetch(url.toString(), {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) return;
  const data = await resp.json();

  const busy = (data.calendars?.primary?.busy ?? []).map(b => ({
    start: b.start,
    end:   b.end,
  }));

  setState({ calendarEvents: busy });
  return busy;
}

export function isCalendarConnected() {
  return !!accessToken;
}
