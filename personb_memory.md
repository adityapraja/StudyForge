# Person B Memory & Development Log

**Role:** Person B — Backend Core, Authentication & Security  
**Phase:** Step 0 (Setup) & Phase 1 (Tracker Core)  
**Branch:** `aditya-backend`  
**Date:** Oct 19, 2026  

---

## 1. Executive Summary & Overview of Responsibilities

As Person B, our ownership scope as established in `docs/Study_Habit_Tracker_Project_Execution (1).md` and `docs/Study_Habit_Tracker_Architecture_Simple.md` encompasses:
1. **Repository & Express Setup (Step 0):** Setting up the Express 5 server structure, configuration, security middleware, error handling, `.env.example`, and CI pipelines.
2. **Authentication & Security:** Register, login, logout, bcrypt hashing, JWT issuance in httpOnly cookies, auth middleware, and rate limiting.
3. **User & Progression Modules:** User profiles, time zone management, goal configuration (`/me/goals`), XP calculation, and streak tracking with weekly freeze automation.
4. **Subjects Module:** Full CRUD for user study subjects with hex color validation and per-user name uniqueness.
5. **Sessions Module & Timer Logic:** Start, pause, break, resume, active session recovery on refresh, manual session entry, search/filtering, and deletion.
6. **Session-End Transaction & Anti-Cheat:**
   - Single atomic PostgreSQL transaction for session ending.
   - Enforcing anti-cheat caps: 16-hour daily study cap, 12-hour max session cap, 4-hour XP session cap.
   - Unverified flag for manual sessions (excluded from XP and leaderboards).
   - Time zone-aware midnight boundary splitting across local calendar days for `daily_totals`.
   - Prevention of overlapping sessions.

---

## 2. Code Changes & Detailed Rationale

### A. Root & Setup Files

#### 1. `.gitignore`
- **Change:** Fixed `node-modules` typo to `node_modules/`, and added `.env`, `.env.*`, `!.env.example`, `dist/`, and `coverage/`.
- **Why:** Avoid tracking dependencies and secrets while ensuring example configuration files remain tracked for teammates.

#### 2. Root `package.json`
- **Change:** Added root `package.json` delegating scripts (`start`, `dev`, `test`) to `server/` via `npm --prefix server`.
- **Why:** Provides seamless monorepo orchestration for teammates running commands from the root directory.

#### 3. `.env.example` (Root & `server/.env.example`)
- **Change:** Documented all environment variables with defaults: `PORT`, `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `COOKIE_NAME`, `CLIENT_URL`, `DAILY_CAP_HOURS`, `MAX_SESSION_HOURS`, `SESSION_XP_CAP_HOURS`, `DEFAULT_STREAK_MINIMUM_MINUTES`.
- **Why:** Adheres to the working agreement (never commit secrets, maintain `.env.example`) and ensures numeric limits are configurable rather than hardcoded.

#### 4. `.github/workflows/ci.yml`
- **Change:** Created a GitHub Actions CI pipeline testing Node.js 22 against PostgreSQL 16 on push and PR.
- **Why:** Fulfills Person B's Step 0 commitment to enforce automated verification on every commit.

---

### B. Database Schema & Connection (`server/schema.sql`, `server/src/db.js`)

#### 1. `server/schema.sql`
- **Change:** Defined clean PostgreSQL schema with keys, indexes, foreign key cascades, and check constraints for:
  - `users` (unique on lowercase email and username, JSONB privacy, category check, level, xp, study target seconds)
  - `subjects` (unique on `(user_id, name)`, hex color regex check)
  - `sessions` (status enum check, index on `(user_id, started_at DESC)`, unique partial index `idx_sessions_user_open` ensuring only 1 open session per user)
  - `daily_totals` (unique on `(user_id, day)`, index on `(day, user_id)`)
  - `streaks` (streak counters, weekly freeze tracking, last counted date)
  - `xp_events` (unique on `(session_id, kind)` preventing double awards)
  - Future data modules: `daily_goals`, `tasks`, `syllabus_topics`, `exams`, `friendships`, `blocks`.
- **Why:** Built using PostgreSQL native `gen_random_uuid()` (standard in PG 13+) and robust constraints so data integrity is enforced at the database level. Person C can immediately build on this schema.

#### 2. `server/src/db.js`
- **Change:** Implemented connection pool with lazy instantiation via `Proxy`, query helper, `withTransaction(callback)` for atomic transactions, and `initDb()` for schema initialization.
- **Why:** Ensures consistent transaction management (`BEGIN` / `COMMIT` / `ROLLBACK`) across all modules and allows tests to dynamically connect to test databases.

---

### C. Configuration & Middlewares (`server/src/config.js`, `server/src/middleware/`)

#### 1. `server/src/config.js`
- **Change:** Created centralized config parsing `process.env` with sensible defaults. Added a dynamic getter for `databaseUrl`.
- **Why:** Guarantees single source of truth for configuration and allows dynamic test database switching.

#### 2. `server/src/middleware/error-handler.js`
- **Change:** Built `AppError` class and central error middleware returning the exact contract shape `{ error: { code, message, fields } }` with support for optional metadata like `open_session`. Also translates Zod errors to `VALIDATION_ERROR` with field mappings.
- **Why:** Required by `API.md` section 1. All errors across the API have a predictable, standard format.

#### 3. `server/src/middleware/validate.js`
- **Change:** Built validation middleware supporting `body`, `query`, and `params`. In Express 5, `req.query` is a getter, so `Object.defineProperty` was used to safely update `req.query` and `req.params`.
- **Why:** Centralizes request validation using Zod in plain JavaScript without boilerplate in routes.

#### 4. `server/src/middleware/rate-limit.js`
- **Change:** Built `authRateLimiter` using `express-rate-limit` allowing 6 attempts per minute per IP, returning HTTP 429 with `{ error: { code: "RATE_LIMITED", message: "..." } }`. Relaxed in test mode.
- **Why:** Fulfills security requirements against brute-force attacks on auth endpoints.

#### 5. `server/src/middleware/auth.js`
- **Change:** Middleware extracting JWT from httpOnly cookie `token` (with Bearer fallback), verifying signature, and querying the database for user details, attaching `req.user`.
- **Why:** Ensures all private endpoints are protected and have access to authenticated user context.

---

### D. Progression Module (`server/src/modules/progression/`)

#### 1. `xp.service.js`
- **Change:** Implemented XP and level calculation:
  - Base level 1 requires 200 XP; each subsequent level requires 50 more XP ($200 + (L-1) \times 50$).
  - At 1240 XP: Level 5, 140 in level, 400 for next level (matches `API.md` contract line 183).
  - Session XP: 1 XP per minute, capped at 4 hours (240 XP). Manual/unverified sessions earn 0 XP.
- **Why:** Adheres strictly to PRD section 4.6 and `API.md`.

#### 2. `streak.service.js`
- **Change:**
  - `getStreakInfo`: reads user streak, today's minutes from `daily_totals`, checks minimum threshold, and computes freeze availability.
  - `updateStreakOnSessionEnd`: checks if day's study minutes $\ge$ `streak_minimum_minutes`. If so, increments streak for consecutive day, applies automatic weekly freeze if 1 day was missed, or resets streak if $>1$ day missed or freeze was already consumed this ISO week.
  - Formats date strings via `TO_CHAR(..., 'YYYY-MM-DD')` to prevent timezone skews.
- **Why:** Satisfies PRD 4.5 and Architecture section 8 rules for streaks and weekly freeze automation.

---

### E. Auth Module (`server/src/modules/auth/`)

- **Change:**
  - `POST /api/auth/register`: validates body, checks uniqueness for email and username (case-insensitive), hashes password with `bcryptjs`, creates user + streak row in one transaction, signs JWT, sets httpOnly cookie `token`, returns 201 with User object.
  - `POST /api/auth/login`: rate-limited, verifies credentials with `bcrypt.compare`, sets httpOnly cookie, returns 200 with User object.
  - `POST /api/auth/logout`: clears `token` cookie, returns `{ ok: true }`.
- **Why:** Implements Phase 1 authentication handoff so Person A and Person C can sign in and authenticate during development.

---

### F. Users / Me Module (`server/src/modules/users/`)

- **Change:**
  - `GET /api/me`: returns user profile matching User object schema.
  - `PATCH /api/me`: updates `username` (uniqueness checked), `time_zone`, `category`, `leaderboard_hidden`, and `privacy` (deep JSONB merge).
  - `GET /api/me/xp`: returns current level and XP breakdown.
  - `GET /api/me/streak`: returns streak status and freeze availability.
  - `GET /api/me/goals`: returns daily/weekly target seconds, streak minimum, plus computed `today_seconds` and `week_seconds` from `daily_totals`.
  - `PUT /api/me/goals`: updates target seconds and streak minimum.
- **Why:** Delivers all current-user endpoints assigned to Person B in `API.md` section 4.

---

### G. Subjects Module (`server/src/modules/subjects/`)

- **Change:**
  - `GET /api/subjects`: lists user's subjects ordered by creation time.
  - `POST /api/subjects`: validates 1–40 char name, hex color format (`#RRGGBB`), enforces per-user name uniqueness (409 `SUBJECT_NAME_TAKEN`), returns 201.
  - `PATCH /api/subjects/:id`: updates name and/or color with conflict checking.
  - `DELETE /api/subjects/:id`: deletes subject cascading all associated records, returns `{ ok: true }`.
- **Why:** Fulfills Person B's server ownership for Subjects under Section 14 of `API.md`.

---

### H. Sessions & Timer Module (`server/src/modules/sessions/`)

#### 1. Core Timer Endpoints
- `POST /api/sessions/start`: validates subject ownership, ensures no open session exists (409 `SESSION_ALREADY_OPEN` with `open_session` details), stamps start time with server clock.
- `GET /api/sessions/active`: returns active session or `{ session: null }` for page refresh recovery.
- `POST /api/sessions/:id/pause`: checks running state, transitions to `paused`, records `segment_started_at`.
- `POST /api/sessions/:id/break`: checks running state, transitions to `on_break`, records `segment_started_at`.
- `POST /api/sessions/:id/resume`: accumulates elapsed segment time to `paused_seconds` or `break_seconds`, transitions back to `running`.
- Disallowed state moves return 409 `INVALID_STATE`.

#### 2. Session-End Transaction (`session-end.transaction.js`)
- Executed atomically in `POST /api/sessions/:id/stop`:
  - Locks session row `FOR UPDATE`.
  - Finalizes active pause or break if stopped while paused/on break.
  - Enforces 12-hour max session cap.
  - Calculates `study_seconds = total_elapsed - paused_seconds - break_seconds`.
  - **Midnight Splitting in User Timezone:** Calculates boundary intervals against user's local timezone. Divides study time across calendar days proportionally.
  - **Daily Cap Enforcement:** Enforces 16-hour daily study cap on `daily_totals`. Excess study time is not added to daily totals.
  - **XP Awarding:** Awards 1 XP per focused minute (capped at 240 XP). Records event in `xp_events` with unique constraint `(session_id, kind)` to prevent double awards. Updates user `xp` and `level`.
  - **Streak Update:** Calls streak service to extend streak or apply weekly freeze.
  - Returns session and summary with `study_seconds`, `counted_seconds`, `verified`, `xp_awarded`, `streak`, and `today_seconds`.

#### 3. Manual Entry & Anti-Cheat
- `POST /api/sessions/manual`:
  - Validates `ended_at > started_at` and `started_at, ended_at <= NOW()`.
  - Rejects overlapping sessions with 409 `SESSION_OVERLAP`.
  - Sets `source = 'manual'` and `verified = false`.
  - Updates `daily_totals.minutes` but NOT `verified_minutes`.
  - Awards 0 XP.

#### 4. Listing, Search & Deletion
- `GET /api/sessions`: cursor pagination (`limit` default 50, max 200), filters by `from`, `to`, `q` (note ILIKE search), `subject_id`, ordered newest first.
- `DELETE /api/sessions/:id`: deletes own session.

---

### I. Express Application Setup (`server/src/app.js`, `server/src/server.js`)

- `app.js`: Configured Helmet, CORS with credentials, cookie-parser, JSON body parser, route mountings under `/api`, `/healthz` endpoint, catch-all 404 handler, and central error handler.
- `server.js`: Connects to PostgreSQL, checks connection, runs schema verification, starts HTTP server on port 3000, and registers graceful shutdown handlers (`SIGTERM`, `SIGINT`).

---

## 3. Testing & Verification

A test suite with 45 tests across 6 test files was implemented using Vitest + Supertest with an isolated PostgreSQL database test cluster:

| Test File | Test Cases | Status |
| :--- | :--- | :--- |
| `test/auth.test.js` | Registration, bcrypt hashing, duplicate checks, login, wrong passwords, logout, auth middleware | **10 / 10 Passed** |
| `test/me.test.js` | Profile read/update, privacy merging, username uniqueness, XP formula breakdown, streak status, goal updates | **7 / 7 Passed** |
| `test/subjects.test.js` | CRUD operations, hex color validation, user isolation, name conflict rejection | **6 / 6 Passed** |
| `test/sessions.test.js` | Timer start, recovery, pause/break/resume transitions, stop accounting, pause finalization, list/search/delete | **10 / 10 Passed** |
| `test/anti-cheat.test.js` | Manual session verification flag, 0 XP, overlap rejection, 4-hour XP cap, 16-hour daily cap, midnight timezone split | **6 / 6 Passed** |
| `test/progression.test.js` | XP breakdown, 15-minute streak threshold, consecutive streak extension, weekly freeze automation, freeze exhaustion reset | **6 / 6 Passed** |
| **Total** | **45 comprehensive integration & unit test cases** | **45 / 45 Passed (100%)** |

All tests run cleanly via `npm test` from both `server/` and repository root.

---

## 4. CI Fix & Cross-Platform Test Database Resolution

### Issue Encountered in GitHub Actions CI
- **Error:**
  ```text
  Error: Command failed: /usr/pgsql-18/bin/initdb -D /tmp/test_pgdata -U postgres -A trust
  status: 127
  ```
- **Root Cause:**
  `server/test/global-setup.js` was hardcoding a fallback connection URL and attempting to spawn a local PostgreSQL cluster using `/usr/pgsql-18/bin/initdb`. While `/usr/pgsql-18` existed in the local development environment, GitHub Actions Ubuntu runners run an external PostgreSQL service container (`postgres:16` on `localhost:5432`) and pass `DATABASE_URL` via the workflow environment. Because `global-setup.js` overwrote `process.env.DATABASE_URL`, it ignored the active CI PostgreSQL service and failed when trying to invoke the non-existent `/usr/pgsql-18/bin/initdb` binary.

### Resolution & Code Changes
1. **Support External `DATABASE_URL` First (`server/test/global-setup.js`):**
   - The setup hook now checks if `process.env.DATABASE_URL` is already supplied.
   - If present, it waits for the service to be healthy, applies `server/schema.sql`, and immediately returns without attempting to spawn any local processes.
2. **Dynamic Binary Discovery for Local Development:**
   - Added a `findPgBinary(name)` helper that checks `PATH` (`which initdb`) and standard package locations across distros (Fedora `/usr/pgsql-*` and Ubuntu/Debian `/usr/lib/postgresql/*`), ensuring portability across any environment.
3. **Verification:**
   - Both CI environment (where `DATABASE_URL` is supplied) and local development (where fallback embedded cluster is used) run seamlessly and pass all 45 test cases.

---

## 5. Phase 1 Cross-Team Integration & Gate 1 Verification

**Date:** Oct 22, 2026  
**Context:** Pulled and integrated all Phase 1 commits across all three team members:
- **Person A (Frontend):** Commit `902d947 frontend phase 1`
- **Person B (Backend Core & Auth):** Commits `99a0ce8 Backend B - Phase 1 Auth,middleware` & `aebab7f GIT CI issue fixed`
- **Person C (Database & Data Modules):** Commit `6669a1d DB phase 1 implemented`

---

### A. Team Ownership Alignment & Integration Analysis

| Member | Owned Scope in Phase 1 | Status & Integration Verification |
| :--- | :--- | :--- |
| **Person A** | React 19 single-page UI, tabs (Dashboard, Timer, Planner, Subjects, Statistics, Settings), API request helper, auth token cookie handling, active timer recovery display. | **Verified & Integrated.** Client UI maps to all `/api/*` endpoints; state normalizers safely ingest backend response shapes. |
| **Person B** | Express 5 setup, config, error handling, auth (register, login, logout, JWT cookies), subjects CRUD, timer lifecycle (start, pause, break, resume, stop, active recovery, manual entry), atomic session-end transaction, anti-cheat limits, streak management, XP curve. | **Verified & Integrated.** Core engine coordinates session completion with anti-cheat caps and updates both overall `daily_totals` and per-subject totals. |
| **Person C** | Schema expansion (`subject_daily_totals`, `planner_days`, `planner_goals`, `tasks`), migrations runner (`server/migrations/001_planner_phase1.sql`), Planner endpoints (`GET/PUT /planner/:date`, `POST /planner/:date/carry-over`), Stats endpoints (`heatmap`, `progress`, `subjects`), CSV export (`GET /me/export.csv`). | **Verified & Integrated.** Seamlessly plugged into `app.js` and `users.routes.js`. `session-end.transaction.js` updates `subject_daily_totals` on session stop and manual entry. |

---

### B. Integration Fixes & Enhancements Made

#### 1. Vite Development Proxy (`client/vite.config.js`)
- **Change:** Configured Vite dev server proxy for `/api` targeting `http://localhost:3000` with `changeOrigin: true`.
- **Why:** During development, the frontend runs on port 5173 while Express runs on port 3000. Without a proxy in Vite, API fetch calls from the React client to `/api/...` resulted in 404s from Vite dev server. The proxy enables seamless local communication with cookie pass-through without CORS issues.

#### 2. Client Action Handlers (`client/src/App.jsx`)
- **Change:**
  - Added `handleCarryOver`: Calls `POST /api/planner/${planner.date}/carry-over` and alerts the number of carried tasks.
  - Added `handleProfileSave`: Calls `PATCH /api/me` with updated username, time_zone, category, privacy, and streak_minimum_minutes.
  - Added `handleSubjectDelete`: Calls `DELETE /api/subjects/${id}` and updates local state.
  - Connected the handlers to their respective buttons ("Carry over", "Save profile", "Delete").
- **Why:** Person A had wired the UI forms but left placeholder alerts for these actions. Connecting them ensures complete end-to-end user workflows for Phase 1.

#### 3. Root Developer Experience (`package.json`)
- **Change:** Added `"client:dev": "npm --prefix client run dev"` and `"client:build": "npm --prefix client run build"`.
- **Why:** Allows developers to run frontend commands directly from the monorepo root.

---

### C. Gate 1 Exit Check & Integration Test Suite (`server/test/phase1-integration.test.js`)

Created dedicated end-to-end integration test suite verifying **Gate 1: study time is accurate**:
1. **Accurate Study Time & Pause/Break Exclusion:**
   - Simulated a 65-minute elapsed session with a 10-minute pause and a 5-minute break.
   - Verified study time calculated is exactly 50 minutes (3000s) with 0 non-study leakage.
   - Verified session summary and database records match to the minute.
2. **Timer Recovery on Refresh:**
   - Verified `GET /api/sessions/active` returns the running session with timestamps and accumulated paused/break times on page reload.
   - Verified that after session stop, `GET /api/sessions/active` cleanly returns `{ session: null }`.
3. **Midnight Boundary Splitting in User Timezone:**
   - Simulated session spanning midnight in `Asia/Kolkata` (UTC+5:30).
   - Verified segments split across local calendar days accurately in both `daily_totals` and `subject_daily_totals`.
4. **Cross-Module Flows (Planner + Stats + CSV Export):**
   - Verified Planner review calculations (`review.goals_met`, `review.goals_total`, `review.tasks_done`, `review.total_seconds`) match subject-specific daily totals and overall daily totals.
   - Verified Task carry-over copies unfinished tasks marked `carried_over: true` and is idempotent against duplicates.
   - Verified Heatmap, Weekly Progress, and Subject Breakdown stats accurately calculate totals and percentages.
   - Verified CSV export formats valid CSV headers (`"date","subject","start","end","duration_minutes","note"`) with accurate user isolation.

---

### D. Automated Test Verification Summary

| Test File | Module Under Test | Status |
| :--- | :--- | :--- |
| `test/auth.test.js` | Register, login, password hashing, cookies, rate limit | **10 / 10 Passed** |
| `test/sessions.test.js` | Timer start, recovery, state machine, search, delete | **10 / 10 Passed** |
| `test/anti-cheat.test.js` | 16h daily cap, 4h XP cap, manual session anti-cheat, overlap | **6 / 6 Passed** |
| `test/progression.test.js` | XP curve, streaks, weekly freezes | **6 / 6 Passed** |
| `test/subjects.test.js` | Subject CRUD, hex colors, user isolation | **6 / 6 Passed** |
| `test/me.test.js` | Profile retrieval, patch, goals, streak queries | **7 / 7 Passed** |
| `test/planner.test.js` | Plan replacement, goal limits, subject validation, carry-over | **3 / 3 Passed** |
| `test/stats.test.js` | Heatmap, weekly/monthly progress, subject breakdown | **4 / 4 Passed** |
| `test/export.test.js` | CSV session export and user isolation | **2 / 2 Passed** |
| `test/migrations.test.js` | Schema migrations runner idempotency | **1 / 1 Passed** |
| `test/phase1-integration.test.js` | Gate 1 accuracy, timer recovery, planner/stats cross-integration | **3 / 3 Passed** |
| **Total** | **Full Phase 1 Integration Test Suite** | **58 / 58 Passed (100%)** |

---

## 6. Phase 2 Execution — XP Awards, Bonus Rules & Weekly Goals

**Role:** Person B — Backend Core, Authentication & Progression  
**Phase:** Phase 2 (Progress)  
**Date:** Oct 22, 2026  

---

### A. Phase 2 Objectives & Scope (Person B)

As established in `docs/Study_Habit_Tracker_Project_Execution (1).md` and `docs/Study_Habit_Tracker_PRD_Simple.md`:
1. **XP Awards & Levels Curve:**
   - Level curve implementation: Level 1 requires 200 XP; each subsequent level requires $200 + (L-1) \times 50$ XP.
   - Levels increase monotonically with verified study and bonus achievements.
2. **Bonus XP Rules & Anti-Double-Award Constraints:**
   - **50 XP Daily Goal Bonus**: Awarded when a user reaches or exceeds their daily target in verified study time. Awarded at most once per user per local calendar day.
   - **20 XP Syllabus Topic Completion Bonus**: Exported hook `awardTopicCompletionXp(client, userId, topicId)` for Person C's syllabus module. Awarded at most once per user per topic (no double awards on retries or toggling done/undone).
   - **Session XP Cap**: 1 XP per minute, capped at 4 hours (240 XP) per session. Manual sessions earn 0 XP and no bonus.
3. **Weekly Goals & XP History Endpoints:**
   - Enriched `GET /me/goals` and dedicated `GET /me/goals/weekly`: 7-day Monday–Sunday array with daily targets, daily seconds, `goal_met`, `days_goal_met`, `week_seconds`, `week_progress_percent`, and `weekly_goal_met`.
   - `PUT /me/goals`: Supports both partial and full updates for `daily_target_seconds`, `weekly_target_seconds`, and `streak_minimum_minutes`.
   - `GET /me/xp/events`: Cursor-paginated history of user XP events (`session`, `daily_goal`, `topic_done`).

---

### B. Database Schema & Migration Changes

#### 1. `server/migrations/002_phase2_xp_bonuses.sql` & `server/schema.sql`
- **Change:**
  - Added `reference_id VARCHAR(255)` column to `xp_events` table for referencing syllabus topic IDs (and future external references).
  - Added unique partial indexes to guarantee database-level idempotency against double awards:
    - `idx_xp_events_session_kind`: `ON xp_events(session_id, kind) WHERE session_id IS NOT NULL`
    - `idx_xp_events_daily_goal`: `ON xp_events(user_id, day) WHERE kind = 'daily_goal'`
    - `idx_xp_events_topic_done`: `ON xp_events(user_id, reference_id) WHERE kind = 'topic_done'`
- **Why:** Strict PRD requirement ("XP awarded once per session and per bonus; no double awards on retry"). Unique partial indexes guarantee that retrying a session stop or toggling a topic repeatedly can never double-award XP at the database layer.

---

### C. Backend Service & Route Implementations

#### 1. Progression Service (`server/src/modules/progression/xp.service.js`)
- **Constants:** `BONUS_XP_DAILY_GOAL = 50`, `BONUS_XP_TOPIC_DONE = 20`.
- **`awardDailyGoalXp(client, userId, day)`:**
  - Attempts insert into `xp_events` with `kind = 'daily_goal'`.
  - On conflict, returns `{ awarded: false, xp: 0, reason: 'ALREADY_AWARDED' }`.
  - When awarded, atomically updates user `xp`, checks for level-up, and returns `{ awarded: true, xp: 50, new_xp, new_level, level_up }`.
- **`awardTopicCompletionXp(client, userId, topicId, day)`:**
  - Exported hook for Person C's syllabus module.
  - Attempts insert into `xp_events` with `kind = 'topic_done'`, `reference_id = topicId`.
  - On conflict, returns `{ awarded: false, xp: 0, reason: 'ALREADY_AWARDED' }`.
  - When awarded, increments user XP by 20, updates level, and returns `{ awarded: true, xp: 20, new_xp, new_level, level_up }`.
- **`awardSessionXp(client, userId, sessionId, studySeconds, isVerified, day)`:**
  - Encapsulates 1 XP/min (up to 240 XP) session award with `ON CONFLICT (session_id, kind) DO NOTHING`.
- **`getUserXpEvents(userId, options)`:**
  - Retrieves paginated XP event records with limit and cursor encoding `(created_at, id)`.

#### 2. Atomic Session Stop Integration (`server/src/modules/sessions/session-end.transaction.js`)
- **Change:**
  - Integrated `awardSessionXp` and `awardDailyGoalXp` into the atomic session-end transaction.
  - If the session is verified and today's total verified minutes meet or exceed `daily_target_seconds / 60`, automatically awards the 50 XP daily goal bonus (once per day).
  - Summary includes `xp_awarded` (total), `session_xp`, `bonus_xp`, and `daily_goal_met`.

#### 3. Users Module & Weekly Goals (`server/src/modules/users/`)
- **`users.schemas.js`:**
  - Made `daily_target_seconds`, `weekly_target_seconds`, and `streak_minimum_minutes` optional with a refinement requiring at least one field.
  - Added `xpEventsQuerySchema` for limit and cursor validation.
- **`users.service.js`:**
  - Enriched `getUserGoalsWithProgress(user)` to generate a 7-day Monday–Sunday breakdown with daily targets and goal met status, `days_goal_met`, `week_seconds`, `week_progress_percent`, and `weekly_goal_met`.
  - Added `getWeeklyGoalsBreakdown(user)` helper.
  - Updated `updateUserGoals(userId, data)` to support partial updates dynamically.
- **`users.routes.js`:**
  - Added `GET /api/me/goals/weekly` endpoint.
  - Added `GET /api/me/xp/events` endpoint with cursor pagination.

---

### D. Automated Test Verification (`server/test/phase2-xp-bonuses.test.js`)

Created dedicated Phase 2 test suite covering all bonus rules, anti-double-award constraints, and weekly goals:
1. **XP Curve & Levels:** Verified Level 1 (0-199 XP), Level 2 (200-449 XP), and Level 5 at 1240 XP ($200 + 250 + 300 + 350 + 140$).
2. **Daily Goal Bonus (50 XP):**
   - Verified 35-minute session on a 30-minute target awards $35 + 50 = 85$ XP with `bonus_xp: 50, daily_goal_met: true`.
   - Verified second session on same day awards session XP but 0 bonus XP (no double award).
   - Verified manual session does not award bonus XP.
3. **Syllabus Topic Hook (20 XP):**
   - Verified first completion awards 20 XP and triggers level-up across boundary.
   - Verified toggling or retrying the same topic returns `ALREADY_AWARDED` with 0 XP added.
4. **Weekly Goals Endpoints:**
   - Verified `GET /api/me/goals` and `GET /api/me/goals/weekly` return 7-day Monday–Sunday array and progress metrics.
   - Verified `PUT /api/me/goals` supports partial update (updating only `daily_target_seconds`).
   - Verified `GET /api/me/xp/events` cursor-based pagination.

---

### E. Full Test Suite Summary

All **12 test suites** and **67 tests** passed cleanly for Person B's Phase 2 deliverables:

```text
Test Files  12 passed (12)
     Tests  67 passed (67)
  Duration  9.06s
```

---

## 7. Phase 1 & Phase 2 Cross-Team Integration & Final Verification

**Date:** Oct 22, 2026  
**Context:** Full review and cross-integration verification after pulling and merging Phase 1 and Phase 2 branches from all team members:
- **Person A (Frontend):** PR #2 (`adityapraja/jagraveeFrontend`)
- **Person B (Backend Core & Auth):** PR #1 (`adityapraja/aditya-backend`)
- **Person C (Database & Data Modules):** PR #3 (`adityapraja/SanskrutiDB`)

---

### A. Comprehensive Verification by Role & Feature

#### 1. Person A — Frontend Single-Page App (`client/src/App.jsx`)
- **Navigation & Tabs:** Fully implemented views for Dashboard, Timer, Planner, Subjects, Statistics, Syllabus, Exams, Insights, Weekly Goals, and Settings.
- **Timer & Focus Tracker:** Stopwatch and countdown modes with real-time ticker, pause, break, resume, and stop actions. Recovers active session on refresh via `GET /api/sessions/active`.
- **Planner:** Day selector, 3 daily goals, task addition, task completion toggling, carry-over trigger, and daily review summary.
- **Syllabus:** Tree hierarchy of topics, status toggles (`not_started`, `in_progress`, `done`), plain-text bullet/indent import, and celebratory UI handling for `xp_awarded`.
- **Exams:** Exam list with countdown chips, subject association, add/edit/delete modals.
- **Insights & Stats:** Rule-based insight badges (burnout warning, subject neglect, best day, streak risk), GitHub-style annual heatmap, weekly/monthly progress bar charts, subject time distribution.
- **Weekly Goals:** Visual Monday–Sunday grid showing target progress, days met, and total week target completion.
- **Settings & Profile:** Form for username, IANA timezone, category, daily/weekly hour targets, streak minimum, privacy toggles, leaderboard hide toggle, CSV download, and account deletion.

#### 2. Person B — Backend Core, Auth & Progression
- **Auth & Security:** Argon2/Bcrypt password hashing, JWT in `httpOnly` secure cookies, rate limiting (6 req/min on auth), `authenticate` middleware, and standardized error responses (`{ error: { code, message, fields } }`).
- **Sessions & Timer State Machine:** Transitions between `running`, `paused`, `on_break`, and `stopped`. Active session recovery on reload. Disallows concurrent sessions (409 `SESSION_ALREADY_OPEN` with existing session metadata).
- **Anti-Cheat & Session End:** Single atomic transaction enforcing 16-hour daily cap, 12-hour max session cap, 4-hour (240 XP) session cap, and timezone-aware midnight boundary splitting across local calendar days for `daily_totals`. Manual sessions marked `verified: false` and earn 0 XP.
- **XP Progression & Levels:** Level curve $200 + (L-1) \times 50$ XP. XP breakdown endpoint (`/me/xp`) and paginated event history (`/me/xp/events`).
- **Bonus XP Rules:** 50 XP daily goal bonus (max once per day, verified sessions only) and 20 XP syllabus topic bonus hook.
- **Streaks & Freezes:** Automatic streak increment for study $\ge$ `streak_minimum_minutes`, automatic weekly freeze consumption for 1 missed day, and streak reset if $>1$ day missed or freeze exhausted.
- **Subjects CRUD:** Name length validation, hex color format (`#RRGGBB`), user isolation, and unique `(user_id, name)`.

#### 3. Person C — Database & Data Modules
- **PostgreSQL Schema & Migrations:** Migrations `001_planner_phase1.sql` and `002_phase2_xp_bonuses.sql` executed idempotently. Strict constraints and partial indexes for idempotency (`idx_xp_events_session_kind`, `idx_xp_events_daily_goal`, `idx_xp_events_topic_done`, `idx_tasks_carry_over_once`).
- **Planner Module:** `GET/PUT /planner/:date` with maximum 3 daily goals validation, `POST /planner/:date/carry-over` idempotent carry-over of unfinished tasks.
- **Statistics Module:** `GET /stats/heatmap`, `GET /stats/progress`, `GET /stats/subjects`.
- **Rule-Based Insights Module:** `GET /stats/insights` generating actionable insights: `burnout_risk`, `subject_neglect`, `best_day`, and `streak_at_risk`.
- **Syllabus Module:** `GET /subjects/:id/syllabus`, `POST /topics`, `PATCH/DELETE /topics/:id`, and `POST /subjects/:id/syllabus/import` with hierarchical indentation parsing.
- **Exams Module:** `GET/POST /exams`, `PATCH/DELETE /exams/:id` with dynamic `days_left` calculation.
- **CSV Export:** `GET /me/export.csv` streaming user study sessions with proper headers and escaping.

---

### B. Integration Work & Code Changes Made

#### 1. Syllabus Topic XP Completion Integration (`server/src/modules/syllabus/syllabus.service.js`)
- **Issue:** Person C's syllabus module implemented topic status updates but left the XP award hook uncalled, and `API.md` (line 397) and `client/src/App.jsx` (line 536) expect `{ xp_awarded: 20 }` on initial completion.
- **Change:**
  - Imported `awardTopicCompletionXp` into `syllabus.service.js`.
  - Inside `updateTopic`, when `updates.status === 'done'`, invoked `await awardTopicCompletionXp(client, userId, topicId)` within the update transaction.
  - If `awardResult.awarded` is true, attached `xp_awarded: 20` to the returned topic payload. On subsequent toggles or retries, `awardTopicCompletionXp` returns `{ awarded: false }` due to `idx_xp_events_topic_done`, and `xp_awarded` is cleanly omitted.
- **Why:** Delivers seamless end-to-end integration between Person C's topic completion and Person B's progression engine, satisfying PRD Section 4.6 and `API.md` specifications.

#### 2. End-to-End Syllabus XP Integration Test (`server/test/phase2-xp-bonuses.test.js`)
- **Change:** Added test verifying `PATCH /api/topics/:id` with `{ status: 'done' }` awards 20 XP on initial completion, reflects in `GET /api/me/xp`, and avoids double-awarding XP when toggled back and forth.
- **Why:** Automated regression protection ensuring the contract between Person B, Person C, and Person A remains strictly enforced.

---

### C. Final Full-System Test Suite Results

Ran the complete automated test suite across all 15 test files:

```text
 ✓ test/sessions.test.js (10 tests)
 ✓ test/auth.test.js (10 tests)
 ✓ test/syllabus.test.js (9 tests)
 ✓ test/phase2-xp-bonuses.test.js (10 tests)
 ✓ test/me.test.js (7 tests)
 ✓ test/anti-cheat.test.js (6 tests)
 ✓ test/stats.test.js (4 tests)
 ✓ test/phase1-integration.test.js (3 tests)
 ✓ test/planner.test.js (3 tests)
 ✓ test/subjects.test.js (6 tests)
 ✓ test/exams.test.js (4 tests)
 ✓ test/progression.test.js (6 tests)
 ✓ test/insights.test.js (2 tests)
 ✓ test/export.test.js (2 tests)
 ✓ test/migrations.test.js (1 test)

Test Files  15 passed (15)
     Tests  83 passed (83)
  Duration  27.45s
```

**Result:** All 15 suites and 83 tests passing with 100% pass rate. All Phase 1 and Phase 2 requirements across all three personas are fully present, functional, and integrated.

---

## 8. Dockerized Database Setup & Monorepo Developer Experience

**Date:** Oct 22, 2026  
**Change:**
1. **`docker-compose.yml`**: Added standard PostgreSQL 16 container (`postgres:16-alpine`) named `studyforge-postgres` with database `tracker`, credentials `postgres:postgres`, persistent volume `studyforge-pgdata`, port `5434:5432`, and health check. Port 5434 is exposed on host to completely avoid conflicts with native PostgreSQL (5432) and the automated test cluster (5433).
2. **`package.json`**: Added `"docker:up": "docker compose up -d"` and `"docker:down": "docker compose down"`.
3. **`.env` & `server/.env`**: Configured `DATABASE_URL=postgres://postgres:postgres@localhost:5434/tracker` in both root and `server/` to ensure seamless local connection to Docker PostgreSQL.
- **Why:** Enables running an isolated, containerized PostgreSQL database with a single command without port collisions or requiring PostgreSQL configuration on the host machine.
4. **Client Setup Verification**: Installed client dependencies (`react`, `react-dom`, `@vitejs/plugin-react`, `vite`) and verified clean production build (`npm --prefix client run build`) with Vite proxy routing `/api` to Express on port 3000.

---

## 9. Phase 3 Execution — Rate Limiting, Gate 2 Anti-Cheat & Nightly Audit

**Role:** Person B — Backend Core, Authentication & Security  
**Phase:** Phase 3 (Social)  
**Date:** Oct 22, 2026  

### A. Objectives & Responsibilities (Person B in Phase 3)
As defined in `docs/Study_Habit_Tracker_Project_Execution (1).md` and `docs/Study_Habit_Tracker_Architecture_Simple.md`:
1. **Friend Request Rate Limiter:** Protect social graph endpoints from spam and automated requests.
2. **Gate 2 Anti-Cheat Enforcement:** Ensure study time cannot be faked on social features:
   - Manual sessions marked `verified: false`, earn 0 XP, and are strictly excluded from leaderboards.
   - 16-hour daily study cap and 12-hour max session cap strictly enforced.
   - 4-hour (240 XP) session XP cap strictly enforced.
   - Overlapping sessions strictly rejected with 409 `SESSION_OVERLAP`.
3. **Nightly Audit Query Service:** Provide automated queries to detect cap saturation, suspicious high volume, and discrepancies between session logs and `daily_totals`.

### B. Code Changes Made

#### 1. Friend Request Rate Limiting (`server/src/middleware/rate-limit.js`)
- **Change:** Implemented and exported `friendRequestRateLimiter`:
  - 15-minute window (`windowMs = 15 * 60 * 1000`).
  - Max 15 requests per 15 minutes in development/production (relaxed in test environment).
  - Standardized JSON error response `{ error: { code: 'RATE_LIMITED', message: 'Too many friend requests sent. Please try again later.' } }`.
- **Why:** Required by PRD Section 10 and Architecture Section 10 to prevent friend request spamming and scraping. Ready for Person C to mount on `POST /api/friends/requests`.

#### 2. Nightly Anti-Cheat Audit Service (`server/src/modules/progression/audit.service.js`)
- **Change:** Created audit service with three specialized queries:
  - `findSuspiciousDays({ thresholdMinutes = 840, lookbackDays = 30, limit = 100 })`: Detects users approaching or saturating the 16-hour daily study cap (`DAILY_CAP_SATURATION`, `HIGH_VOLUME_SUSPICIOUS`), as well as users logging excessive manual hours (`EXCESSIVE_MANUAL_ENTRIES`).
  - `auditSessionDiscrepancies({ lookbackDays = 7, toleranceMinutes = 1 })`: Audits mathematical consistency by comparing sum of session durations against `daily_totals.verified_minutes`.
  - `runNightlyAntiCheatAudit(options)`: Aggregates flagged users, suspicious days, and discrepancies into an inspection report.
- **Why:** Fulfills Person B's Phase 3 commitment for automated nightly audit queries to preserve leaderboard integrity.

#### 3. Gate 2 Anti-Cheat Test Suite (`server/test/phase3-anticheat-gate2.test.js`)
- **Change:** Created test suite containing 8 integration tests covering:
  - Rate limiting behavior and 429 response formatting.
  - Manual sessions anti-cheat: `verified: false`, 0 XP, unverified minutes excluded from leaderboard queries.
  - Rejection of overlapping sessions with 409 `SESSION_OVERLAP`.
  - Enforcement of 240 XP cap on 5-hour verified sessions.
  - Enforcement of 16-hour daily cap on `daily_totals`.
  - Detection of cap saturation and report generation via `findSuspiciousDays` and `runNightlyAntiCheatAudit`.
- **Why:** Validates Gate 2 exit criteria ("study time is hard to fake").

### C. Full Automated Test Suite Results

All **16 test files** and **91 tests** pass cleanly:

```text
 ✓ test/auth.test.js (10 tests)
 ✓ test/phase3-anticheat-gate2.test.js (8 tests)
 ✓ test/exams.test.js (4 tests)
 ✓ test/phase2-xp-bonuses.test.js (10 tests)
 ✓ test/sessions.test.js (10 tests)
 ✓ test/subjects.test.js (6 tests)
 ✓ test/syllabus.test.js (9 tests)
 ✓ test/phase1-integration.test.js (3 tests)
 ✓ test/planner.test.js (3 tests)
 ✓ test/stats.test.js (4 tests)
 ✓ test/anti-cheat.test.js (6 tests)
 ✓ test/me.test.js (7 tests)
 ✓ test/progression.test.js (6 tests)
 ✓ test/insights.test.js (2 tests)
 ✓ test/export.test.js (2 tests)
 ✓ test/migrations.test.js (1 test)

Test Files  16 passed (16)
     Tests  91 passed (91)
  Duration  40.17s
```








