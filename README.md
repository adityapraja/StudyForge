<p align="center">
  <img src="client/public/studyforge.svg" width="80" height="80" alt="StudyForge Logo" />
</p>

# StudyForge — Modern Study Habit Tracker

[![Live Demo](https://img.shields.io/badge/Live%20Demo-study--forge--khaki.vercel.app-000000.svg?style=flat)](https://study-forge-khaki.vercel.app/)
[![CI Test Suite](https://github.com/adityapraja/StudyForge/actions/workflows/ci.yml/badge.svg)](https://github.com/adityapraja/StudyForge/actions/workflows/ci.yml)
[![Node Version](https://img.shields.io/badge/Node.js-v20%20%7C%20v22+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-5.0-black.svg)](https://expressjs.com/)
[![Tests](https://img.shields.io/badge/Tests-124%20passed%20(100%25)-brightgreen.svg)](server/test/)

---

## What is StudyForge?

**StudyForge** is a full-stack, honesty-first study habit tracker and academic productivity platform designed for students, competitive exam aspirants, and lifelong learners.

Unlike generic productivity apps that rely on client-side timers or easily manipulated manual entries, StudyForge enforces **server clock authority**, **hard anti-cheat caps**, and **real-time on-demand leaderboards**. StudyForge distinguishes between verified real-time study sessions and unverified manual entries, ensuring that leaderboards and XP progression reflect genuine, dedicated focus.

Whether preparing for high-stakes exams, managing university coursework, or building daily reading habits, StudyForge combines structured daily planning, syllabus completion tracking, gamified streaks, and peer accountability to keep you consistent.

---

## Live Application

> [!TIP]
> 🚀 **Access the deployed application here:**  
> **[https://study-forge-khaki.vercel.app/](https://study-forge-khaki.vercel.app/)**  
> *No local installation required — create an account and start tracking immediately.*

---

## Core Features

### ⏱️ Real-Time Focus Timer & Session Recovery
- **Server Clock Authority:** Session start and stop timestamps are anchored by the server clock, preventing client-side clock tampering.
- **Active Session Recovery:** Re-hydrates in-progress sessions automatically across browser refreshes (`F5`), closed tabs, and network disconnects.
- **Controls & Short Breaks:** Pause and resume controls with break-time exclusions to accurately capture pure study seconds.
- **Timezone-Aware Midnight Splitting:** Long sessions crossing midnight are cleanly partitioned into their respective local calendar days based on the user's specific IANA timezone.

### 🛡️ Honesty-First Anti-Cheat & Fair Play
- **Verified vs. Unverified Sessions:** Real-time timer sessions are marked `verified: true`. Manual retroactive entries are flagged as `verified: false`, earn 0 XP, and are strictly excluded from competitive leaderboards.
- **Hard Duration Caps:** Enforces a 16-hour daily study cap on daily totals and a 12-hour maximum cap on individual sessions.
- **Session XP Cap:** Limits XP gains to a maximum of 4 hours (240 XP) per session to eliminate idle farming.
- **Overlap Prevention:** Concurrent and overlapping sessions are rejected with HTTP 409 `SESSION_OVERLAP`.
- **Audit & Disqualification Engine:** Background audit queries detect cap saturation, abnormal volume, and data drift, with an atomic disqualification service to revoke illicit credits without caching lag.

### 🎮 Progression & Gamification
- **Monotonic Leveling Curve:** Balanced RPG-style XP progression where Level 1 requires 200 XP, scaling smoothly by $200 + (L-1) \times 50$ XP for subsequent levels.
- **Daily Streak Engine:** Calculates active daily streaks with an automated weekly streak freeze safeguard to forgive occasional missed days.
- **Milestone Bonuses:**
  - **Daily Goal Bonus:** +50 XP on hitting the verified daily study target (idempotent; at most once per calendar day).
  - **Topic Completion Bonus:** +20 XP awarded when marking a syllabus topic as completed.

### 📋 Daily Planner & Task Management
- **Top 3 Daily Goals:** Set primary focus objectives for each day.
- **Checklists & Task Carry-Over:** Create task checklists with status updates (`todo`, `in_progress`, `done`). Incomplete tasks automatically carry over to the next day without duplicates.
- **End-of-Day Review:** Review planned vs. achieved metrics to reflect on daily productivity.

### 📚 Syllabus Tracking & Exam Countdown
- **Hierarchical Syllabus Tree:** Organize subjects into modular topics and subtopics with completion toggles and progress percentages.
- **Exam Countdown & Study Pace:** Track exam dates with real-time countdown chips (`X days left`) and dynamically computed required study hours per day.

### 📊 Analytics, Heatmap & Insights
- **Yearly Contribution Heatmap:** Visual GitHub-style 365-day study activity grid.
- **Subject Distribution:** Visual breakdown of study time across subjects.
- **Deterministic Rule-Based Insights:** Data-driven alerts highlighting `burnout_risk`, `subject_neglect`, `best_time`, and `streak_at_risk` with concrete source numbers.

### 👥 Social Graph & Competitive Leaderboards
- **Friends System:** Send, accept, or decline friend requests by username. View friends' level, active streak, and weekly study hours.
- **Bidirectional Blocking & Privacy:** Mutual blocking breaks friendships and hides users across leaderboards and searches.
- **Live Leaderboards:** Dynamically queried rankings over verified study minutes across Day, Week, and Month periods.
- **Leaderboard Filters:** Filter standings by academic category (`school`, `college`, `competitive_exams`, `professional`) or view friends-only rankings.
- **Leaderboard Opt-Out:** Option to opt out of public rankings at any time.

### 🔒 Data Privacy & Export
- **Streaming CSV Export:** Instant download of all historical study sessions in standard CSV format.
- **Account Deletion:** Clean cascading deletion of all user data and session history.

---

## Tech Stack

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend** | React | 19.x | Component-based Single Page Application (SPA) |
| **Build Tool** | Vite | 8.x | High-performance bundling and local dev server |
| **Styling** | Vanilla CSS | Modern CSS | Minimalist monochrome design system with CSS custom properties |
| **Backend** | Node.js / Express | Node 20/22 · Express 5.0 | RESTful API, server clock authority, session transactions |
| **Database** | PostgreSQL | 16.x | ACID-compliant relational storage, check constraints, schema migrations |
| **Authentication** | JWT & Cookies | httpOnly | Secure, tamper-proof session tokens with strict CORS boundaries |
| **Validation** | Zod | 4.x | Strict schema validation for request payloads |
| **Security** | Helmet & Rate Limit | Modern | HTTP headers hardening and brute-force protection |
| **Testing** | Vitest & Supertest | 5.x | Automated integration and regression test suites (124 tests) |

---

## Project Structure

StudyForge is organized as a lightweight monorepo separating client and server:

```text
StudyForge/
├── client/                     # Frontend React 19 Application (Vite)
│   ├── public/                 # Static assets (studyforge.svg, favicon)
│   ├── src/
│   │   ├── components/         # Modular views (AuthPage, Dashboard, Planner, etc.)
│   │   ├── App.jsx             # Main application shell & view routing
│   │   ├── App.css             # Component-specific styles
│   │   ├── index.css           # Global design system & theme variables
│   │   └── main.jsx            # Application entry point
│   ├── package.json
│   ├── vercel.json             # Vercel deployment & API proxy configuration
│   └── vite.config.js          # Vite config with local development proxy
│
├── server/                     # Backend Express 5 REST API
│   ├── src/
│   │   ├── app.js              # Express app initialization, middleware & routes
│   │   ├── server.js           # Server entry point, DB handshake & graceful shutdown
│   │   ├── db.js               # PostgreSQL pool & transaction helper (withTransaction)
│   │   ├── db-setup.js         # Standalone database initialization script
│   │   ├── config.js           # Environment parsing & configurable limit defaults
│   │   ├── middleware/         # Auth, validation, rate limiting & error handling
│   │   └── modules/
│   │       ├── auth/           # Registration, login, logout & bcrypt hashing
│   │       ├── users/          # Profiles, goals, privacy settings & streak maintenance
│   │       ├── subjects/       # Color-coded subject CRUD
│   │       ├── sessions/       # Timer engine, midnight splitting & anti-cheat finalization
│   │       ├── planner/        # Daily goals, checklists & task carry-over
│   │       ├── syllabus/       # Syllabus topic trees & completion bonuses
│   │       ├── exams/          # Exam countdowns & pace calculations
│   │       ├── stats/          # Annual heatmap & deterministic insights
│   │       ├── friends/        # Friend requests, friends list & bidirectional blocking
│   │       ├── leaderboards/   # Dynamic SQL ranking queries with category filters
│   │       └── export/         # Streaming CSV session history export
│   ├── migrations/             # Ordered SQL migrations (001 to 004)
│   ├── schema.sql              # Base database schema with constraints
│   ├── test/                   # 19 Vitest test suites (124 automated tests)
│   └── package.json
│
├── docker-compose.yml          # Local PostgreSQL 16 Alpine container configuration
├── package.json                # Monorepo management scripts
├── SETUP.md                    # In-depth local setup and troubleshooting guide
├── BACKEND_AND_DATAFLOW.md     # In-depth backend architecture and REST API specification
└── docs/                       # Project documentation, execution logs & deployment guides
```

---

## How to Install and Run Locally

Follow these step-by-step instructions to run StudyForge on your local machine:

### 1. Prerequisites
- **Node.js**: `v20.x` or `v22.x+` ([Download Node.js](https://nodejs.org/))
- **Docker & Docker Compose** (or a local PostgreSQL 16 installation)
- **Git** and **npm** (`v10.x+`)

### 2. Clone the Repository
```bash
git clone https://github.com/adityapraja/StudyForge.git
cd StudyForge
```

### 3. Install Dependencies
Install dependencies for both backend and frontend:
```bash
# Install backend dependencies
npm --prefix server install

# Install frontend dependencies
npm --prefix client install
```

### 4. Configure Environment Variables
Copy the provided `.env.example` templates:
```bash
cp .env.example .env
cp server/.env.example server/.env
```

Ensure `DATABASE_URL` in `server/.env` points to the local Docker PostgreSQL instance:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgres@localhost:5434/tracker
JWT_SECRET=study-forge-development-secret-key-min-32-chars
CLIENT_URL=http://localhost:5173
```

### 5. Start the PostgreSQL Database
Start the PostgreSQL 16 container using Docker Compose:
```bash
docker compose up -d
# or using the monorepo npm script:
npm run docker:up
```

Initialize the database schema and migrations:
```bash
npm run db:setup
```

### 6. Start the Development Servers
Open two terminal windows:

```bash
# Terminal 1: Backend API (runs on http://localhost:3000)
npm run dev

# Terminal 2: Frontend Client (runs on http://localhost:5173)
npm run client:dev
```

Open your browser and navigate to **`http://localhost:5173`**.

---

## Running Automated Tests

StudyForge includes an exhaustive automated test suite with **124 tests across 19 test files**:

```bash
# Run backend test suite
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
```

---

## Monorepo NPM Scripts Reference

From the root directory, you can run the following commands:

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Express backend in development mode with `--watch` (`localhost:3000`) |
| `npm run client:dev` | Starts Vite frontend dev server with Hot Module Reload (`localhost:5173`) |
| `npm run client:build` | Compiles production client bundle into `client/dist/` |
| `npm run db:setup` | Initializes schema and migrations on target database (`DATABASE_URL`) |
| `npm test` | Runs the full Vitest suite (124 tests across 19 files) |
| `npm run docker:up` | Starts the PostgreSQL 16 container via Docker Compose |
| `npm run docker:down` | Stops the PostgreSQL 16 container |
| `npm run docker:full:up` | Builds and starts entire full-stack app in Docker (`localhost:8080`) |
| `npm run docker:full:down` | Stops all full-stack containers |

---

## Further Documentation

- **[`SETUP.md`](SETUP.md)**: Detailed step-by-step local machine setup and troubleshooting guide.
- **[`docs/DOCKER_GUIDE.md`](docs/DOCKER_GUIDE.md)**: Complete guide to containerizing and running the full stack with Docker.
- **[`BACKEND_AND_DATAFLOW.md`](BACKEND_AND_DATAFLOW.md)**: Comprehensive backend architecture, sequence diagrams, and REST API contract.
- **[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)**: Production cloud deployment guide.
- **[`docs/personb_memory.md`](docs/personb_memory.md)**: Complete development memory and architectural decision record.
- **[`docs/`](docs/)**: Original PRD, Architecture specification, and database schema documentation.

---

## License

This project is licensed under the **ISC License**.
