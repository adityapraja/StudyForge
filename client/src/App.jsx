import { useEffect, useMemo, useState } from 'react';
import DashboardPage from './components/DashboardPage.jsx';
import SubjectsPage from './components/SubjectsPage.jsx';
import TimerPage from './components/TimerPage.jsx';
import PlannerPage from './components/PlannerPage.jsx';
import StatisticsPage from './components/StatisticsPage.jsx';
import SyllabusPage from './components/SyllabusPage.jsx';
import ExamsPage from './components/ExamsPage.jsx';
import InsightsPage from './components/InsightsPage.jsx';
import WeeklyGoalsPage from './components/WeeklyGoalsPage.jsx';
import FriendsPage from './components/FriendsPage.jsx';
import LeaderboardPage from './components/LeaderboardPage.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import AuthPage from './components/AuthPage.jsx';

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
  const [friends, setFriends] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ incoming: [], outgoing: [] });
  const [leaderboard, setLeaderboard] = useState(null);
  const [leaderboardFilters, setLeaderboardFilters] = useState({ period: 'week', category: '', scope: 'all' });
  const [friendUsername, setFriendUsername] = useState('');
  const [socialLoading, setSocialLoading] = useState(false);
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

  useEffect(() => {
    if (!isAuthenticated || !user || mode !== 'friends') return undefined;
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

    Promise.all([
      load('friends', '/api/friends', (value) => setFriends(normalizeList(value))),
      load('blockedUsers', '/api/blocks', (value) => setBlockedUsers(normalizeList(value))),
      load('friendRequests', '/api/friends/requests', (value) => setFriendRequests({
        incoming: Array.isArray(value?.incoming) ? value.incoming : [],
        outgoing: Array.isArray(value?.outgoing) ? value.outgoing : [],
      })),
    ]).finally(() => {
      if (active) setSocialLoading(false);
    });

    return () => { active = false; };
  }, [isAuthenticated, mode, user]);

  useEffect(() => {
    if (!isAuthenticated || !user || mode !== 'leaderboard') return undefined;
    let active = true;
    const query = new URLSearchParams({
      period: leaderboardFilters.period,
      category: leaderboardFilters.category || user.category,
      scope: leaderboardFilters.scope,
    });
    request(`/api/leaderboards?${query}`)
      .then((data) => {
        if (!active) return;
        setLeaderboard(data);
        setLoadErrors((current) => ({ ...current, leaderboard: undefined }));
      })
      .catch((error) => {
        if (active) setLoadErrors((current) => ({ ...current, leaderboard: error.message }));
      })
      .finally(() => {
        if (active) setSocialLoading(false);
      });
    return () => { active = false; };
  }, [isAuthenticated, leaderboardFilters, mode, user]);

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

  const refreshSocialLists = async () => {
    setSocialLoading(true);
    const load = async (key, path, update) => {
      try {
        const value = await request(path);
        update(value);
        setLoadErrors((current) => ({ ...current, [key]: undefined }));
      } catch (error) {
        setLoadErrors((current) => ({ ...current, [key]: error.message }));
      }
    };
    await Promise.all([
      load('friends', '/api/friends', (value) => setFriends(normalizeList(value))),
      load('blockedUsers', '/api/blocks', (value) => setBlockedUsers(normalizeList(value))),
      load('friendRequests', '/api/friends/requests', (value) => setFriendRequests({
        incoming: Array.isArray(value?.incoming) ? value.incoming : [],
        outgoing: Array.isArray(value?.outgoing) ? value.outgoing : [],
      })),
    ]);
    setSocialLoading(false);
  };

  const handleFriendRequestSubmit = async (event) => {
    event.preventDefault();
    const username = friendUsername.trim();
    if (!username) return;
    try {
      await request('/api/friends/requests', {
        method: 'POST',
        body: JSON.stringify({ username }),
      });
      setFriendUsername('');
      await refreshSocialLists();
      setSuccessMessage(`Friend request sent to ${username}.`);
      setLoadErrors((current) => ({ ...current, social: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, social: error.message }));
    }
  };

  const handleFriendRequestAction = async (requestId, action) => {
    try {
      await request(`/api/friends/requests/${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      await refreshSocialLists();
      setSuccessMessage(action === 'accept' ? 'Friend request accepted.' : 'Friend request declined.');
      setLoadErrors((current) => ({ ...current, social: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, social: error.message }));
    }
  };

  const handleFriendRemove = async (friend) => {
    if (!window.confirm(`Remove ${friend.username} from your friends?`)) return;
    try {
      await request(`/api/friends/${friend.user_id}`, { method: 'DELETE' });
      await refreshSocialLists();
      setSuccessMessage(`${friend.username} was removed from your friends.`);
      setLoadErrors((current) => ({ ...current, social: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, social: error.message }));
    }
  };

  const handleBlockUser = async (person) => {
    if (!person?.id) return;
    if (!window.confirm(`Block ${person.username}? This also removes any friendship and hides both profiles from each other.`)) return;
    try {
      await request('/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ user_id: person.id }),
      });
      await refreshSocialLists();
      setSuccessMessage(`${person.username} was blocked.`);
      setLoadErrors((current) => ({ ...current, social: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, social: error.message }));
    }
  };

  const handleUnblockUser = async (person) => {
    try {
      await request(`/api/blocks/${person.user_id}`, { method: 'DELETE' });
      await refreshSocialLists();
      setSuccessMessage(`${person.username} was unblocked.`);
      setLoadErrors((current) => ({ ...current, social: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, social: error.message }));
    }
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

  const pageProps = { authMode, setAuthMode, loadErrors, formError, handleAuthSubmit, formatSeconds, toClock, getSubjectName, user, subjects, activeSession, planner, stats, xp, streak, goals, exams, setMode, todaySeconds, trackedTime, handleSubjectSave, handleSubjectEdit, handleSubjectDelete, selectedSubjectId, setSelectedSubjectId, sessionNote, setSessionNote, timerMode, setTimerMode, countdownMinutes, setCountdownMinutes, successMessage, timerDisplay, handleTimerAction, setPlanner, handleManualSession, handlePlannerSave, handlePlannerCarryOver, CURRENT_YEAR, daysInYear, dateAtYearDay, normalizeList, request, heatmap, setHeatmap, setLoadErrors, selectedRange, setSelectedRange, syllabus, syllabusSubjectId, loadSyllabus, handleTopicAdd, handleSyllabusImport, handleTopicStatus, localDateAt, nowMs, handleExamAdd, handleExamDelete, handleExamEdit, insights, friends, blockedUsers, friendRequests, friendUsername, setFriendUsername, socialLoading, handleFriendRequestSubmit, handleFriendRequestAction, handleFriendRemove, handleBlockUser, handleUnblockUser, leaderboard, setLeaderboard, leaderboardFilters, setLeaderboardFilters, setSocialLoading, handleLogout, handleDownloadCsv, handleSettingsSave, handleAccountDelete };

  if (checkingAuth) {
    return <main className="auth-shell" aria-live="polite">Checking your session…</main>;
  }

  if (!isAuthenticated) {
    return <AuthPage {...pageProps} />;
  }

  const content = {
    dashboard: <DashboardPage {...pageProps} />,
    subjects: <SubjectsPage {...pageProps} />,
    timer: <TimerPage {...pageProps} />,
    planner: <PlannerPage {...pageProps} />,
    statistics: <StatisticsPage {...pageProps} />,
    syllabus: <SyllabusPage {...pageProps} />,
    exams: <ExamsPage {...pageProps} />,
    insights: <InsightsPage {...pageProps} />,
    goals: <WeeklyGoalsPage {...pageProps} />,
    friends: <FriendsPage {...pageProps} />,
    leaderboard: <LeaderboardPage {...pageProps} />,
    settings: <SettingsPage {...pageProps} />,
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
              ['exams', 'Exams'], ['insights', 'Insights'], ['goals', 'Weekly goals'],
              ['friends', 'Friends'], ['leaderboard', 'Leaderboard'], ['settings', 'Settings'],
            ].map(([item, label]) => (
              <button key={item} type="button" aria-current={mode === item ? 'page' : undefined} className={mode === item ? 'nav-button active' : 'nav-button'} onClick={() => {
                if (mode !== item && (item === 'friends' || item === 'leaderboard')) setSocialLoading(true);
                if (mode !== item && item === 'leaderboard') setLeaderboard(null);
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
        {Object.entries(loadErrors).filter(([key, message]) => Boolean(message) && !['auth', 'settings', 'export', 'subjects', 'timer', 'planner', 'statistics', 'heatmap', 'syllabus', 'exams', 'insights', 'goals', 'social', 'friends', 'friendRequests', 'blockedUsers', 'leaderboard'].includes(key)).map(([key, message]) => (
          <p className="error-message" role="alert" key={key}>{key}: {message}</p>
        ))}
        {content[mode]}
      </main>
    </div>
  );
}

export default App;
