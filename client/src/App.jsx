import { useEffect, useMemo, useState } from 'react';

const defaultUser = {
  id: 'u_demo',
  email: 'adi@example.com',
  username: 'adi',
  time_zone: 'Asia/Kolkata',
  category: 'college',
  leaderboard_hidden: false,
  privacy: { weekly_time: 'friends', subjects: 'friends' },
  xp: 1240,
  level: 5,
  streak_minimum_minutes: 15,
  daily_target_seconds: 14400,
  weekly_target_seconds: 72000,
};

const demoSubjects = [
  { id: 's1', name: 'Physics', color: '#4F8EF7' },
  { id: 's2', name: 'Math', color: '#171717' },
  { id: 's3', name: 'Chemistry', color: '#6B7280' },
];

const demoActiveSession = {
  id: 'ss_active',
  subject_id: 's1',
  started_at: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
  ended_at: null,
  status: 'running',
  paused_seconds: 0,
  break_seconds: 0,
  segment_started_at: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
  study_seconds: null,
  note: null,
  source: 'timer',
  verified: true,
};

const demoPlanner = {
  date: new Date().toISOString().slice(0, 10),
  goals: [
    { id: 'g1', text: 'Physics revision', target_seconds: 7200, subject_id: 's1' },
    { id: 'g2', text: 'Math problems', target_seconds: 5400, subject_id: 's2' },
  ],
  tasks: [
    { id: 't1', text: 'Solve chapter 4 problems', done: true, carried_over: false },
    { id: 't2', text: 'Review formula sheet', done: false, carried_over: false },
  ],
  reflection: 'Focused blocks were strong. Keep momentum into the evening.',
  review: { total_seconds: 5400, goals_met: 0, goals_total: 2, tasks_done: 1, tasks_total: 2 },
};

const demoHeatmap = {
  year: 2026,
  days: [
    { date: '2026-10-16', seconds: 7200 },
    { date: '2026-10-17', seconds: 5400 },
    { date: '2026-10-18', seconds: 18000 },
    { date: '2026-10-19', seconds: 12600 },
  ],
  max_seconds: 18000,
};

const demoStats = {
  week: {
    range: 'week',
    points: [
      { label: 'Mon', seconds: 3600 },
      { label: 'Tue', seconds: 0 },
      { label: 'Wed', seconds: 5400 },
      { label: 'Thu', seconds: 9000 },
      { label: 'Fri', seconds: 7200 },
      { label: 'Sat', seconds: 0 },
      { label: 'Sun', seconds: 4500 },
    ],
    total_seconds: 40500,
    daily_average_seconds: 5786,
  },
  subjects: {
    range: 'week',
    subjects: [
      { subject_id: 's1', name: 'Physics', color: '#4F8EF7', seconds: 18000, percent: 60 },
      { subject_id: 's2', name: 'Math', color: '#171717', seconds: 9000, percent: 28 },
      { subject_id: 's3', name: 'Chemistry', color: '#6B7280', seconds: 4500, percent: 12 },
    ],
    total_seconds: 31500,
  },
};

const formatSeconds = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const toHumanTime = (seconds) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const toClock = (seconds) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = String(Math.floor(safe / 3600)).padStart(2, '0');
  const mins = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const secs = String(safe % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
};

const normalizeList = (value, fallback = []) => {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  if (value && Array.isArray(value.results)) return value.results;
  if (value && Array.isArray(value.subjects)) return value.subjects;
  if (value && Array.isArray(value.goals)) return value.goals;
  if (value && Array.isArray(value.tasks)) return value.tasks;
  if (value && Array.isArray(value.days)) return value.days;
  if (value && Array.isArray(value.points)) return value.points;
  return fallback;
};

const normalizeSession = (value) => {
  if (!value) return null;
  if (value.session && typeof value.session === 'object') return value.session;
  return value;
};

const normalizeStats = (value) => {
  if (!value || typeof value !== 'object') return demoStats;

  return {
    week: {
      ...demoStats.week,
      ...(value.week || {}),
      points: normalizeList(value.week?.points, demoStats.week.points),
    },
    subjects: {
      ...demoStats.subjects,
      ...(value.subjects || {}),
      subjects: normalizeList(value.subjects?.subjects, demoStats.subjects.subjects),
    },
  };
};

const getSubjectName = (subjectId, subjects) =>
  (Array.isArray(subjects) ? subjects : []).find((subject) => subject.id === subjectId)?.name || 'General';

const request = async (path, options = {}) => {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const error = data?.error || { message: 'Request failed' };
    throw new Error(error.message || 'Request failed');
  }

  return data;
};

function App() {
  const [user, setUser] = useState(defaultUser);
  const [subjects, setSubjects] = useState(demoSubjects);
  const [activeSession, setActiveSession] = useState(demoActiveSession);
  const [planner, setPlanner] = useState(demoPlanner);
  const [heatmap, setHeatmap] = useState(demoHeatmap);
  const [stats, setStats] = useState(demoStats);
  const [authMode, setAuthMode] = useState('login');
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [selectedSubjectId, setSelectedSubjectId] = useState('s1');
  const [mode, setMode] = useState('dashboard');
  const [sessionNote, setSessionNote] = useState('');

  useEffect(() => {
    const loadDashboard = async () => {
      if (!isAuthenticated) return;

      try {
        const [me, subjectList, active, plannerData, heatmapData, statsData] = await Promise.all([
          request('/api/me').catch(() => defaultUser),
          request('/api/subjects').catch(() => demoSubjects),
          request('/api/sessions/active').catch(() => ({ session: demoActiveSession })),
          request('/api/planner/' + new Date().toISOString().slice(0, 10)).catch(() => demoPlanner),
          request('/api/stats/heatmap?year=2026').catch(() => demoHeatmap),
          Promise.all([
            request('/api/stats/progress?range=week').catch(() => demoStats.week),
            request('/api/stats/subjects?range=week').catch(() => demoStats.subjects),
          ]).then(([progress, subjectBreakdown]) => ({ week: progress, subjects: subjectBreakdown })),
        ]);

        if (me && me.id) setUser({ ...defaultUser, ...me });
        if (subjectList) setSubjects(normalizeList(subjectList, demoSubjects));
        if (active) setActiveSession(normalizeSession(active));
        if (plannerData) {
          setPlanner({
            ...demoPlanner,
            ...plannerData,
            goals: normalizeList(plannerData.goals, demoPlanner.goals),
            tasks: normalizeList(plannerData.tasks, demoPlanner.tasks),
          });
        }
        if (heatmapData) setHeatmap({ ...demoHeatmap, ...heatmapData, days: normalizeList(heatmapData.days, demoHeatmap.days) });
        if (statsData) setStats(normalizeStats(statsData));
      } catch (error) {
        console.warn('Dashboard fallback active', error.message);
      }
    };

    loadDashboard();
  }, [isAuthenticated]);

  const todaySeconds = useMemo(() => {
    const total = stats.week?.points?.reduce((sum, point) => sum + (point.seconds || 0), 0) || 0;
    return total;
  }, [stats]);

  const trackedTime = useMemo(() => {
    const raw = activeSession && activeSession.started_at
      ? Math.max(0, Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000) - (activeSession.paused_seconds || 0) - (activeSession.break_seconds || 0))
      : 0;
    return raw;
  }, [activeSession]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      email: formData.get('email'),
      password: formData.get('password'),
      username: formData.get('username') || undefined,
      time_zone: 'Asia/Kolkata',
      category: 'college',
    };

    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await request(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUser({ ...defaultUser, ...response });
      setIsAuthenticated(true);
      setMode('dashboard');
      event.currentTarget.reset();
    } catch (error) {
      alert(error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.warn(error);
    }
    setIsAuthenticated(false);
    setMode('login');
  };

  const handleTimerAction = async (action) => {
    if (action === 'start') {
      const created = await request('/api/sessions/start', {
        method: 'POST',
        body: JSON.stringify({ subject_id: selectedSubjectId }),
      });
      setActiveSession(created);
      return;
    }

    if (!activeSession || !activeSession.id) {
      return;
    }

    const pathMap = {
      pause: `/api/sessions/${activeSession.id}/pause`,
      break: `/api/sessions/${activeSession.id}/break`,
      resume: `/api/sessions/${activeSession.id}/resume`,
      stop: `/api/sessions/${activeSession.id}/stop`,
    };

    const response = action === 'stop'
      ? await request(pathMap.stop, {
          method: 'POST',
          body: JSON.stringify({ note: sessionNote || undefined }),
        })
      : await request(pathMap[action], { method: 'POST' });

    if (response?.session) {
      setActiveSession(response.session);
      return;
    }

    setActiveSession(response || null);
  };

  const handleSubjectSave = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name') || '').trim();
    const color = String(formData.get('color') || '#0a0a0a');
    if (!name) return;

    try {
      const created = await request('/api/subjects', {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      });
      setSubjects((current) => [...current, created]);
      event.currentTarget.reset();
    } catch (error) {
      alert(error.message);
    }
  };

  const handlePlannerSave = async () => {
    try {
      const payload = {
        goals: planner.goals.map((goal) => ({
          id: goal.id,
          text: goal.text,
          target_seconds: goal.target_seconds,
          subject_id: goal.subject_id,
        })),
        tasks: planner.tasks.map((task) => ({
          id: task.id,
          text: task.text,
          done: task.done,
        })),
        reflection: planner.reflection,
      };
      const updated = await request(`/api/planner/${planner.date}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setPlanner(updated);
    } catch (error) {
      alert(error.message);
    }
  };

  const handleDownloadCsv = async () => {
    try {
      const blob = await fetch('/api/me/export.csv', { credentials: 'include' }).then((response) => response.blob());
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'study-sessions.csv';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('CSV export is unavailable right now.');
    }
  };

  const renderDashboard = () => (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Overview</p>
        <h1>Today’s study rhythm</h1>
      </div>
      <div className="stats-grid">
        <article className="stat-card">
          <span>Today</span>
          <strong>{formatSeconds(todaySeconds)}</strong>
          <small>{Math.min(100, Math.round((todaySeconds / user.daily_target_seconds) * 100))}% of target</small>
        </article>
        <article className="stat-card">
          <span>Current streak</span>
          <strong>{user.streak_minimum_minutes || 15} min</strong>
          <small>Goal threshold</small>
        </article>
        <article className="stat-card">
          <span>Level</span>
          <strong>{user.level}</strong>
          <small>{user.xp} XP total</small>
        </article>
        <article className="stat-card">
          <span>Session</span>
          <strong>{toClock(trackedTime)}</strong>
          <small>{activeSession ? 'timer running' : 'idle'}</small>
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
              <div className="meta-row"><span>Daily target</span><span>{Math.min(100, Math.round((todaySeconds / user.daily_target_seconds) * 100))}%</span></div>
              <div className="progress-bar"><span style={{ width: `${Math.min(100, (todaySeconds / user.daily_target_seconds) * 100)}%` }} /></div>
            </div>
            <div>
              <div className="meta-row"><span>Weekly target</span><span>{Math.min(100, Math.round((stats.week?.total_seconds || 0) / user.weekly_target_seconds * 100))}%</span></div>
              <div className="progress-bar"><span style={{ width: `${Math.min(100, ((stats.week?.total_seconds || 0) / user.weekly_target_seconds) * 100)}%` }} /></div>
            </div>
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
                <span>{task.text}</span>
                <input type="checkbox" checked={task.done} readOnly />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );

  const renderSubjects = () => (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Subjects</p>
        <h1>Track each focus area</h1>
      </div>
      <div className="split-layout">
        <div className="panel">
          <div className="panel-header">
            <h2>Existing subjects</h2>
          </div>
          <div className="subject-list">
            {subjects.map((subject) => (
              <div className="subject-row" key={subject.id}>
                <div className="subject-name"><span className="swatch" style={{ background: subject.color }} />{subject.name}</div>
                <div className="row-actions">
                  <button type="button" className="ghost-button">Edit</button>
                  <button type="button" className="ghost-button danger">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Add subject</h2>
          </div>
          <form className="stack-form" onSubmit={handleSubjectSave}>
            <label>
              <span>Subject name</span>
              <input type="text" name="name" placeholder="e.g. Biology" />
            </label>
            <label>
              <span>Color</span>
              <input type="color" name="color" defaultValue="#0a0a0a" />
            </label>
            <button type="submit" className="primary-button">Create subject</button>
          </form>
        </div>
      </div>
    </section>
  );

  const renderTimer = () => (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Timer</p>
        <h1>Manage focus blocks</h1>
      </div>
      <div className="split-layout">
        <div className="panel timer-panel">
          <div className="timer-display">{toClock(trackedTime)}</div>
          <div className="subject-select">
            <label>
              <span>Subject</span>
              <select value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)}>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="button-row">
            {!activeSession || activeSession.status === 'ended' ? (
              <button type="button" className="primary-button" onClick={() => handleTimerAction('start')}>Start timer</button>
            ) : null}
            {activeSession && activeSession.status === 'running' ? (
              <>
                <button type="button" className="ghost-button" onClick={() => handleTimerAction('pause')}>Pause</button>
                <button type="button" className="ghost-button" onClick={() => handleTimerAction('break')}>Break</button>
                <button type="button" className="primary-button" onClick={() => handleTimerAction('stop')}>Stop</button>
              </>
            ) : null}
            {activeSession && (activeSession.status === 'paused' || activeSession.status === 'on_break') ? (
              <>
                <button type="button" className="primary-button" onClick={() => handleTimerAction('resume')}>Resume</button>
                <button type="button" className="ghost-button" onClick={() => handleTimerAction('stop')}>Stop</button>
              </>
            ) : null}
          </div>
          <label className="note-textarea">
            <span>Session note</span>
            <textarea value={sessionNote} rows="4" onChange={(event) => setSessionNote(event.target.value)} placeholder="What did you work on?" />
          </label>
        </div>

        <div className="panel">
          <div className="panel-header">
            <p className="eyebrow">Recovery</p>
            <h2>Open session state</h2>
          </div>
          {activeSession && activeSession.status !== 'ended' ? (
            <div className="session-card">
              <p><strong>{getSubjectName(activeSession.subject_id, subjects)}</strong></p>
              <p>Started {new Date(activeSession.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              <p>Status: {activeSession.status}</p>
            </div>
          ) : (
            <p>No active session. Start a timer to recover it on refresh.</p>
          )}
        </div>
      </div>
    </section>
  );

  const renderPlanner = () => (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Planner</p>
        <h1>Plan the next block</h1>
      </div>
      <div className="split-layout">
        <div className="panel">
          <div className="panel-header">
            <h2>Goals</h2>
          </div>
          <div className="stack-form">
            {planner.goals.map((goal) => (
              <div className="goal-row" key={goal.id}>
                <input value={goal.text} onChange={(event) => setPlanner((current) => ({ ...current, goals: current.goals.map((item) => item.id === goal.id ? { ...item, text: event.target.value } : item) }))} />
                <input type="number" value={goal.target_seconds / 3600} step="0.5" min="1" onChange={(event) => setPlanner((current) => ({ ...current, goals: current.goals.map((item) => item.id === goal.id ? { ...item, target_seconds: Number(event.target.value) * 3600 } : item) }))} />
              </div>
            ))}
            <button className="ghost-button" type="button" onClick={() => setPlanner((current) => ({ ...current, goals: [...current.goals, { id: `g-${Date.now()}`, text: 'New goal', target_seconds: 3600, subject_id: selectedSubjectId }] }))}>Add goal</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Tasks</h2>
          </div>
          <div className="stack-form">
            {planner.tasks.map((task) => (
              <label className="task-row" key={task.id}>
                <input type="checkbox" checked={task.done} onChange={() => setPlanner((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item) }))} />
                <input value={task.text} onChange={(event) => setPlanner((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, text: event.target.value } : item) }))} />
              </label>
            ))}
            <button className="ghost-button" type="button" onClick={() => setPlanner((current) => ({ ...current, tasks: [...current.tasks, { id: `t-${Date.now()}`, text: 'New task', done: false, carried_over: false }] }))}>Add task</button>
          </div>
        </div>
      </div>
      <div className="footer-actions top-gap">
        <button type="button" className="ghost-button" onClick={() => alert('Carry-over action ready for API integration.')}>Carry over</button>
        <button type="button" className="primary-button" onClick={handlePlannerSave}>Save plan</button>
      </div>
    </section>
  );

  const renderStatistics = () => (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Statistics</p>
        <h1>Study patterns</h1>
      </div>
      <div className="split-layout">
        <div className="panel">
          <div className="panel-header">
            <h2>Heatmap</h2>
          </div>
          <div className="heatmap-grid">
            {heatmap.days.map((day) => (
              <div key={day.date} className="heat-cell" title={`${day.date}: ${formatSeconds(day.seconds)}`} style={{ opacity: 1 - Math.min(0.8, (day.seconds / heatmap.max_seconds) * 0.8) }}>
                <span>{day.seconds ? Math.round(day.seconds / 3600) : 0}h</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Progress</h2>
          </div>
          <div className="bar-chart">
            {stats.week.points.map((point) => (
              <div key={point.label} className="bar-item">
                <span className="bar" style={{ height: `${Math.max(10, (point.seconds / Math.max(...stats.week.points.map((entry) => entry.seconds), 1)) * 100)}%` }} />
                <small>{point.label}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel top-gap">
        <div className="panel-header">
          <h2>Subject breakdown</h2>
        </div>
        <div className="subject-breakdown">
          {stats.subjects.subjects.map((item) => (
            <div key={item.subject_id} className="breakdown-row">
              <div className="subject-name"><span className="swatch" style={{ background: item.color }} />{item.name}</div>
              <div className="progress-bar compact"><span style={{ width: `${item.percent}%` }} /></div>
              <strong>{formatSeconds(item.seconds)}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  const renderSettings = () => (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Settings</p>
        <h1>Control your profile</h1>
      </div>
      <div className="split-layout">
        <div className="panel">
          <div className="panel-header">
            <h2>Profile</h2>
          </div>
          <form className="stack-form">
            <label>
              <span>Username</span>
              <input value={user.username} onChange={(event) => setUser((current) => ({ ...current, username: event.target.value }))} />
            </label>
            <label>
              <span>Time zone</span>
              <input value={user.time_zone} onChange={(event) => setUser((current) => ({ ...current, time_zone: event.target.value }))} />
            </label>
            <label>
              <span>Category</span>
              <select value={user.category} onChange={(event) => setUser((current) => ({ ...current, category: event.target.value }))}>
                <option value="school">School</option>
                <option value="college">College</option>
                <option value="competitive_exams">Competitive exams</option>
                <option value="professional">Professional</option>
              </select>
            </label>
            <button type="button" className="primary-button">Save profile</button>
          </form>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Privacy + export</h2>
          </div>
          <div className="stack-form">
            <label>
              <span>Weekly time visibility</span>
              <select value={user.privacy?.weekly_time || 'friends'} onChange={(event) => setUser((current) => ({ ...current, privacy: { ...current.privacy, weekly_time: event.target.value } }))}>
                <option value="everyone">Everyone</option>
                <option value="friends">Friends</option>
                <option value="nobody">Nobody</option>
              </select>
            </label>
            <label>
              <span>Streak minimum</span>
              <input type="number" value={user.streak_minimum_minutes} onChange={(event) => setUser((current) => ({ ...current, streak_minimum_minutes: Number(event.target.value) }))} />
            </label>
            <button type="button" className="ghost-button" onClick={handleDownloadCsv}>Export CSV</button>
            <button type="button" className="ghost-button danger" onClick={handleLogout}>Log out</button>
          </div>
        </div>
      </div>
    </section>
  );

  const content = {
    dashboard: renderDashboard(),
    subjects: renderSubjects(),
    timer: renderTimer(),
    planner: renderPlanner(),
    statistics: renderStatistics(),
    settings: renderSettings(),
  };

  if (!isAuthenticated) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-header">
            <p className="eyebrow">Study Habit Tracker</p>
            <h1>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          </div>

          <div className="mode-toggle">
            <button type="button" className={authMode === 'login' ? 'primary-button' : 'ghost-button'} onClick={() => setAuthMode('login')}>Login</button>
            <button type="button" className={authMode === 'register' ? 'primary-button' : 'ghost-button'} onClick={() => setAuthMode('register')}>Register</button>
          </div>

          <form className="stack-form" onSubmit={handleAuthSubmit}>
            {authMode === 'register' ? (
              <label>
                <span>Username</span>
                <input name="username" type="text" placeholder="adi" />
              </label>
            ) : null}
            <label>
              <span>Email</span>
              <input name="email" type="email" placeholder="adi@example.com" />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" placeholder="••••••••" />
            </label>
            <button type="submit" className="primary-button">{authMode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="page-bg" />
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-block">
            <span className="brand-mark">S</span>
            <div>
              <p className="eyebrow">Tracker</p>
              <strong>Study Forge</strong>
            </div>
          </div>

          <nav className="main-nav" aria-label="Main navigation">
            {['dashboard', 'timer', 'planner', 'subjects', 'statistics', 'settings'].map((item) => (
              <button key={item} type="button" className={mode === item ? 'nav-button active' : 'nav-button'} onClick={() => setMode(item)}>
                {item}
              </button>
            ))}
          </nav>

          <div className="user-block">
            <span>{user.username}</span>
            <button type="button" className="ghost-button" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>

      <main className="app-content">{content[mode]}</main>
    </div>
  );
}

export default App;
