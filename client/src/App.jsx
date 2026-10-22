import { useEffect, useMemo, useState } from 'react';

const CURRENT_YEAR = new Date().getFullYear();

const emptyPlanner = {
  date: '',
  goals: [],
  tasks: [],
  reflection: '',
  review: { total_seconds: 0, goals_met: 0, goals_total: 0, tasks_done: 0, tasks_total: 0 },
};
const emptyStats = {
  range: 'week',
  points: [],
  total_seconds: 0,
  daily_average_seconds: 0,
  subjects: [],
};

const localDate = (date, timeZone = 'UTC') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const nextDate = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
};

const localDateAt = (timestamp, timeZone) => localDate(new Date(timestamp), timeZone);
const daysInYear = (year) => (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365);
const dateAtYearDay = (year, dayIndex) =>
  new Date(Date.UTC(year, 0, dayIndex + 1)).toISOString().slice(0, 10);

const formatSeconds = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const toClock = (seconds) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = String(Math.floor(safe / 3600)).padStart(2, '0');
  const mins = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const secs = String(safe % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
};

const normalizeList = (value) => {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  if (value && Array.isArray(value.results)) return value.results;
  if (value && Array.isArray(value.subjects)) return value.subjects;
  if (value && Array.isArray(value.goals)) return value.goals;
  if (value && Array.isArray(value.tasks)) return value.tasks;
  if (value && Array.isArray(value.days)) return value.days;
  if (value && Array.isArray(value.points)) return value.points;
  return [];
};

const normalizeSession = (value) => {
  if (!value) return null;
  if (Object.hasOwn(value, 'session')) return value.session;
  return value;
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
    const requestError = new Error(error.message || 'Request failed');
    requestError.status = response.status;
    requestError.code = error.code;
    requestError.details = error;
    throw requestError;
  }

  return data;
};

function App() {
  const [user, setUser] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [planner, setPlanner] = useState(emptyPlanner);
  const [heatmap, setHeatmap] = useState(() => ({ year: CURRENT_YEAR, days: [], max_seconds: 0 }));
  const [stats, setStats] = useState(emptyStats);
  const [authMode, setAuthMode] = useState('login');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loadErrors, setLoadErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [xp, setXp] = useState(null);
  const [streak, setStreak] = useState(null);
  const [goals, setGoals] = useState(null);
  const [exams, setExams] = useState([]);
  const [insights, setInsights] = useState([]);
  const [syllabus, setSyllabus] = useState(null);
  const [syllabusSubjectId, setSyllabusSubjectId] = useState('');
  const [selectedRange, setSelectedRange] = useState('week');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [mode, setMode] = useState('dashboard');
  const [sessionNote, setSessionNote] = useState('');
  const [timerMode, setTimerMode] = useState('stopwatch');
  const [countdownMinutes, setCountdownMinutes] = useState(25);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let active = true;
    request('/api/me')
      .then((profile) => {
        if (!active) return;
        setUser(profile);
        setIsAuthenticated(true);
      })
      .catch((error) => {
        if (active && error.status !== 401) setLoadErrors((current) => ({ ...current, auth: error.message }));
      })
      .finally(() => {
        if (active) setCheckingAuth(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) return undefined;
    let active = true;
    const load = async (key, path, update) => {
      try {
        const value = await request(path);
        if (!active) return;
        update(value);
        setLoadErrors((current) => ({ ...current, [key]: undefined }));
      } catch (error) {
        if (active) setLoadErrors((current) => ({ ...current, [key]: error.message }));
      }
    };
    const today = localDate(new Date(), user.time_zone);
    Promise.all([
      load('subjects', '/api/subjects', (value) => {
        const list = normalizeList(value);
        setSubjects(list);
        setSelectedSubjectId((current) => list.some((subject) => subject.id === current) ? current : list[0]?.id || '');
      }),
      load('activeSession', '/api/sessions/active', (value) => setActiveSession(normalizeSession(value))),
      load('planner', `/api/planner/${today}`, (value) => setPlanner({ ...emptyPlanner, ...value, goals: normalizeList(value.goals), tasks: normalizeList(value.tasks) })),
      load('xp', '/api/me/xp', setXp),
      load('streak', '/api/me/streak', setStreak),
      load('goals', '/api/me/goals', setGoals),
      load('exams', '/api/exams', (value) => setExams(normalizeList(value))),
      load('insights', '/api/stats/insights', (value) => setInsights(normalizeList(value))),
    ]);
    return () => { active = false; };
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!isAuthenticated || !user) return undefined;
    let active = true;
    Promise.all([
      request(`/api/stats/progress?range=${selectedRange}`),
      request(`/api/stats/subjects?range=${selectedRange}`),
    ]).then(([progress, subjectBreakdown]) => {
      if (active) setStats({ ...emptyStats, ...progress, subjects: normalizeList(subjectBreakdown.subjects) });
    }).catch((error) => {
      if (active) setLoadErrors((current) => ({ ...current, statistics: error.message }));
    });
    return () => { active = false; };
  }, [isAuthenticated, selectedRange, user]);

  useEffect(() => {
    if (!isAuthenticated || !user) return undefined;
    let active = true;
    const year = localDate(new Date(), user.time_zone).slice(0, 4);
    request(`/api/stats/heatmap?year=${year}`)
      .then((data) => {
        if (active) setHeatmap({ ...data, days: normalizeList(data.days) });
      })
      .catch((error) => {
        if (active) setLoadErrors((current) => ({ ...current, heatmap: error.message }));
      });
    return () => { active = false; };
  }, [isAuthenticated, user]);

  const todaySeconds = goals?.today_seconds ?? 0;

  const trackedTime = useMemo(() => {
    if (!activeSession?.started_at) return 0;
    const start = new Date(activeSession.started_at).getTime();
    const segmentStart = new Date(activeSession.segment_started_at || activeSession.started_at).getTime();
    const end = activeSession.status === 'running' ? nowMs : segmentStart;
    const currentBreak = activeSession.status === 'on_break' ? Math.floor((nowMs - segmentStart) / 1000) : 0;
    return Math.max(0, Math.floor((end - start) / 1000) - (activeSession.paused_seconds || 0) - (activeSession.break_seconds || 0) - currentBreak);
  }, [activeSession, nowMs]);

  const timerDisplay = timerMode === 'countdown'
    ? toClock(Math.max(0, countdownMinutes * 60 - trackedTime))
    : toClock(trackedTime);

  const refreshProgress = async () => {
    const today = localDateAt(Date.now(), user.time_zone);
    const year = today.slice(0, 4);
    const [updatedXp, updatedStreak, updatedGoals, progress, subjectStats, heatmapData, plannerData] = await Promise.all([
      request('/api/me/xp'),
      request('/api/me/streak'),
      request('/api/me/goals'),
      request(`/api/stats/progress?range=${selectedRange}`),
      request(`/api/stats/subjects?range=${selectedRange}`),
      request(`/api/stats/heatmap?year=${year}`),
      request(`/api/planner/${today}`),
    ]);
    setXp(updatedXp);
    setStreak(updatedStreak);
    setGoals(updatedGoals);
    setStats({ ...emptyStats, ...progress, subjects: normalizeList(subjectStats.subjects) });
    setHeatmap({ ...heatmapData, days: normalizeList(heatmapData.days) });
    setPlanner({ ...emptyPlanner, ...plannerData, goals: normalizeList(plannerData.goals), tasks: normalizeList(plannerData.tasks) });
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      email: formData.get('email'),
      password: formData.get('password'),
      username: formData.get('username') || undefined,
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      category: formData.get('category') || 'college',
    };

    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await request(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUser(response);
      setFormError('');
      setLoadErrors({});
      setIsAuthenticated(true);
      setMode('dashboard');
      form.reset();
    } catch (error) {
      setFormError(error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      setLoadErrors((current) => ({ ...current, logout: error.message }));
    }
    setIsAuthenticated(false);
    setUser(null);
    setMode('login');
  };

  const handleTimerAction = async (action) => {
    try {
      if (action === 'start') {
        const started = await request('/api/sessions/start', {
          method: 'POST',
          body: JSON.stringify({ subject_id: selectedSubjectId }),
        });
        setActiveSession(started);
        return;
      }
      if (!activeSession?.id) return;
      const response = await request(`/api/sessions/${activeSession.id}/${action}`, {
        method: 'POST',
        ...(action === 'stop' ? { body: JSON.stringify({ note: sessionNote || undefined }) } : {}),
      });
      setActiveSession(action === 'stop' ? null : response.session || response || null);
      if (action === 'stop') {
        await refreshProgress();
        setSessionNote('');
      }
      setLoadErrors((current) => ({ ...current, timer: undefined }));
    } catch (error) {
      if (error.code === 'SESSION_ALREADY_OPEN' && error.details?.open_session) {
        setActiveSession(error.details.open_session);
      }
      setLoadErrors((current) => ({ ...current, timer: error.message }));
    }
  };

  const handleManualSession = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request('/api/sessions/manual', {
        method: 'POST',
        body: JSON.stringify({
          subject_id: data.get('subject_id'),
          started_at: new Date(data.get('started_at')).toISOString(),
          ended_at: new Date(data.get('ended_at')).toISOString(),
          note: data.get('note') || undefined,
        }),
      });
      form.reset();
      setSuccessMessage('Manual session saved. It does not award XP.');
      await refreshProgress();
    } catch (error) {
      setLoadErrors((current) => ({ ...current, timer: error.message }));
    }
  };

  const handleSubjectSave = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    const color = String(formData.get('color') || '#0a0a0a');
    if (!name) return;

    try {
      const created = await request('/api/subjects', {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      });
      setSubjects((current) => [...current, created]);
      setSelectedSubjectId((current) => current || created.id);
      form.reset();
    } catch (error) {
      setLoadErrors((current) => ({ ...current, subjects: error.message }));
    }
  };

  const handlePlannerSave = async () => {
    try {
      const payload = {
        goals: planner.goals.map((goal) => ({
          ...(goal.id && !String(goal.id).startsWith('new-') ? { id: goal.id } : {}),
          text: goal.text,
          target_seconds: goal.target_seconds,
          subject_id: goal.subject_id,
        })),
        tasks: planner.tasks.map((task) => ({
          ...(task.id && !String(task.id).startsWith('new-') ? { id: task.id } : {}),
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
      setLoadErrors((current) => ({ ...current, planner: undefined }));
      setSuccessMessage('Plan saved.');
    } catch (error) {
      setLoadErrors((current) => ({ ...current, planner: error.message }));
    }
  };

  const handlePlannerCarryOver = async () => {
    try {
      const result = await request(`/api/planner/${planner.date}/carry-over`, { method: 'POST' });
      const tomorrow = nextDate(planner.date);
      const nextPlanner = await request(`/api/planner/${tomorrow}`);
      setPlanner({ ...emptyPlanner, ...nextPlanner, goals: normalizeList(nextPlanner.goals), tasks: normalizeList(nextPlanner.tasks) });
      setSuccessMessage(`${result.carried} unfinished task${result.carried === 1 ? '' : 's'} carried to tomorrow.`);
    } catch (error) {
      setLoadErrors((current) => ({ ...current, planner: error.message }));
    }
  };

  const handleDownloadCsv = async () => {
    try {
      const response = await fetch('/api/me/export.csv', { credentials: 'include' });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error?.message || 'CSV export failed');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'study-sessions.csv';
      link.click();
      window.URL.revokeObjectURL(url);
      setSuccessMessage('CSV export downloaded.');
    } catch (error) {
      setLoadErrors((current) => ({ ...current, export: error.message }));
    }
  };

  const handleSubjectEdit = async (subject) => {
    const name = window.prompt('Subject name', subject.name)?.trim();
    const color = window.prompt('Subject color (hex)', subject.color)?.trim();
    if (!name || !color || (name === subject.name && color === subject.color)) return;
    try {
      const updated = await request(`/api/subjects/${subject.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, color }),
      });
      setSubjects((current) => current.map((item) => item.id === subject.id ? updated : item));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, subjects: error.message }));
    }
  };

  const handleSubjectDelete = async (subject) => {
    if (!window.confirm(`Delete ${subject.name}? Its sessions, syllabus, and exams will also be deleted.`)) return;
    try {
      await request(`/api/subjects/${subject.id}`, { method: 'DELETE' });
      setSubjects((current) => current.filter((item) => item.id !== subject.id));
      setExams((current) => current.filter((exam) => exam.subject_id !== subject.id));
      if (selectedSubjectId === subject.id) setSelectedSubjectId('');
    } catch (error) {
      setLoadErrors((current) => ({ ...current, subjects: error.message }));
    }
  };

  const handleSettingsSave = async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const profile = {
      username: values.get('username'),
      time_zone: values.get('time_zone'),
      category: values.get('category'),
      leaderboard_hidden: values.get('leaderboard_hidden') === 'on',
      privacy: {
        weekly_time: values.get('weekly_time'),
        subjects: values.get('subjects'),
      },
    };
    const targetGoals = {
      daily_target_seconds: Number(values.get('daily_hours')) * 3600,
      weekly_target_seconds: Number(values.get('weekly_hours')) * 3600,
      streak_minimum_minutes: Number(values.get('streak_minimum_minutes')),
    };
    try {
      new Intl.DateTimeFormat('en', { timeZone: profile.time_zone }).format();
      const updatedUser = await request('/api/me', {
        method: 'PATCH',
        body: JSON.stringify(profile),
      });
      setUser(updatedUser);
      const updatedGoals = await request('/api/me/goals', {
        method: 'PUT',
        body: JSON.stringify(targetGoals),
      });
      setGoals(updatedGoals);
      setSuccessMessage('Settings saved.');
    } catch (error) {
      setLoadErrors((current) => ({ ...current, settings: error.message }));
    }
  };

  const handleAccountDelete = async () => {
    const password = window.prompt('Enter your password to permanently delete your account and data.');
    if (!password) return;
    try {
      await request('/api/me', { method: 'DELETE', body: JSON.stringify({ password }) });
      setIsAuthenticated(false);
      setUser(null);
      setMode('dashboard');
    } catch (error) {
      setLoadErrors((current) => ({ ...current, settings: error.message }));
    }
  };

  const loadSyllabus = async (subjectId) => {
    setSyllabusSubjectId(subjectId);
    if (!subjectId) {
      setSyllabus(null);
      return;
    }
    try {
      setSyllabus(await request(`/api/subjects/${subjectId}/syllabus`));
      setLoadErrors((current) => ({ ...current, syllabus: undefined }));
    } catch (error) {
      setSyllabus(null);
      setLoadErrors((current) => ({ ...current, syllabus: error.message }));
    }
  };

  const handleTopicAdd = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get('title') || '').trim();
    try {
      await request('/api/topics', {
        method: 'POST',
        body: JSON.stringify({ subject_id: syllabusSubjectId, parent_id: null, title }),
      });
      form.reset();
      await loadSyllabus(syllabusSubjectId);
    } catch (error) {
      setLoadErrors((current) => ({ ...current, syllabus: error.message }));
    }
  };

  const handleTopicStatus = async (topicId, status) => {
    try {
      const result = await request(`/api/topics/${topicId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadSyllabus(syllabusSubjectId);
      if (result.xp_awarded) setXp(await request('/api/me/xp'));
      setSuccessMessage(result.xp_awarded ? 'Topic completed. 20 XP awarded.' : '');
    } catch (error) {
      setLoadErrors((current) => ({ ...current, syllabus: error.message }));
    }
  };

  const handleSyllabusImport = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const result = await request(`/api/subjects/${syllabusSubjectId}/syllabus/import`, {
        method: 'POST',
        body: JSON.stringify({ text: new FormData(form).get('topics') }),
      });
      form.reset();
      await loadSyllabus(syllabusSubjectId);
      setSuccessMessage(`${result.created} topics imported.`);
    } catch (error) {
      setLoadErrors((current) => ({ ...current, syllabus: error.message }));
    }
  };

  const handleExamAdd = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const payload = {
      subject_id: values.get('subject_id'),
      date: values.get('date'),
      target_hours: values.get('target_hours') ? Number(values.get('target_hours')) : undefined,
    };
    try {
      const exam = await request('/api/exams', { method: 'POST', body: JSON.stringify(payload) });
      setExams((current) => [...current, exam].sort((a, b) => a.date.localeCompare(b.date)));
      form.reset();
      setLoadErrors((current) => ({ ...current, exams: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, exams: error.message }));
    }
  };

  const handleExamDelete = async (exam) => {
    if (!window.confirm(`Remove the ${getSubjectName(exam.subject_id, subjects)} exam?`)) return;
    try {
      await request(`/api/exams/${exam.id}`, { method: 'DELETE' });
      setExams((current) => current.filter((item) => item.id !== exam.id));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, exams: error.message }));
    }
  };

  const handleExamEdit = async (exam) => {
    const date = window.prompt('Exam date (YYYY-MM-DD)', exam.date)?.trim();
    if (!date) return;
    const targetText = window.prompt('Target study hours (leave blank for no target)', exam.target_hours ?? '')?.trim();
    if (targetText === undefined) return;
    const targetHours = Number(targetText);
    if (targetText && (!Number.isFinite(targetHours) || targetHours <= 0)) {
      setLoadErrors((current) => ({ ...current, exams: 'Target hours must be a positive number.' }));
      return;
    }
    try {
      const updated = await request(`/api/exams/${exam.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ date, ...(targetText ? { target_hours: targetHours } : {}) }),
      });
      setExams((current) => current.map((item) => item.id === exam.id ? updated : item).sort((a, b) => a.date.localeCompare(b.date)));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, exams: error.message }));
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
                <span>{task.text}</span>
                <input type="checkbox" checked={task.done} readOnly />
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

  const renderSubjects = () => (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Subjects</p>
        <h1>Track each focus area</h1>
      </div>
      {loadErrors.subjects ? <p role="alert" className="error-message">{loadErrors.subjects}</p> : null}
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
                  <button type="button" className="ghost-button" onClick={() => handleSubjectEdit(subject)}>Edit</button>
                  <button type="button" className="ghost-button danger" onClick={() => handleSubjectDelete(subject)}>Delete</button>
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
      {loadErrors.timer ? <p role="alert" className="error-message">{loadErrors.timer}</p> : null}
      {successMessage ? <p className="success-message" role="status">{successMessage}</p> : null}
      <div className="split-layout">
        <div className="panel timer-panel">
          <div className="button-row" role="group" aria-label="Timer mode">
            <button type="button" className={timerMode === 'stopwatch' ? 'primary-button' : 'ghost-button'} onClick={() => setTimerMode('stopwatch')}>Stopwatch</button>
            <button type="button" className={timerMode === 'countdown' ? 'primary-button' : 'ghost-button'} onClick={() => setTimerMode('countdown')}>Countdown</button>
          </div>
          {timerMode === 'countdown' && !activeSession ? (
            <label>
              <span>Countdown length (minutes)</span>
              <input type="number" min="1" max="720" value={countdownMinutes} onChange={(event) => setCountdownMinutes(Number(event.target.value))} />
            </label>
          ) : null}
          <div className="timer-display" aria-live="polite">{timerDisplay}</div>
          <div className="subject-select">
            <label>
              <span>Subject</span>
              <select value={selectedSubjectId} disabled={Boolean(activeSession)} onChange={(event) => setSelectedSubjectId(event.target.value)}>
                <option value="" disabled>Select a subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="button-row">
            {!activeSession || activeSession.status === 'ended' ? (
              <button type="button" className="primary-button" disabled={!selectedSubjectId} onClick={() => handleTimerAction('start')}>Start timer</button>
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
      {loadErrors.planner ? <p className="error-message" role="alert">{loadErrors.planner}</p> : null}
      {successMessage ? <p className="success-message" role="status">{successMessage}</p> : null}
      <div className="split-layout">
        <div className="panel">
          <div className="panel-header">
            <h2>Goals</h2>
          </div>
          <div className="stack-form">
            {planner.goals.map((goal) => (
              <div className="goal-row" key={goal.id}>
                <input aria-label="Goal" required maxLength="200" value={goal.text} onChange={(event) => setPlanner((current) => ({ ...current, goals: current.goals.map((item) => item.id === goal.id ? { ...item, text: event.target.value } : item) }))} />
                <input aria-label="Goal target hours" type="number" value={goal.target_seconds / 3600} step="0.5" min="0" onChange={(event) => setPlanner((current) => ({ ...current, goals: current.goals.map((item) => item.id === goal.id ? { ...item, target_seconds: Math.round(Number(event.target.value) * 3600) } : item) }))} />
                <select aria-label="Goal subject" value={goal.subject_id || ''} onChange={(event) => setPlanner((current) => ({ ...current, goals: current.goals.map((item) => item.id === goal.id ? { ...item, subject_id: event.target.value || null } : item) }))}>
                  <option value="">All subjects</option>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
                <button type="button" className="ghost-button danger" aria-label={`Remove goal ${goal.text || ''}`} disabled={planner.goals.length === 1} onClick={() => setPlanner((current) => ({ ...current, goals: current.goals.filter((item) => item.id !== goal.id) }))}>Remove</button>
              </div>
            ))}
            <button className="ghost-button" type="button" disabled={planner.goals.length >= 3} onClick={() => setPlanner((current) => ({ ...current, goals: [...current.goals, { id: `new-goal-${Date.now()}`, text: '', target_seconds: 3600, subject_id: null }] }))}>Add goal ({planner.goals.length}/3)</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Tasks</h2>
          </div>
          <div className="stack-form">
            {planner.tasks.map((task) => (
              <label className="task-row" key={task.id}>
                <input aria-label={`Complete ${task.text || 'task'}`} type="checkbox" checked={task.done} onChange={() => setPlanner((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item) }))} />
                <input aria-label="Task" required maxLength="200" value={task.text} onChange={(event) => setPlanner((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, text: event.target.value } : item) }))} />
                <button type="button" className="ghost-button danger" aria-label={`Remove task ${task.text || ''}`} onClick={() => setPlanner((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== task.id) }))}>Remove</button>
              </label>
            ))}
            <button className="ghost-button" type="button" onClick={() => setPlanner((current) => ({ ...current, tasks: [...current.tasks, { id: `new-task-${Date.now()}`, text: '', done: false, carried_over: false }] }))}>Add task</button>
          </div>
        </div>
      </div>
      <div className="panel top-gap">
        <label>
          <span>End-of-day reflection (optional)</span>
          <textarea rows="3" maxLength="500" value={planner.reflection || ''} onChange={(event) => setPlanner((current) => ({ ...current, reflection: event.target.value }))} />
        </label>
        <p className="review-summary">
          Today: {formatSeconds(planner.review?.total_seconds || 0)} studied · {planner.review?.goals_met || 0}/{planner.review?.goals_total || 0} goals met · {planner.review?.tasks_done || 0}/{planner.review?.tasks_total || 0} tasks done
        </p>
      </div>
      <div className="footer-actions top-gap">
        <button type="button" className="ghost-button" onClick={handlePlannerCarryOver}>Carry unfinished tasks to tomorrow</button>
        <button type="button" className="primary-button" onClick={handlePlannerSave}>Save plan</button>
      </div>
      <form className="panel stack-form top-gap" onSubmit={handleManualSession}>
        <h2>Log a forgotten session</h2>
        <label><span>Subject</span>
          <select name="subject_id" required defaultValue="">
            <option value="" disabled>Select a subject</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </label>
        <label><span>Started at</span><input name="started_at" type="datetime-local" required /></label>
        <label><span>Ended at</span><input name="ended_at" type="datetime-local" required /></label>
        <label><span>Note (optional)</span><input name="note" maxLength="200" /></label>
        <button type="submit" className="ghost-button">Save manual session</button>
      </form>
    </section>
  );

  const renderStatistics = () => (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Statistics</p>
        <h1>Study patterns</h1>
        <label className="range-control">
          <span>Study period</span>
          <select value={selectedRange} onChange={(event) => setSelectedRange(event.target.value)}>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
            <option value="year">Last 12 months</option>
          </select>
        </label>
      </div>
      {loadErrors.statistics || loadErrors.heatmap ? <p className="error-message" role="alert">{loadErrors.statistics || loadErrors.heatmap}</p> : null}
      <div className="split-layout">
        <div className="panel">
          <div className="panel-header">
            <div><h2>Study calendar</h2><p>{heatmap.year}</p></div>
            <label>
              <span className="sr-only">Heatmap year</span>
              <select value={heatmap.year} onChange={async (event) => {
                const year = event.target.value;
                try {
                  const data = await request(`/api/stats/heatmap?year=${year}`);
                  setHeatmap({ ...data, days: normalizeList(data.days) });
                } catch (error) {
                  setLoadErrors((current) => ({ ...current, heatmap: error.message }));
                }
              }}>
                {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
          </div>
          <div className="heatmap-grid">
            {Array.from({ length: daysInYear(heatmap.year) }, (_, index) => {
              const date = dateAtYearDay(heatmap.year, index);
              const day = heatmap.days.find((item) => item.date === date);
              const seconds = day?.seconds || 0;
              const intensity = heatmap.max_seconds ? seconds / heatmap.max_seconds : 0;
              return (
                <div
                  key={date}
                  className="heat-cell"
                  role="img"
                  title={`${date}: ${formatSeconds(seconds)}`}
                  aria-label={`${date}: ${formatSeconds(seconds)}`}
                  style={{ backgroundColor: `rgba(10, 10, 10, ${seconds ? 0.12 + intensity * 0.68 : 0.04})` }}
                >
                  <span>{seconds ? `${Math.round(seconds / 3600)}h` : '0'}</span>
                </div>
              );
            })}
          </div>
          <p>Each day shows its logged study hours; color is an additional cue.</p>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div><h2>Study time</h2><p>{formatSeconds(stats.total_seconds || 0)} total · {formatSeconds(stats.daily_average_seconds || 0)} average/{selectedRange === 'year' ? 'month' : 'day'}</p></div>
          </div>
          <div className={`bar-chart ${selectedRange === 'year' ? 'year-chart' : ''}`}>
            {stats.points.map((point) => (
              <div key={point.label} className="bar-item" title={`${point.label}: ${formatSeconds(point.seconds)}`}>
                <span className="bar-value">{selectedRange === 'year' ? formatSeconds(point.seconds) : `${Math.round(point.seconds / 3600)}h`}</span>
                <span className="bar" style={{ height: `${Math.max(2, (point.seconds / Math.max(...stats.points.map((entry) => entry.seconds), 1)) * 100)}%` }} />
                <small>{selectedRange === 'week' ? new Date(`${point.label}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }) : point.label}</small>
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
          {stats.subjects.map((item) => (
            <div key={item.subject_id} className="breakdown-row">
              <div className="subject-name"><span className="swatch" style={{ background: item.color }} />{item.name}</div>
              <div className="progress-bar compact"><span style={{ width: `${item.percent}%`, background: item.color }} /></div>
              <strong>{formatSeconds(item.seconds)}</strong>
              <span>{item.percent}%</span>
            </div>
          ))}
          {stats.subjects.length === 0 ? <p>No subject study data for this period.</p> : null}
        </div>
      </div>
    </section>
  );

  const renderTopic = (topic) => (
    <li key={topic.id} className="syllabus-topic">
      <div className="syllabus-topic-row">
        <span>{topic.title}</span>
        <select aria-label={`Status for ${topic.title}`} value={topic.status} onChange={(event) => handleTopicStatus(topic.id, event.target.value)}>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>
      </div>
      {topic.children?.length ? <ul>{topic.children.map((child) => renderTopic(child))}</ul> : null}
    </li>
  );

  const renderSyllabus = () => (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Progress</p>
        <h1>Syllabus</h1>
        <p>Organize a subject into topics and keep completion status up to date.</p>
      </div>
      {loadErrors.syllabus ? <p className="error-message" role="alert">{loadErrors.syllabus}</p> : null}
      <div className="panel">
        <label className="subject-select">
          <span>Subject</span>
          <select value={syllabusSubjectId} onChange={(event) => loadSyllabus(event.target.value)}>
            <option value="">Select a subject</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </label>
        {syllabus ? (
          <>
            <div className="top-gap">
              <div className="meta-row"><span>{syllabus.topics_done} of {syllabus.topics_total} topics complete</span><strong>{syllabus.completion_percent}%</strong></div>
              <div className="progress-bar" role="progressbar" aria-label="Syllabus completion" aria-valuenow={syllabus.completion_percent} aria-valuemin="0" aria-valuemax="100">
                <span style={{ width: `${syllabus.completion_percent}%` }} />
              </div>
            </div>
            {syllabus.topics.length ? <ul className="syllabus-tree">{syllabus.topics.map((topic) => renderTopic(topic))}</ul> : <p>No topics yet. Add one or import a list.</p>}
          </>
        ) : syllabusSubjectId ? <p>Loading syllabus…</p> : <p>Select a subject to view its syllabus.</p>}
      </div>
      {syllabusSubjectId ? (
        <div className="split-layout top-gap">
          <form className="panel stack-form" onSubmit={handleTopicAdd}>
            <h2>Add a topic</h2>
            <label><span>Topic title</span><input name="title" required maxLength="200" /></label>
            <button type="submit" className="primary-button">Add topic</button>
          </form>
          <form className="panel stack-form" onSubmit={handleSyllabusImport}>
            <h2>Import a topic list</h2>
            <label><span>Use one topic per line. Indent child topics with two spaces or a tab.</span><textarea name="topics" rows="5" required /></label>
            <button type="submit" className="ghost-button">Import topics</button>
          </form>
        </div>
      ) : null}
    </section>
  );

  const renderExams = () => (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Progress</p>
        <h1>Exam countdown</h1>
        <p>Track your next exams, logged preparation time, and daily hours needed.</p>
      </div>
      {loadErrors.exams ? <p className="error-message" role="alert">{loadErrors.exams}</p> : null}
      <div className="split-layout">
        {exams.length ? exams.map((exam) => (
          <article className="panel exam-card" key={exam.id}>
            <div className="panel-header">
              <div><p className="eyebrow">{getSubjectName(exam.subject_id, subjects)}</p><h2>{exam.days_left === 0 ? 'Exam today' : `${exam.days_left} days left`}</h2></div>
              <button type="button" className="ghost-button" onClick={() => handleExamEdit(exam)}>Edit</button>
              <button type="button" className="ghost-button danger" onClick={() => handleExamDelete(exam)}>Remove</button>
            </div>
            <p>Exam date: <time dateTime={exam.date}>{exam.date}</time></p>
            <p>{exam.logged_hours} study hours logged since adding the exam.</p>
            {exam.target_hours != null ? (
              <>
                <div className="meta-row"><span>Target: {exam.target_hours} hours</span><span>{exam.target_hours ? Math.min(100, Math.round(exam.logged_hours / exam.target_hours * 100)) : 100}%</span></div>
                <div className="progress-bar"><span style={{ width: `${exam.target_hours ? Math.min(100, exam.logged_hours / exam.target_hours * 100) : 100}%` }} /></div>
                <p>{exam.hours_needed_per_day == null ? 'Daily target reached.' : `${exam.hours_needed_per_day} hours needed per day`}</p>
              </>
            ) : <p>No preparation-hour target set.</p>}
          </article>
        )) : <div className="panel"><p>No upcoming exams. Add one to see its countdown here.</p></div>}
      </div>
      <form className="panel stack-form top-gap" onSubmit={handleExamAdd}>
        <h2>Add an exam</h2>
        <label><span>Subject</span>
          <select name="subject_id" required defaultValue="">
            <option value="" disabled>Select a subject</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </label>
        <label><span>Exam date</span><input type="date" name="date" required min={localDateAt(nowMs, user?.time_zone)} /></label>
        <label><span>Target study hours (optional)</span><input type="number" name="target_hours" min="0.5" step="0.5" /></label>
        <button type="submit" className="primary-button">Add exam</button>
      </form>
    </section>
  );

  const renderInsights = () => (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Progress</p>
        <h1>Study insights</h1>
        <p>Rule-based summaries from your study history. Each insight includes the numbers behind it.</p>
      </div>
      {loadErrors.insights ? <p className="error-message" role="alert">{loadErrors.insights}</p> : null}
      {insights.length ? (
        <div className="split-layout">
          {insights.map((insight, index) => (
            <article className="panel insight-card" key={`${insight.kind}-${index}`}>
              <p className="eyebrow">{String(insight.kind || 'insight').replaceAll('_', ' ')}</p>
              <h2>{insight.text}</h2>
              {insight.numbers ? (
                <dl>
                  {Object.entries(insight.numbers).map(([key, value]) => (
                    <div className="insight-number" key={key}>
                      <dt>{key.replaceAll('_', ' ')}</dt>
                      <dd>{key.endsWith('_seconds') ? formatSeconds(value) : value}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p>No supporting figures were returned for this insight.</p>}
            </article>
          ))}
        </div>
      ) : loadErrors.insights ? null : <div className="panel"><p>No insights available yet. Log study sessions and plan goals to build a weekly summary.</p></div>}
    </section>
  );

  const renderWeeklyGoals = () => {
    const dailyPercent = goals?.daily_target_seconds ? Math.min(100, Math.round(goals.today_seconds / goals.daily_target_seconds * 100)) : 0;
    const weeklyPercent = goals?.weekly_target_seconds ? Math.min(100, Math.round(goals.week_seconds / goals.weekly_target_seconds * 100)) : 0;
    return (
      <section className="page-shell">
        <div className="section-heading">
          <p className="eyebrow">Progress</p>
          <h1>Weekly goals</h1>
          <p>Progress is calculated from study time recorded in your local time zone.</p>
        </div>
        {loadErrors.goals ? <p className="error-message" role="alert">{loadErrors.goals}</p> : null}
        <div className="split-layout">
          <article className="panel">
            <div className="panel-header"><h2>This week</h2><strong>{weeklyPercent}%</strong></div>
            <div className="progress-bar" role="progressbar" aria-label="Weekly goal progress" aria-valuenow={weeklyPercent} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${weeklyPercent}%` }} /></div>
            <p>{formatSeconds(goals?.week_seconds || 0)} of {formatSeconds(goals?.weekly_target_seconds || 0)}</p>
          </article>
          <article className="panel">
            <div className="panel-header"><h2>Today</h2><strong>{dailyPercent}%</strong></div>
            <div className="progress-bar" role="progressbar" aria-label="Daily goal progress" aria-valuenow={dailyPercent} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${dailyPercent}%` }} /></div>
            <p>{formatSeconds(goals?.today_seconds || 0)} of {formatSeconds(goals?.daily_target_seconds || 0)}</p>
          </article>
        </div>
      </section>
    );
  };

  const renderSettings = () => (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Settings</p>
        <h1>Control your profile</h1>
      </div>
      {loadErrors.settings || loadErrors.export ? <p className="error-message" role="alert">{loadErrors.settings || loadErrors.export}</p> : null}
      {successMessage ? <p className="success-message" role="status">{successMessage}</p> : null}
      <form className="stack-form" onSubmit={handleSettingsSave}>
        <div className="split-layout">
          <div className="panel stack-form">
            <h2>Profile and goals</h2>
            <label><span>Username</span><input name="username" defaultValue={user.username} minLength="3" maxLength="20" required /></label>
            <label><span>Time zone (IANA)</span><input name="time_zone" defaultValue={user.time_zone} required /></label>
            <label><span>Category</span>
              <select name="category" defaultValue={user.category}>
                <option value="school">School</option>
                <option value="college">College</option>
                <option value="competitive_exams">Competitive exams</option>
                <option value="professional">Professional</option>
              </select>
            </label>
            <label><span>Daily target (hours)</span><input name="daily_hours" type="number" min="0" step="0.5" defaultValue={(goals?.daily_target_seconds ?? user.daily_target_seconds ?? 0) / 3600} required /></label>
            <label><span>Weekly target (hours)</span><input name="weekly_hours" type="number" min="0" step="0.5" defaultValue={(goals?.weekly_target_seconds ?? user.weekly_target_seconds ?? 0) / 3600} required /></label>
            <label><span>Streak minimum (minutes)</span><input name="streak_minimum_minutes" type="number" min="1" defaultValue={goals?.streak_minimum_minutes ?? user.streak_minimum_minutes ?? 15} required /></label>
          </div>
          <div className="panel stack-form">
            <h2>Privacy and account</h2>
            <label><span>Weekly time visibility</span>
              <select name="weekly_time" defaultValue={user.privacy?.weekly_time || 'friends'}>
                <option value="everyone">Everyone</option><option value="friends">Friends</option><option value="nobody">Nobody</option>
              </select>
            </label>
            <label><span>Subject visibility</span>
              <select name="subjects" defaultValue={user.privacy?.subjects || 'friends'}>
                <option value="everyone">Everyone</option><option value="friends">Friends</option><option value="nobody">Nobody</option>
              </select>
            </label>
            <label className="inline-setting"><input type="checkbox" name="leaderboard_hidden" defaultChecked={user.leaderboard_hidden} /><span>Hide my profile from leaderboards</span></label>
            <button type="button" className="ghost-button" onClick={handleDownloadCsv}>Download session CSV</button>
            <button type="button" className="ghost-button danger" onClick={handleAccountDelete}>Delete account and data</button>
            <button type="button" className="ghost-button" onClick={handleLogout}>Log out</button>
          </div>
        </div>
        <div className="footer-actions"><button type="submit" className="primary-button">Save settings</button></div>
      </form>
    </section>
  );

  if (checkingAuth) {
    return <main className="auth-shell" aria-live="polite">Checking your session…</main>;
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-header">
            <p className="eyebrow">Study Habit Tracker</p>
            <h1>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          </div>
          {loadErrors.auth ? <p className="error-message" role="alert">{loadErrors.auth}</p> : null}
          {formError ? <p className="error-message" role="alert">{formError}</p> : null}

          <div className="mode-toggle">
            <button type="button" className={authMode === 'login' ? 'primary-button' : 'ghost-button'} onClick={() => setAuthMode('login')}>Login</button>
            <button type="button" className={authMode === 'register' ? 'primary-button' : 'ghost-button'} onClick={() => setAuthMode('register')}>Register</button>
          </div>

          <form className="stack-form" onSubmit={handleAuthSubmit}>
            {authMode === 'register' ? (
              <>
                <label><span>Username</span><input name="username" type="text" required minLength="3" maxLength="20" pattern="[A-Za-z0-9_]+" /></label>
                <label><span>Category</span>
                  <select name="category" defaultValue="college">
                    <option value="school">School</option><option value="college">College</option><option value="competitive_exams">Competitive exams</option><option value="professional">Professional</option>
                  </select>
                </label>
              </>
            ) : null}
            <label>
              <span>Email</span>
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength="8" required />
            </label>
            <button type="submit" className="primary-button">{authMode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
        </div>
      </div>
    );
  }

  const content = {
    dashboard: renderDashboard(),
    subjects: renderSubjects(),
    timer: renderTimer(),
    planner: renderPlanner(),
    statistics: renderStatistics(),
    syllabus: renderSyllabus(),
    exams: renderExams(),
    insights: renderInsights(),
    goals: renderWeeklyGoals(),
    settings: renderSettings(),
  };

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
            {[
              ['dashboard', 'Dashboard'], ['timer', 'Timer'], ['planner', 'Planner'],
              ['subjects', 'Subjects'], ['statistics', 'Statistics'], ['syllabus', 'Syllabus'],
              ['exams', 'Exams'], ['insights', 'Insights'], ['goals', 'Weekly goals'], ['settings', 'Settings'],
            ].map(([item, label]) => (
              <button key={item} type="button" aria-current={mode === item ? 'page' : undefined} className={mode === item ? 'nav-button active' : 'nav-button'} onClick={() => {
                setMode(item);
                setSuccessMessage('');
                if (item === 'syllabus' && !syllabusSubjectId && subjects[0]) loadSyllabus(subjects[0].id);
              }}>
                {label}
              </button>
            ))}
          </nav>

          <div className="user-block">
            <span>{user.username}</span>
            <button type="button" className="ghost-button" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>

      <main className="app-content">
        {Object.entries(loadErrors).filter(([key, message]) => Boolean(message) && !['auth', 'settings', 'export', 'subjects', 'timer', 'planner', 'statistics', 'heatmap', 'syllabus', 'exams', 'insights', 'goals'].includes(key)).map(([key, message]) => (
          <p className="error-message" role="alert" key={key}>{key}: {message}</p>
        ))}
        {content[mode]}
      </main>
    </div>
  );
}

export default App;
