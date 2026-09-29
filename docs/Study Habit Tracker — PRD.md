# Study Habit Tracker — PRD

Sep 28, 2026 · @Adi

## 1. Overview

Study Habit Tracker is a web app where students and professionals log focused study time, plan each day, and stay motivated through streaks, XP, friends and AI-driven insights.

**Problem.** Learners rarely know how much they really study or which subjects they neglect. Solo studying is isolating, and today they juggle separate timer, planner, flashcard and social apps.

**Vision.** One place to time your study, plan your day, see your progress, and study alongside others, with enough game-like feedback to build a lasting habit without adding pressure.

**Platform.** Responsive website, built as an installable PWA so it works like a mobile app.

## 2. Goals, non-goals and success metrics

The product succeeds if users come back daily and keep logging honest study time.

**Goals**

- Make logging a study session take under 5 seconds.
- Turn raw study time into clear progress: streaks, heatmaps, subject breakdowns and AI insights.
- Make studying social through friends, rooms and leaderboards, without forcing competition.
- Keep the product usable on mobile browsers, including offline timer use.

**Non-goals (this version)**

- Video or camera study rooms
- Website or app blocking (needs a browser extension)
- Calendar sync, group whiteboards and group challenges
- Flashcards and spaced repetition

**Success metrics**

| Metric | Target (first 3 months after launch) |
| --- | --- |
| Day-7 retention | 30% or higher |
| Weekly active users who log 3+ study days | 40% of WAU |
| Average sessions logged per active user per week | 5 or more |
| Users with at least one friend or group | 35% |
| Users who open AI insights at least once a week | 25% of WAU |

These targets are starting assumptions; adjust them once real baseline data exists.

## 3. Target users and key use cases

The primary users are students preparing for exams and working professionals studying for certifications; both need consistency more than motivation tricks.

| Persona | Need | Key use case |
| --- | --- | --- |
| Exam student (school, college, competitive exams) | Cover the full syllabus before a fixed date | Tracks time per subject, ticks off syllabus topics, watches the exam countdown |
| Working professional | Study in short, irregular windows | Uses Pomodoro sessions, a 10-minute daily plan and streaks to stay consistent |
| Social studier | Accountability and company | Joins a study room, adds friends, compares weekly focus time |
| Self-improver | Understand personal patterns | Reviews heatmaps, session ratings and AI insights |

**Core user stories**

1. As a student, I start a timer for a subject, take breaks, and see that time saved to my log.
2. As a student, I plan tomorrow in 10 minutes and review what I finished today.
3. As a user, I add friends and see their streak and study time.
4. As a user, I join a study room and see who is studying right now.
5. As a user, I get a plain-language insight about my best study times and neglected subjects.

## 4. Core features

These five features form the base product and ship first. Priorities: P0 = must have, P1 = should have.

### 4.1 Study timer and stopwatch

- **P0** Timer (countdown) and stopwatch (count up) modes.
- **P0** Custom subjects, each with a name and a color; every session is saved against one subject.
- **P0** Pause and resume; paused time is not counted as study time.
- **P0** Break feature: a break is logged separately and does not count toward study time.
- **P0** Session recovery: an in-progress session survives a page refresh or closed tab.
- **P1** Manual entry to add a session the user forgot to time.

**Acceptance:** total study time for a day equals the sum of all saved sessions, accurate to the minute.

### 4.2 Real-time study groups

- **P0** Create a public or private room (private = invite link or code).
- **P0** Room page shows members, who is currently studying, their subject and live elapsed time.
- **P1** Room owner can remove members; members can report others.
- **P1** Optional room chat, kept to short text messages.

**Acceptance:** a member starting or stopping a session appears to others within 2 seconds.

### 4.3 10-minute daily planner

- **P0** Set 1 to 3 daily goals (for example "2 hours of Physics").
- **P0** Quick to-do list for the day with check-off.
- **P0** End-of-day review: goals met, tasks done and total time logged, plus one optional reflection note.
- **P1** Unfinished tasks can be carried over to tomorrow with one tap.

### 4.4 Rankings and leaderboards

- **P0** Leaderboards for daily, weekly and monthly focus duration.
- **P0** Users choose a category (for example school, college, competitive exams, professional) and are ranked within it.
- **P1** Filter by friends only.
- **P1** Opt-out: users can hide themselves from public leaderboards.

**Acceptance:** rankings update within 1 minute of a session ending; periods reset at midnight in the user's own time zone.

### 4.5 Visual statistics and heatmaps

- **P0** Calendar heatmap where color deepens with more hours studied.
- **P0** Progress graphs by day, week and month.
- **P1** Per-subject charts (see 5.4) and total-time summary cards.

## 5. Focus tools and habit features

These lightweight features build on the core timer and are all planned for the first release.

| # | Feature | Requirements | Priority |
| --- | --- | --- | --- |
| 5.1 | Pomodoro and custom focus modes | Presets 25/5 and 50/10 plus user-defined focus and break lengths; sound or browser notification when a phase ends; auto-start next phase is optional | P0 |
| 5.2 | Daily and weekly study goals | Set a target in hours per day and per week; progress ring on the dashboard; goal shown as met or missed in the daily review | P0 |
| 5.3 | Streaks | Streak counts consecutive days with at least a minimum study time (default 15 minutes, user adjustable); one streak freeze per week to protect against a missed day; longest streak is also stored | P0 |
| 5.4 | Subject-wise breakdown | Pie or bar chart of time per subject for a chosen period, using each subject's color | P0 |
| 5.5 | Session notes | One-line "what did you study?" prompt when a session ends; optional, skippable; searchable in the log | P1 |
| 5.6 | Exam countdown | Add exams with subject and date; dashboard shows days left and the average daily hours needed if the user sets a target total | P1 |
| 5.7 | Ambient sounds | Rain, white noise, lo-fi and cafe loops with a volume slider; plays during a session and can run without leaving the timer page | P1 |
| 5.8 | Dark mode and themes | Light, dark and system-follow options; choice saved to the account | P1 |
| 5.9 | Data export | Download all sessions as CSV (date, subject, start, end, duration, note) | P1 |

**Rules for streaks:** the day boundary follows the user's time zone, and a streak freeze is applied automatically the first time a day is missed in a week.

## 6. Progression, planning, social and AI features

These four features add depth beyond the basic tracker. All numbers below are proposed defaults to tune after launch.

### 6.1 XP and levels

- Users earn 1 XP per focused minute; breaks and paused time earn nothing.
- Bonus XP: 50 for meeting the daily goal, 20 per completed syllabus topic, and 10 per streak day (capped at 100 per day).
- Levels rise with total XP; each level needs more XP than the last, so early levels come quickly.
- Level and XP show on the profile, friends list and room member cards.
- Anti-abuse: XP from a single session is capped at 4 hours, and idle sessions (see section 7) earn no XP.

### 6.2 Task and syllabus tracker

- Each subject can hold a syllabus: units, chapters and topics in a nested list.
- Topics have a status (not started, in progress, done) and can be tied to a study session.
- Subject page shows a completion percentage and estimated hours logged per topic.
- Topics can be added by hand or pasted as a plain-text list.
- Syllabus progress feeds the daily planner (suggested tasks) and the exam countdown.

### 6.3 Friends list

- Send and accept friend requests by username or invite link.
- Friends see each other's streak, level, current study status and weekly study time.
- Friends-only leaderboard (see 4.4).
- Privacy controls: visibility of study status and subjects can be set to friends, everyone or nobody.
- Users can remove or block a friend at any time.

### 6.4 AI study insights

- Weekly and monthly insight cards written in plain language, for example the best time of day to study, a subject getting less time than planned, or how close the user is to an exam target.
- Insights use only the user's own aggregated data: session times, durations, subjects, goals, syllabus progress and exam dates.
- Optional "suggest a plan": the AI proposes a study schedule for the coming week from exam dates and syllabus progress, which the user can accept, edit or dismiss.
- Every insight shows the numbers it is based on, so users can verify it.
- Insights are generated once per period and cached to control cost; opt-in during onboarding and switchable off in settings.
- The AI gives study-planning advice only, not medical or mental health advice.

## 7. Non-functional requirements

Trust in the numbers matters most: leaderboards and streaks only work if study time is accurate and hard to fake.

| Area | Requirement |
| --- | --- |
| Performance | Dashboard loads in under 2 seconds on a mid-range phone on 4G; timer keeps running accurately in background tabs (store start timestamps, not a ticking counter) |
| Real-time | Room presence and live leaderboard updates delivered within 2 seconds using WebSockets or a managed real-time service |
| Anti-cheating | Idle detection with a periodic "still studying?" check; unconfirmed time is discarded after a grace period; a cap on hours logged per day; manual entries are excluded from leaderboards |
| Time zones | Store all times in UTC and keep each user's time zone; daily, weekly and monthly boundaries follow the user's zone |
| Privacy | Users control visibility of profile, status, subjects and leaderboard presence; AI insights are opt-in and use only the user's own aggregated data |
| Security | Hashed passwords or social login, HTTPS everywhere, rate limiting on auth, friend requests and room joins |
| Moderation | Report and block in rooms and chat; room owners can remove members; basic profanity filter on usernames and chat |
| Offline | PWA lets the timer run offline and sync sessions when the connection returns |
| Accessibility | Keyboard-navigable, sufficient color contrast (also for subject colors and heatmaps), and heatmaps that do not rely on color alone |
| Data ownership | Users can export their data (5.9) and delete their account with all data |

Age and consent rules for a public study platform (for example handling of minors' data) need a decision before launch; see open questions.

## 8. High-level data model

The core record is the study session; almost every feature (stats, streaks, XP, leaderboards, insights) is computed from sessions.

| Entity | Key fields | Used by |
| --- | --- | --- |
| User | id, username, time zone, category, privacy settings, XP, level, theme | All features |
| Subject | id, user, name, color, exam date (optional) | Timer, stats, syllabus, exams |
| Session | id, user, subject, start, end, paused seconds, break seconds, note, source (timer or manual), verified flag | Timer, heatmap, leaderboards, XP, insights |
| Goal | id, user, date, target minutes, tasks, reflection note | Daily planner, weekly goals |
| Task | id, user, date, text, done, carried over | Daily planner |
| Syllabus topic | id, subject, parent topic, title, status | Syllabus tracker, insights |
| Room and membership | id, name, visibility, owner; room, user, role | Study groups |
| Friendship | requester, receiver, status (pending, accepted, blocked) | Friends list |
| Streak | user, current, longest, freezes used this week | Streaks |
| Insight | id, user, period, text, source numbers, created at | AI insights |

Leaderboards are computed from verified sessions only and can be cached per category and period.

The tech stack is not chosen yet; that decision is listed under open questions.

## 9. Release plan

&#91;embedded content: release roadmap · 3 phases, 2 gates\]

Phase 1 works as a complete tracker on its own; social and AI features follow once study time is proven accurate (Gate 1) and hard to fake (Gate 2). Phase contents follow the priorities in sections 4 to 6, and no dates are set yet.

## 10. Risks and open questions

The biggest risks are fake study time on leaderboards and real-time features growing more complex than expected.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Users leave the timer running to climb rankings | Leaderboards lose credibility | Idle checks, daily cap, verified-only ranking (section 7) |
| Competition stresses or discourages users | Lower retention, especially for beginners | Friends-only view, opt-out from public rankings, focus on personal streaks and goals |
| Real-time rooms are costly to build and run | Delays Phase 2 | Use a managed real-time service; start with presence only, add chat later |
| AI insights are generic or wrong | Users ignore them | Show source numbers with each insight; start with simple rule-based patterns before adding AI text generation |
| AI usage cost grows with users | Unplanned spend | Generate once per period, cache results, set per-user limits |
| Abuse in public rooms | Safety and reputation issues | Report, block, owner controls and username filtering |

**Open questions**

- [ ] Which tech stack and hosting will be used, and does it support real-time updates?
- [ ] Is login by email, social accounts or both?
- [ ] Minimum user age, and how minors' data and public rooms are handled?
- [ ] Should XP and levels affect anything, or is it purely for display?
- [ ] What categories exist for leaderboards, and can users create their own?
- [ ] Will the product be free, or is a paid tier planned (for example for AI insights)?
- [ ] Target launch date and team size, so the phases can be scheduled?
