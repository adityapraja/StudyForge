# Study Habit Tracker — PRD (Simple Version)

Oct 17, 2026 · @Adi

## 1. Overview

Study Habit Tracker is a web app where students log study time, plan each day, and stay motivated through streaks, XP, friends and leaderboards.

**Scope rule for this version.** The project is deliberately simple. Every feature must be buildable with **Node.js, Express and one database**, and nothing else. Anything that needs WebSockets, a cache or queue server, an external AI service, a service worker, or a browser-only feature with no server or database is removed.

**Problem.** Learners rarely know how much they really study or which subjects they neglect.

**Vision.** One place to time your study, plan your day and see your progress.

**Platform.** Responsive website (no PWA, no offline mode).

## 2. Goals, non-goals and success metrics

**Goals**

- Make logging a study session quick (start, stop, saved).
- Turn raw study time into clear progress: streaks, heatmap, subject breakdown.
- Add light social features (friends, leaderboards) without live updates.

**Non-goals (this version)**

- Live study rooms, live presence ("who is studying right now"), room chat
- WebSockets, Redis, background job queues
- AI insights and AI-generated study plans
- Offline timer, installable PWA, background sync
- Pomodoro and custom focus modes, sound or browser notifications
- Ambient sounds
- Dark mode and themes
- Idle detection prompts
- Google or social login
- Docker, Kubernetes and any cloud-specific tooling
- Video rooms, app blocking, calendar sync, flashcards

**Success metrics (first 3 months, starting assumptions)**

| Metric | Target |
| --- | --- |
| Day-7 retention | 30% or higher |
| Weekly active users who log 3+ study days | 40% of WAU |
| Average sessions logged per active user per week | 5 or more |
| Users with at least one friend | 35% |

## 3. Target users and key use cases

| Persona | Need | Key use case |
| --- | --- | --- |
| Exam student | Cover the syllabus before a fixed date | Tracks time per subject, ticks off topics, watches the exam countdown |
| Working professional | Study in short, irregular windows | Daily plan and streaks to stay consistent |
| Social studier | Accountability | Adds friends, compares weekly study time |
| Self-improver | Understand personal patterns | Reviews heatmap and subject breakdown |

**Core user stories**

1. As a student, I start a timer for a subject, pause or take a break, and see that time saved to my log.
2. As a student, I plan my day in 10 minutes and review what I finished.
3. As a user, I add friends and see their streak, level and weekly study time.
4. As a user, I see where I rank on a daily, weekly or monthly leaderboard.

## 4. Features

Priorities: P0 = must have, P1 = should have.

### 4.1 Study timer and stopwatch

- **P0** Timer (countdown) and stopwatch (count up) modes.
- **P0** Custom subjects, each with a name and a color; every session is saved against one subject.
- **P0** Pause and resume; paused time is not counted.
- **P0** Break: logged separately, not counted as study time.
- **P0** Session recovery: the open session is stored in the database, so a refresh or closed tab does not lose it.
- **P1** Manual entry for a forgotten session.
- **P1** One-line session note when a session ends (optional, searchable in the log).

**Acceptance:** total study time for a day equals the sum of saved sessions, accurate to the minute.

### 4.2 Daily planner

- **P0** Set 1 to 3 daily goals (for example "2 hours of Physics").
- **P0** Quick to-do list for the day with check-off.
- **P0** End-of-day review: goals met, tasks done, total time logged, optional reflection note.
- **P1** Carry unfinished tasks over to tomorrow with one tap.

### 4.3 Leaderboards

- **P0** Daily, weekly and monthly leaderboards by focus time, computed from the database when the page is opened.
- **P0** Users pick a category (school, college, competitive exams, professional) and are ranked within it.
- **P1** Friends-only filter.
- **P1** Opt-out: users can hide themselves from public leaderboards.

**Acceptance:** a finished session appears in the rankings on the next page load; periods follow the user's own time zone.

### 4.4 Statistics

- **P0** Calendar heatmap where color deepens with more hours (with a number or pattern, not color alone).
- **P0** Progress graphs by day, week and month.
- **P0** Subject-wise pie or bar chart for a chosen period, using each subject's color.

### 4.5 Goals and streaks

- **P0** Daily and weekly study targets in hours, with a progress bar on the dashboard.
- **P0** Streak = consecutive days with at least a minimum study time (default 15 minutes, adjustable).
- **P0** One streak freeze per week, applied automatically the first time a day is missed. Longest streak is stored.

### 4.6 XP and levels

- 1 XP per focused minute; breaks and paused time earn nothing.
- Bonus: 50 XP for meeting the daily goal, 20 XP per completed syllabus topic.
- Levels rise with total XP; each level needs more XP than the last.
- Level and XP show on the profile and friends list.
- Manual entries earn no XP. XP from one session is capped at 4 hours.

### 4.7 Syllabus tracker and exam countdown

- **P0** Each subject can hold a nested syllabus (units, chapters, topics) with a status: not started, in progress, done.
- **P0** Subject page shows completion percentage.
- **P1** Add topics by hand or paste a plain-text list.
- **P1** Exam countdown: exams with subject and date; dashboard shows days left and average daily hours needed for a target total.

### 4.8 Friends

- Send and accept friend requests by username.
- Friends see each other's streak, level and weekly study time. (No live "studying now" status.)
- Privacy: weekly time and subjects visible to friends, everyone or nobody.
- Remove or block a friend at any time.

### 4.9 Rule-based insights (no AI)

- **P1** A simple weekly summary computed by plain code from the user's own data, for example the best time of day, a subject getting less time than planned, or days left to an exam.
- Each line shows the numbers it is based on.

### 4.10 Data export

- **P1** Download all sessions as CSV (date, subject, start, end, duration, note).
- **P1** Delete account with all data.

## 5. Anti-cheating (kept simple)

Leaderboards only work if time is honest, so the server enforces:

- A cap on hours logged per day (proposed default 16) and a maximum session length.
- Manual entries are excluded from leaderboards and XP.
- Overlapping sessions for one user are rejected.
- Start and stop times come from the server clock, not the browser.

## 6. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Performance | Dashboard loads in under 2 seconds on a mid-range phone on 4G |
| Timer accuracy | Store start timestamps, not a ticking counter, so background tabs stay accurate |
| Time zones | Store times in UTC; keep each user's time zone; daily, weekly and monthly boundaries follow it |
| Security | Hashed passwords (bcrypt), HTTPS, rate limiting on login and friend requests |
| Privacy | Users control visibility of weekly time, subjects and leaderboard presence |
| Accessibility | Keyboard-navigable, sufficient contrast, heatmap not reliant on color alone |
| Data ownership | CSV export and account deletion |

## 7. Data model

| Entity | Key fields |
| --- | --- |
| User | id, email, password hash, username, time zone, category, privacy settings, XP, level, leaderboard hidden |
| Subject | id, user, name, color |
| Session | id, user, subject, start, end, paused seconds, break seconds, note, source (timer or manual), verified |
| Goal | id, user, date, target minutes, reflection note |
| Task | id, user, date, text, done, carried over |
| Syllabus topic | id, subject, parent topic, title, status |
| Exam | id, user, subject, date, target hours |
| Friendship | requester, receiver, status (pending, accepted, blocked) |
| Streak | user, current, longest, freeze week, freezes used |

Everything (stats, streaks, XP, leaderboards, insights) is computed from the session table.

## 8. Release plan

| Phase | Contents |
| --- | --- |
| 1 — Tracker | Accounts, subjects, timer, daily planner, goals, streaks, statistics, CSV export |
| 2 — Progress | Syllabus, exam countdown, XP and levels, rule-based insights |
| 3 — Social | Friends, privacy settings, leaderboards (after study time is proven accurate and hard to fake) |

No dates are set yet.

## 9. Risks and open questions

| Risk | Mitigation |
| --- | --- |
| Users leave the timer running to climb rankings | Daily cap, session cap, verified-only ranking |
| Competition discourages beginners | Friends-only view, opt-out, focus on personal streaks |
| Leaderboard queries slow down with many users | Pre-computed `daily_totals` table and database indexes |

**Open questions**

- [ ] Minimum user age and handling of minors' data
- [ ] Should XP and levels unlock anything, or only be displayed?
- [ ] Which leaderboard categories exist?
- [ ] Target launch date and team size
