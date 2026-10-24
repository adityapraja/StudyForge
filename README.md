<p align="center">
  <img src="client/public/studyforge.svg" width="80" height="80" alt="StudyForge Logo" />
</p>

# StudyForge — Modern Study Habit Tracker

[![CI Test Suite](https://github.com/adityapraja/StudyForge/actions/workflows/ci.yml/badge.svg)](https://github.com/adityapraja/StudyForge/actions/workflows/ci.yml)
[![Node Version](https://img.shields.io/badge/Node.js-v20%20%7C%20v22+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-5.0-black.svg)](https://expressjs.com/)
[![Tests](https://img.shields.io/badge/Tests-124%20passed%20(100%25)-brightgreen.svg)](server/test/)

**StudyForge** is a full-stack, honesty-first study habit tracker and motivation platform designed for students, competitive exam aspirants, and lifelong learners. Built with Node.js/Express 5, PostgreSQL, and React 19 (Vite).

Unlike generic habit trackers that rely on client timers, StudyForge enforces **server clock authority**, **atomic rollups**, **anti-cheat limits**, and **real-time on-demand leaderboards** where manual unverified time cannot be used to game rankings.

---

## Architecture at a Glance

```mermaid
graph TD
    Client["React 19 SPA (Vite · Port 5173)"]
    API["Express 5 REST API (Port 3000)"]
    DB[("PostgreSQL 16 (Docker · Port 5434)")]

    Client -->|HTTP / JSON with httpOnly JWT| API
    API -->|Connection Pool & Atomic Transactions| DB

    subgraph Core Features
        API --> Timer["Timer Engine & Active Session Recovery"]
        API --> Progression["XP Curve & Automatic Streaks"]
        API --> AntiCheat["Anti-Cheat Caps (16h Daily, 4h XP)"]
        API --> Planner["Daily Planner & Idempotent Carry-Over"]
        API --> Social["Social Graph & Live Leaderboards"]
    end
```

---

## Key Features

### Phase 1 — Tracker Core
- **Focus Timer & Stopwatch:** Real-time clock with pause, short break, and resume controls. Start/stop timestamps are anchored by the server clock.
- **Active Session Recovery:** Re-hydrates open sessions on page refresh (`F5`) or tab restore without losing state.
- **Subjects CRUD:** Color-coded focus subjects with hex color validation and user isolation.
- **Timezone-Aware Midnight Splitting:** Sessions spanning midnight are split into their respective local calendar days in the user's specific IANA timezone.
- **Daily Planner:** 3 daily focus goals, task checklists with status updates, review metrics, and duplicate-proof task carry-over.
- **Annual Heatmap & CSV Export:** GitHub-style yearly contribution heatmap and streaming CSV export of all sessions.

### Phase 2 — Progression Engine
- **Progression & XP Curve:** Monotonic progression formula: Level 1 requires 200 XP; each subsequent level requires $200 + (L-1) \times 50$ XP.
- **Daily Goal Bonus:** 50 XP awarded when daily target is met in verified study time (idempotent at most once per calendar day).
- **Syllabus Topic Completion Bonus:** 20 XP awarded when a syllabus topic is marked `done` (idempotent; no duplicate awards on status toggles).
- **Exams Module:** Target hours tracking with dynamic countdown chips (`X days left`).
- **Deterministic Insights:** Rule-based analytics computing `burnout_risk`, `subject_neglect`, `best_time`, and `streak_at_risk` with concrete source numbers.
- **Weekly Goals Grid:** Visual 7-day Monday–Sunday progress tracking with target completion markers.

### Phase 3 — Social & Anti-Cheat
- **Friends Module:** Send/accept/decline requests by username, view friends' level, streak, and weekly focus hours.
- **Bidirectional Blocking:** Blocking breaks friendships and hides users mutually across all screens, searches, and leaderboards.
- **Live Leaderboards:** Dynamic SQL calculation over `daily_totals.verified_minutes` across day, week, and month periods, with category and friends-only filters.
- **Hard Anti-Cheat Caps (Gate 2):**
  - Manual entries marked `verified: false`, earn 0 XP, and are strictly excluded from leaderboards.
  - 16-hour daily study cap on `daily_totals` and 12-hour session duration limit.
  - 4-hour (240 XP) session XP cap.
  - Overlapping sessions rejected with 409 `SESSION_OVERLAP`.
- **Nightly Audit Queries (`audit.service.js`):** Queries to detect cap saturation, abnormal volume, and session-to-totals data drift.
- **Atomic Disqualification Service:** Revokes invalid sessions or user-days with instant leaderboard recalculation without cache lag.

---

## Project Structure

```text
StudyForge/
├── client/                     # Frontend React 19 Application (Vite)
│   ├── src/
│   │   ├── App.jsx             # Main SPA shell (11 navigation views)
│   │   ├── main.jsx            # React root mount
│   │   └── App.css             # Theme, responsive layout & components
│   ├── package.json
│   └── vite.config.js          # Dev server with /api proxy to backend
│
├── server/                     # Backend Express 5 REST API
│   ├── src/
│   │   ├── app.js              # Express app, security middleware & router mounts
│   │   ├── server.js           # Server bootstrap, DB connectivity & shutdown
│   │   ├── db.js               # PostgreSQL pool & withTransaction helper
│   │   ├── config.js           # Environment parsing & anti-cheat defaults
│   │   ├── middleware/         # Auth, validation, error handler, rate limiters
│   │   └── modules/
│   │       ├── auth/           # Register, login, logout, password hashing
│   │       ├── users/          # Profile, privacy JSONB, weekly goals endpoints
│   │       ├── subjects/       # Subject CRUD and validation
│   │       ├── sessions/       # Timer state machine & session-end transaction
│   │       ├── progression/    # XP curve, streaks, audit & disqualification
│   │       ├── planner/        # Daily goals, tasks, carry-over
│   │       ├── syllabus/       # Topic tree hierarchy & 20 XP bonus hook
│   │       ├── exams/          # Exam countdowns and targets
│   │       ├── stats/          # Heatmap, progress charts, deterministic insights
│   │       ├── friends/        # Friend requests, friends list, blocking
│   │       ├── leaderboards/   # Dynamic SQL ranking queries
│   │       └── export/         # Session history CSV streaming
│   ├── migrations/             # Ordered SQL migrations (001 to 004)
│   ├── schema.sql              # Base database schema
│   ├── test/                   # 19 Vitest test suites (124 tests)
│   └── package.json
│
├── docker-compose.yml          # PostgreSQL 16 Alpine container configuration
├── package.json                # Monorepo scripts (dev, test, client, docker)
├── SETUP.md                    # Detailed local machine setup guide
├── BACKEND_AND_DATAFLOW.md     # Backend architecture, dataflows & API reference
└── personb_memory.md           # Engineering log & architectural decision record
```

---

## Quickstart Guide

### 1. Prerequisites
- **Node.js**: `v20.x` or `v22.x+`
- **Docker & Docker Compose** (or local PostgreSQL 16)
- **npm**: `v10.x+`

### 2. Install Dependencies
```bash
# Backend dependencies
npm --prefix server install

# Frontend dependencies
npm --prefix client install
```

### 3. Environment Configuration
Copy the default environment files:
```bash
cp .env.example .env
cp server/.env.example server/.env
```

Ensure `DATABASE_URL` in both `.env` and `server/.env` points to port `5434`:
```env
DATABASE_URL=postgres://postgres:postgres@localhost:5434/tracker
```

### 4. Start PostgreSQL (Docker)
```bash
docker compose up -d
# or using the npm shortcut:
npm run docker:up
```

### 5. Run the Application
Open two terminal windows:

```bash
# Terminal 1: Backend API (runs on http://localhost:3000)
npm run dev

# Terminal 2: Frontend Client (runs on http://localhost:5173)
npm run client:dev
```

Open **`http://localhost:5173`** in your browser.

---

## Running Automated Tests

StudyForge includes a comprehensive test suite of **124 automated integration and unit tests across 19 test files**:

```bash
# Run server test suite
npm test
# or: npm --prefix server test
```

```text
 ✓ test/progression-disqualification.test.js (13 tests)
 ✓ test/auth.test.js (11 tests)
 ✓ test/anti-cheat.test.js (9 tests)
 ✓ test/phase2-xp-bonuses.test.js (10 tests)
 ✓ test/sessions.test.js (10 tests)
 ✓ test/phase1-integration.test.js (3 tests)
 ✓ test/friends.test.js (6 tests)
 ✓ test/leaderboards.test.js (5 tests)
 ✓ test/syllabus.test.js (9 tests)
 ✓ test/phase3-anticheat-gate2.test.js (8 tests)
 ✓ test/exams.test.js (4 tests)
 ✓ test/stats.test.js (4 tests)
 ✓ test/planner.test.js (3 tests)
 ✓ test/me.test.js (8 tests)
 ✓ test/subjects.test.js (6 tests)
 ✓ test/progression.test.js (6 tests)
 ✓ test/insights.test.js (2 tests)
 ✓ test/export.test.js (2 tests)
 ✓ test/migrations.test.js (5 tests)

Test Files  19 passed (19)
     Tests  124 passed (124)
  Duration  41.20s
```

---

## Monorepo NPM Scripts

| Script | Purpose |
| :--- | :--- |
| `npm run dev` | Starts Express backend in development mode with `--watch` (`localhost:3000`) |
| `npm run client:dev` | Starts Vite frontend dev server with hot module reload (`localhost:5173`) |
| `npm run client:build` | Compiles production client bundle into `client/dist/` |
| `npm run db:setup` | Initializes schema and migrations on target database (`DATABASE_URL`) |
| `npm test` | Runs all 19 Vitest test suites (124 tests) against isolated test cluster |
| `npm run docker:up` | Spawns the PostgreSQL 16 container in background |
| `npm run docker:down` | Stops the PostgreSQL 16 container |

---

## Further Documentation

- **[`SETUP.md`](SETUP.md)**: Detailed step-by-step local machine setup, troubleshooting common errors, and manual walkthrough.
- **[`DEPLOYMENT.md`](DEPLOYMENT.md)**: Free production deployment guide covering Vercel (Frontend), Render (Backend), and Neon (PostgreSQL).
- **[`BACKEND_AND_DATAFLOW.md`](BACKEND_AND_DATAFLOW.md)**: In-depth backend architecture, visual Mermaid sequence diagrams, and exhaustive REST API reference.
- **[`personb_memory.md`](personb_memory.md)**: Development memory log, architectural decision records, and cross-team integration history.
- **[`docs/`](docs/)**: Original PRD, Architecture specification, and API contracts.

---

## License

This project is licensed under the ISC License.

