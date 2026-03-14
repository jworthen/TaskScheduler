# Slightly Biased Scheduler — Roadmap

A web-based task scheduler for a solo quilting pattern design business.
Single-user, browser-only. Task data lives in Trello; scheduling metadata
and settings are stored in localStorage. No backend server.

---

## ✅ Phase 1 — Core App (complete)

- [x] Trello integration: boards → projects, lists → stages, cards → tasks
- [x] Trello OAuth flow: API key + token stored in localStorage
- [x] Per-board import filtering (choose which boards to load)
- [x] Scheduling engine: work-backward from due date, latest-possible-slot placement
- [x] Split-task scheduling: tasks too long for one slot are spread across multiple blocks
- [x] Soft due dates: if no slot before deadline, schedule at earliest slot after it
- [x] Blocker enforcement: topological sort ensures dependencies are scheduled first
- [x] Priority ordering: High → Medium → Low as tiebreaker (override Trello label)
- [x] Working hours config: per-day-of-week start/end times
- [x] Time slot types: named colour bands (Morning, Afternoon, Evening) on calendar
- [x] Google Calendar OAuth (read-only): busy blocks excluded from scheduling
- [x] Dashboard: due this week, hours today, overdue, blocked, scheduled-past-due
- [x] Weekly view: 7-day grid, drag-and-drop rescheduling, unschedule drop zone
- [x] Daily Focus view: timeline with progress bar, split-block display
- [x] All Tasks list: filterable table, open-in-Trello links
- [x] Settings: Trello connection, working hours, time slots, scheduler, calendar
- [x] Scheduling metadata persisted to localStorage (survives page refresh)

---

## ✅ Phase 2 — Mobile & Deployment (complete)

- [x] Responsive layout: sidebar hidden on mobile, fixed bottom nav bar
- [x] Touch-friendly tap targets (min 44 × 44 px)
- [x] Weekly grid: horizontally scrollable on small screens
- [x] Modals: slide up as bottom sheet on mobile
- [x] Safe-area padding for iOS home indicator
- [x] Deployed to GitHub Pages (auto-deploys on push to main)
- [x] Works as add-to-home-screen shortcut on iOS and Android

---

## 🔨 Phase 3 — Polish & Real-world Use (up next)

- [ ] Auto-refresh Trello data when the app regains focus (returning from Trello)
- [ ] Auto-run scheduler after a manual Trello refresh
- [ ] First-run onboarding: clear prompt to connect Trello if not yet connected
- [ ] Better empty states: helpful nudges when no tasks are scheduled for a day
- [ ] Keyboard shortcuts: ←/→ week/day navigation, S = settings, R = run scheduler
- [ ] "Add to home screen" prompt/banner for first-time mobile visitors
- [ ] Trello connection persists across devices via URL token (optional QR flow)

---

## 💡 Phase 4 — Nice-to-haves

- [ ] Offline support: service worker to cache app shell so it loads without internet
- [ ] Export scheduled week to CSV or printable view
- [ ] Print-friendly Daily Focus view
- [ ] Color-coded project indicators in calendar views (by Trello board colour)
- [ ] Bulk scheduling actions in All Tasks (set estimated hours for many cards at once)
- [ ] "Reschedule all" button that clears auto-scheduled slots and reruns the scheduler

---

## Out of scope (by design)

- User accounts / authentication
- Multi-user / team features
- Native mobile app
- Backend server
- Writing to Google Calendar or Trello
