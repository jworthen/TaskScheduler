# Pattern Planner — Roadmap

A web-based task scheduler for a solo quilting pattern design business (Slightly Biased Quilts).
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
- [x] Google Calendar OAuth (read-only): busy blocks excluded from scheduling
- [x] Weekly view: 7-day grid, drag-and-drop rescheduling, unschedule drop zone
- [x] All Cards list: filterable table, open-in-Trello links
- [x] Settings: Trello connection, working hours, scheduler, calendar
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

## ✅ Phase 3 — Polish & Real-world Use (complete)

- [x] Auto-refresh Trello data when the app regains focus (returning from Trello)
- [x] Auto-run scheduler after a manual Trello refresh
- [x] Keyboard shortcuts: ←/→ week navigation, S = settings, R = run scheduler
- [x] Instant load from localStorage cache; background Trello refresh

---

## ✅ Phase 4 — Visual Redesign & UX (complete)

- [x] Brand color palette: navy sidebar, teal accents, charcoal text
- [x] Sidebar brand identity: "Slightly Biased / Pattern Planner" with quilt diamond motif
- [x] Functional color badges for priority and task status
- [x] Emoji removed throughout; clean typographic UI
- [x] App renamed to Pattern Planner
- [x] Dashboard: greeting headline, two-zone layout (Today / On your radar)
- [x] Dashboard: project color strips on task rows (brand palette, one color per board)
- [x] Dashboard: smart stat cards (green when all-clear, amber/red when action needed)
- [x] Dashboard: "Completed today" column powered by Trello dueComplete + dateLastActivity
- [x] Dashboard: two-column layout on wide screens, single column on mobile
- [x] All Cards: sorted overdue-first by priority, then by due date
- [x] Focus for Today: top-3 task cards with priority-based selection algorithm
- [x] Focus for Today: completed-today column; always anchored to today
- [x] Content max-width cap (1080px) across all views

---

## 💡 Phase 5 — Nice-to-haves

- [ ] Project color strips in the weekly calendar (matches dashboard/focus colors)
- [ ] Dark mode toggle
- [ ] Project timeline view: Gantt-style, one row per Trello board
- [ ] Offline support: service worker to cache app shell
- [ ] Export scheduled week to CSV or printable view
- [ ] Print-friendly Focus for Today view
- [ ] Bulk hour-setting in All Cards (set estimated hours for many cards at once)
- [ ] "Reschedule all" button that clears auto-scheduled slots and reruns the scheduler

---

## Out of scope (by design)

- User accounts / authentication
- Multi-user / team features
- Native mobile app
- Backend server
- Writing to Google Calendar or Trello
