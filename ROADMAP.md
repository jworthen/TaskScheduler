# Stitch & Schedule — Roadmap

A web-based task scheduler for a solo quilting pattern design business.
Single-user, browser-only, powered by Google Firestore. No backend server.

---

## ✅ Phase 1 — Core App (complete)

- [x] Data model: Projects, Tasks, Settings in Firestore
- [x] Firestore CRUD layer with real-time listeners
- [x] Recurring tasks: auto-spawn next occurrence on completion
- [x] Blocker enforcement: hard-block tasks with incomplete dependencies
- [x] Scheduling engine: work-backward from due date, latest-possible-slot placement
      respecting configured working hours and Google Calendar busy blocks
- [x] Priority ordering: High → Medium → Low as tiebreaker
- [x] Dashboard: stats (due this week, hours today, blocked count, overdue)
- [x] Weekly view: 7-day calendar grid, drag-and-drop rescheduling
- [x] Daily Focus view: timeline with progress bar, mark-complete toggle
- [x] Project Kanban: per-project stage columns, drag tasks between stages
- [x] All Tasks list: filterable/sortable table with inline actions
- [x] Settings: working hours per day, category management, scheduler trigger
- [x] Google Calendar OAuth (read-only) plumbing
- [x] Soft lavender/peach design system, Nunito font

---

## 🔨 Phase 2 — Mobile & Deployment (in progress)

- [ ] Responsive layout: sidebar collapses to bottom navigation bar on mobile
- [ ] Touch-friendly tap targets (min 44 × 44 px throughout)
- [ ] Kanban board: horizontal scroll on small screens
- [ ] Weekly grid: horizontally scrollable, single-day highlight on mobile
- [ ] Modals: full-screen on small screens
- [ ] Firebase Hosting config (`firebase.json`, `.firebaserc`)
- [ ] Deployment instructions (one `firebase deploy` command)
- [ ] Real HTTPS URL → add to phone home screen as PWA shortcut

---

## 📋 Phase 3 — Polish & Real-world Use

- [ ] Test with real quilting projects; fix rough edges
- [ ] Auto-run scheduler when a task is created or its due date changes
- [ ] First-time onboarding: prompt to create first project if none exist
- [ ] Better empty states with helpful call-to-action prompts
- [ ] Keyboard shortcuts (N = new task, P = new project, S = settings, ←/→ week nav)
- [ ] Confirm-before-delete with undo toast (5-second window)
- [ ] Task search / quick-open (Cmd+K style)

---

## 💡 Phase 4 — Nice-to-haves

- [ ] Offline support: explicit service worker so the app loads without internet
      (Firestore already caches reads; this covers the shell/JS assets)
- [ ] Export tasks to CSV
- [ ] Print-friendly Daily Focus view (clean single-column layout)
- [ ] Color-coded project indicators in calendar views
- [ ] Bulk actions in All Tasks (complete many, move to stage, reassign category)
- [ ] Stage completion percentage ring on Project tab buttons

---

## Out of scope (by design)

- User accounts / authentication
- Multi-user / team features
- Native mobile app
- Backend server
- Writing to Google Calendar
