import { TaskCheckbox } from '@/components/ui/task-checkbox';

export default function DashboardPage({ formatSeconds, toClock, getSubjectName, user, subjects, activeSession, planner, setPlanner, xp, streak, goals, exams, setMode, todaySeconds, trackedTime }) {
  return (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Overview</p>
        <h1>Today’s study rhythm</h1>
      </div>
      <div className="stats-grid">
        <article className="stat-card">
          <span>Today</span>
          <strong>{formatSeconds(todaySeconds)}</strong>
          <small>{Math.min(100, Math.round((todaySeconds / (goals?.daily_target_seconds || 1)) * 100))}% of target</small>
        </article>
        <article className="stat-card">
          <span>Current streak</span>
          <strong>{streak?.current ?? '—'} days</strong>
          <small>{streak?.longest ?? 0} day personal best</small>
        </article>
        <article className="stat-card">
          <span>Level</span>
          <strong>{xp?.level ?? user.level ?? '—'}</strong>
          <small>{xp?.xp ?? user.xp ?? 0} XP total</small>
        </article>
        <article className="stat-card">
          <span>Session</span>
          <strong>{toClock(trackedTime)}</strong>
          <small>{activeSession ? activeSession.status.replace('_', ' ') : 'idle'}</small>
        </article>
      </div>

      <div className="split-layout top-gap">
        <div className="panel">
          <div className="panel-header">
            <p className="eyebrow">Progress</p>
            <h2>Goal pacing</h2>
          </div>
          <div className="progress-stack">
            <div>
              <div className="meta-row"><span>Daily target</span><span>{Math.min(100, Math.round((todaySeconds / (goals?.daily_target_seconds || 1)) * 100))}%</span></div>
              <div className="progress-bar"><span style={{ width: `${Math.min(100, (todaySeconds / (goals?.daily_target_seconds || 1)) * 100)}%` }} /></div>
            </div>
            <div>
              <div className="meta-row"><span>Weekly target</span><span>{Math.min(100, Math.round(((goals?.week_seconds || 0) / (goals?.weekly_target_seconds || 1)) * 100))}%</span></div>
              <div className="progress-bar"><span style={{ width: `${Math.min(100, ((goals?.week_seconds || 0) / (goals?.weekly_target_seconds || 1)) * 100)}%` }} /></div>
            </div>
            {xp ? (
              <div>
                <div className="meta-row"><span>Level {xp.level} progress</span><span>{xp.xp_in_level} / {xp.xp_for_next_level} XP</span></div>
                <div className="progress-bar" role="progressbar" aria-label="Progress to next level" aria-valuenow={xp.xp_in_level} aria-valuemin="0" aria-valuemax={xp.xp_for_next_level}>
                  <span style={{ width: `${Math.min(100, (xp.xp_in_level / xp.xp_for_next_level) * 100)}%` }} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <p className="eyebrow">Tracker</p>
            <h2>Quick focus</h2>
          </div>
          <ul className="list-stack">
            {(planner?.tasks ?? []).map((task) => (
              <li key={task.id} className={task.done ? 'done' : ''}>
                <TaskCheckbox
                  checked={task.done}
                  label={task.text}
                  onCheckedChange={setPlanner ? (checked) => {
                    setPlanner((current) => ({
                      ...current,
                      tasks: (current.tasks || []).map((item) =>
                        item.id === task.id ? { ...item, done: checked } : item
                      ),
                    }));
                  } : undefined}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
      {exams.length ? (
        <div className="panel top-gap">
          <div className="panel-header"><h2>Upcoming exams</h2><button className="ghost-button" type="button" onClick={() => setMode('exams')}>All exams</button></div>
          <ul className="list-stack">
            {exams.slice(0, 3).map((exam) => (
              <li key={exam.id}>
                <span>{getSubjectName(exam.subject_id, subjects)} · {exam.date}</span>
                <strong>{exam.days_left === 0 ? 'Today' : `${exam.days_left} days`}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
