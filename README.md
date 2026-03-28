# Pattern Planner

A personal task scheduler for [Slightly Biased Quilts](https://jworthen.github.io). Built for one person, runs entirely in the browser — no server, no account, no cloud database.

Task data lives in Trello. Scheduling metadata (estimated hours, priority, scheduled slots) is stored in your browser's localStorage. Nothing leaves your device except Trello API calls.

**Live app:** https://jworthen.github.io/TaskScheduler/

---

## What it does

- Pulls boards, lists, and cards from Trello
- Automatically schedules tasks into your working hours using a latest-possible-slot algorithm
- Respects due dates, task dependencies (blockers), priority, and preferred time slots
- Shows a weekly calendar grid and a daily focus view
- Reads Google Calendar (read-only) to avoid scheduling over busy blocks
- Persists your schedule across page refreshes via localStorage

---

## Setup

### 1. Trello

1. Go to [trello.com/app-key](https://trello.com/app-key) and copy your API key
2. Open the app, go to Settings → Trello Connection, and paste it in
3. Click Connect — Trello will ask you to approve access, then redirect back

### 2. Google Calendar (optional)

The app can read your Google Calendar to avoid scheduling over events.

1. Create a Google Cloud project and enable the **Google Calendar API**
2. Create an OAuth 2.0 Web Client ID; add `https://jworthen.github.io` to Authorized JavaScript origins
3. Copy the client ID into `js/firebase-config.js`:
   ```js
   export const GOOGLE_CALENDAR_CLIENT_ID = "your-client-id.apps.googleusercontent.com";
   ```
4. Add your Google account as a test user in the OAuth consent screen
5. In the app, go to Settings → Google Calendar and click Connect

---

## Deployment

The app deploys automatically to GitHub Pages on every push to `main` via the workflow in `.github/workflows/deploy.yml`. No build step required — it's plain HTML, CSS, and ES modules.

To deploy manually or to a different host, serve the repo root as static files. Any static host works (Netlify, Vercel, Firebase Hosting, etc.).

---

## Tech

- Vanilla JavaScript (ES modules, no build tools)
- Plain CSS with CSS custom properties
- Trello REST API v1
- Google Calendar API v3 via Google Identity Services
- localStorage for all persistence
- GitHub Pages for hosting
- Proxima Soft for typography
