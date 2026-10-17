# Study Habit Tracker — Project Execution Plan

Oct 17, 2026 · @Adi

**Team:** 3 people. **Stack:** Node.js + Express, PostgreSQL, React (Vite), plain JavaScript only.
**Based on:** the simplified product PRD and architecture documents. No dates are set, so work is planned in phases and steps, not calendar weeks.

## 1. Team roles at a glance

Replace the placeholder names with real names.

| Person | Role | Owns |
| --- | --- | --- |
| **Person A** | Frontend | All React screens, charts, heatmap, timer display, client-side routing and API calls |
| **Person B** | Backend core and Auth | Express setup, authentication, security, timer/session logic, session-end transaction (XP, streaks, anti-cheat), deployment |
| **Person C** | Database and data modules | PostgreSQL schema, migrations, planner, syllabus, exams, statistics, leaderboards, friends, export, insights |

**Why this split.** Each person owns a separate folder (`client/`, `server/src/modules/...`), so merge conflicts stay rare. Person B and Person C both write backend code, but in different modules.

## 2. Ownership by area

### 2.1 Frontend (Person A)

| Area | Work |
| --- | --- |
| Setup | Vite + React project, routing, folder layout, shared API helper (`fetch` wrapper that handles errors and cookies) |
| Auth screens | Register, login, logout, protected routes |
| Subjects | List, create, edit, delete subjects with a color picker |
| Timer page | Stopwatch and countdown, pause, break, stop, subject picker, optional note, recovery of an open session on page load, manual entry form |
| Planner | Daily goals (max 3), to-do list with check-off, end-of-day review, carry-over button |
| Dashboard | Today's total, goal progress bar, streak, level and XP, exam countdown cards |
| Statistics | Calendar heatmap (with numbers or patterns, not color alone), progress graphs, subject pie or bar chart |
| Syllabus | Nested topic list, status change, paste-a-list import, completion percentage |
| Social | Friends list, requests, block, leaderboard page with period, category and friends-only filters |
| Settings | Time zone, category, privacy options, leaderboard opt-out, streak minimum, CSV download, delete account |
| Quality | Responsive layout, keyboard navigation, color contrast, loading and error states |

### 2.2 Backend core and Auth (Person B)

| Area | Work |
| --- | --- |
| Setup | Express app, folder layout, central error handler, config from environment variables, request logging |
| Auth | Register, login, logout, `bcrypt` hashing, JWT in an httpOnly cookie, auth middleware, protected-route check |
| Security | Helmet, CORS allow-list, rate limiting on login, register and friend requests, Zod validation middleware |
| Sessions module | Start, pause, resume, break, stop, active-session lookup, manual entry, session list and search |
| Session-end transaction | Validate (caps, overlap, server clock), update `daily_totals`, award XP, update streak, all in one database transaction |
| Anti-cheat | Daily cap, maximum session length, manual entries not verified, overlap rejection |
| Progression | XP, levels, streaks with weekly freeze, `GET /me/xp`, `/me/streak`, `/me/goals` |
| Users | Profile, time zone, category, privacy settings |
| Deployment | Hosting setup, environment variables, HTTPS, CI that runs tests on every push; Docker later |

### 2.3 Database and data modules (Person C)

| Area | Work |
| --- | --- |
| Schema | `schema.sql` with all tables, keys, indexes and check constraints (see architecture section 6) |
| Migrations | Migration approach (ordered SQL files or `node-pg-migrate`), seed data for development |
| Database access | `db.js` connection pool, helper for transactions that Person B uses |
| Planner module | Goals and tasks endpoints, end-of-day review, carry-over |
| Syllabus module | Topic tree, status, completion percentage, plain-text import |
| Exams module | Exam CRUD, days left, hours needed per day |
| Statistics module | Heatmap, progress and subject-breakdown queries, rule-based insights |
| Friends module | Requests, accept, remove, block, the single `canView` privacy function |
| Leaderboard module | Daily, weekly and monthly ranking queries by category, friends-only filter, opt-out |
| Export | CSV export and account deletion (cascading rows) |
| Performance | Indexes, check query speed on large test data |

## 3. Shared work (all three)

| Item | Who | Notes |
| --- | --- | --- |
| API contract | All, led by B | A list of endpoints, request bodies and responses, written before coding starts. Keep it in one file (`API.md`) |
| Repository and Git rules | B sets up, all follow | See section 6 |
| README | B | How to install, set up the database, run server and client |
| Code review | Everyone | Every pull request is reviewed by at least one other person |
| Testing | Each person tests their own code | See section 7 |
| Demo and bug bash | All | End of each phase |

## 4. Execution phases

Phases follow the release plan. Each step lists who works on it; steps in the same row can run in parallel.

### Step 0 — Setup (everyone, short)

| Person | Tasks |
| --- | --- |
| B | Create the repo, Express skeleton, `.env.example`, CI that runs tests |
| C | Install PostgreSQL, write the first version of `schema.sql` for users, subjects, sessions, daily_totals, streaks |
| A | Create the Vite React app, routing, API helper |
| All | Agree on `API.md` for Phase 1 endpoints and the error response shape |

### Phase 1 — Tracker

**Goal:** a person can register, create subjects, time a session, plan the day, and see simple statistics.

| Person | Tasks |
| --- | --- |
| B | Auth endpoints and middleware; sessions endpoints; session-end transaction; streaks; anti-cheat caps |
| C | Remaining Phase 1 tables; planner endpoints; statistics endpoints (heatmap, progress, subject breakdown); CSV export |
| A | Auth screens; subjects page; timer page with recovery; planner; dashboard; heatmap and charts; settings; CSV button |

**Handoffs**

- B finishes auth first, so A and C can sign in during development.
- C gives B the transaction helper early; B gives C the final shape of `daily_totals` updates.
- A builds against sample JSON from `API.md` until real endpoints are ready.

**Exit check (Gate 1: study time is accurate).** Day total equals the sum of sessions to the minute; pause and break are not counted; refresh restores the open session; midnight splits correctly in the user's time zone. Test on a real phone browser with the tab in the background.

### Phase 2 — Progress

**Goal:** deeper tracking and motivation.

| Person | Tasks |
| --- | --- |
| B | XP awards and levels; bonus XP rules; weekly goals endpoints |
| C | Syllabus module; exams module; rule-based insights; XP and syllabus hooks (topic done gives XP via B's XP function) |
| A | Syllabus page; exam countdown; XP and level display; insights page; weekly goals progress |

**Exit check.** XP awarded once per session and per bonus (no double awards on retry); syllabus completion matches topic statuses; insights show the numbers they are based on.

### Phase 3 — Social

**Goal:** friends and leaderboards, after time is proven honest.

| Person | Tasks |
| --- | --- |
| C | Friends module; `canView`; leaderboard queries; opt-out |
| B | Rate limits on friend requests; anti-cheat review (Gate 2); nightly check query for suspicious days if time allows |
| A | Friends page; privacy settings; leaderboard page with filters |

**Exit check (Gate 2: study time is hard to fake).** Manual and overlapping sessions cannot reach leaderboards; caps work; privacy settings and blocks are respected on every screen.

### Final step — Release

| Person | Tasks |
| --- | --- |
| B | Production deployment, HTTPS, environment variables, backup setting on the database |
| C | Database backup check, final index review, restore test |
| A | Accessibility pass (keyboard, contrast, heatmap without color alone), mobile layout check |
| All | Bug bash, README and user-facing text review |

## 5. Dependencies and critical path

```text
Setup -> Auth (B) -> everyone can log in
      -> Schema (C) -> Sessions module (B) -> Timer screen (A)
                    -> Planner, stats modules (C) -> Planner, stats screens (A)
Sessions + daily_totals (B) -> Streaks, XP (B) -> Leaderboards (C) -> Leaderboard screen (A)
```

The **critical path** is: schema, then sessions and the session-end transaction, then everything that reads `daily_totals`. If these slip, stats, streaks, XP and leaderboards all slip.

**Rules to avoid blocking each other**

1. Schema changes go through Person C; ask in the team chat before changing a table.
2. Person A can use hard-coded sample data until an endpoint exists, then switches to the real one.
3. Any change to an endpoint's shape is written in `API.md` first and announced to the team.

## 6. Working agreement

| Topic | Rule |
| --- | --- |
| Branches | `main` always works; each task is a branch such as `feature/timer-page`, merged by pull request |
| Pull requests | Small, one task each, reviewed by at least one other person before merging |
| Commit messages | Short and clear, for example `Add pause endpoint` |
| Code style | ESLint and Prettier, run before committing |
| Language | Plain JavaScript only; no TypeScript |
| Secrets | Never in the repo; use `.env` (listed in `.gitignore`) and share `.env.example` |
| Daily sync | A short check-in: what I did, what I will do, what blocks me |
| End of phase | Demo, bug list, decide what moves to the next phase |

## 7. Testing responsibilities

| Person | Tests |
| --- | --- |
| B | Auth (hashing, wrong password, rate limit); timer and session rules; anti-cheat; streak and XP rules |
| C | Planner, syllabus, exams; statistics queries; friends and `canView` for every setting; leaderboard filters; CSV export and account delete; check constraints in the database |
| A | Manual checks of every screen on desktop and phone; loading and error states; keyboard use; background-tab timer check on a real phone |
| All | Final walk-through of the main user stories before each phase exit |

Tools: Jest or Vitest with Supertest for the backend, tested against a separate test database.

## 8. Risks and how the team handles them

| Risk | Handling |
| --- | --- |
| Frontend waits on backend | `API.md` first; sample data in the client |
| Person B overloaded (largest share) | Person C takes over deployment or XP bonuses if B falls behind; Person A helps with simple endpoints once the screens are ahead |
| Schema changes break others | One owner (C), changes announced, migrations are ordered files |
| Time bugs (time zones, midnight) | Tests written first for day-boundary logic; one shared time helper using Luxon |
| Scope creep back into removed features | Anything on the PRD non-goals list (live rooms, AI, PWA, Docker) waits until after release |

## 9. Definition of done (for any task)

- Works as described in the PRD and `API.md`.
- Tested (automated where it is backend logic, manual where it is a screen).
- Reviewed and merged by pull request.
- No secrets, no console errors, no unused code.
- Added to the README or `API.md` if others need to know about it.
