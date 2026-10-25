import { useEffect, useState } from 'react';
import { request } from '../services/api.js';
import { localDate, localDateAt } from '../utils/date.js';
import { normalizeList, normalizeSession } from '../utils/helpers.js';
import { CURRENT_YEAR, emptyPlanner, emptyStats } from '../utils/constants.js';

export function useAppData(isAuthenticated, user, mode) {
  const [subjects, setSubjects] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [planner, setPlanner] = useState(emptyPlanner);
  const [heatmap, setHeatmap] = useState(() => ({ year: CURRENT_YEAR, days: [], max_seconds: 0 }));
  const [stats, setStats] = useState(emptyStats);
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
  const [loadErrors, setLoadErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  // Initial load of authenticated user data
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
      load('subjects', '/api/subjects', (value) => setSubjects(normalizeList(value))),
      load('activeSession', '/api/sessions/active', (value) => setActiveSession(normalizeSession(value))),
      load('planner', `/api/planner/${today}`, (value) => setPlanner({
        ...emptyPlanner,
        ...value,
        goals: normalizeList(value.goals),
        tasks: normalizeList(value.tasks),
      })),
      load('xp', '/api/me/xp', setXp),
      load('streak', '/api/me/streak', setStreak),
      load('goals', '/api/me/goals', setGoals),
      load('exams', '/api/exams', (value) => setExams(normalizeList(value))),
      load('insights', '/api/stats/insights', (value) => setInsights(normalizeList(value))),
    ]);
    return () => {
      active = false;
    };
  }, [isAuthenticated, user]);

  // Statistics & subject breakdown when range changes
  useEffect(() => {
    if (!isAuthenticated || !user) return undefined;
    let active = true;
    Promise.all([
      request(`/api/stats/progress?range=${selectedRange}`),
      request(`/api/stats/subjects?range=${selectedRange}`),
    ])
      .then(([progress, subjectBreakdown]) => {
        if (active) setStats({ ...emptyStats, ...progress, subjects: normalizeList(subjectBreakdown.subjects) });
      })
      .catch((error) => {
        if (active) setLoadErrors((current) => ({ ...current, statistics: error.message }));
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, selectedRange, user]);

  // Heatmap load
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
    return () => {
      active = false;
    };
  }, [isAuthenticated, user]);

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

  // Social / Leaderboard data load on tab visit
  useEffect(() => {
    if (!isAuthenticated || !user) return undefined;
    let active = true;
    if (mode === 'friends') {
      refreshSocialLists();
    }
    if (mode !== 'leaderboard') return undefined;

    setSocialLoading(true);
    const query = new URLSearchParams({
      period: leaderboardFilters.period,
      scope: leaderboardFilters.scope,
      ...(leaderboardFilters.category ? { category: leaderboardFilters.category } : {}),
    });
    request(`/api/leaderboard?${query.toString()}`)
      .then((data) => {
        if (!active) return;
        setLeaderboard({
          ...data,
          ranks: Array.isArray(data?.ranks) ? data.ranks : [],
        });
        setLoadErrors((current) => ({ ...current, leaderboard: undefined }));
      })
      .catch((error) => {
        if (active) setLoadErrors((current) => ({ ...current, leaderboard: error.message }));
      })
      .finally(() => {
        if (active) setSocialLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, leaderboardFilters, mode, user]);

  const refreshProgress = async () => {
    if (!user) return;
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
    setPlanner({
      ...emptyPlanner,
      ...plannerData,
      goals: normalizeList(plannerData.goals),
      tasks: normalizeList(plannerData.tasks),
    });
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

  const handleSubjectSave = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    const color = formData.get('color');
    if (!name) return;
    try {
      const created = await request('/api/subjects', {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      });
      setSubjects((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      form.reset();
      setLoadErrors((current) => ({ ...current, subjects: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, subjects: error.message }));
    }
  };

  const handleSubjectEdit = async (subject) => {
    const nextName = window.prompt('New subject name', subject.name)?.trim();
    if (!nextName || nextName === subject.name) return;
    try {
      const updated = await request(`/api/subjects/${subject.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: nextName }),
      });
      setSubjects((current) => current.map((item) => (item.id === subject.id ? updated : item)).sort((a, b) => a.name.localeCompare(b.name)));
      setLoadErrors((current) => ({ ...current, subjects: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, subjects: error.message }));
    }
  };

  const handleSubjectDelete = async (subject) => {
    if (!window.confirm(`Delete ${subject.name}? This will remove all its sessions, exams, and topics.`)) return;
    try {
      await request(`/api/subjects/${subject.id}`, { method: 'DELETE' });
      setSubjects((current) => current.filter((item) => item.id !== subject.id));
      if (syllabusSubjectId === subject.id) setSyllabus(null);
      setLoadErrors((current) => ({ ...current, subjects: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, subjects: error.message }));
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
      await refreshProgress();
      setSuccessMessage('Manual session logged.');
      setLoadErrors((current) => ({ ...current, timer: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, timer: error.message }));
    }
  };

  const handlePlannerSave = async (event) => {
    event?.preventDefault?.();
    const targetDate = planner.date || localDate(new Date(), user?.time_zone);
    const cleanGoals = (planner.goals || [])
      .map((g) => ({
        ...(g.id && !String(g.id).startsWith('new-') ? { id: g.id } : {}),
        text: String(g.text || '').trim(),
        target_seconds: Number(g.target_seconds) || 3600,
        subject_id: g.subject_id || null,
      }))
      .filter((g) => Boolean(g.text));

    if (cleanGoals.length === 0) {
      setLoadErrors((current) => ({ ...current, planner: 'Please enter at least one goal name before saving.' }));
      return;
    }

    const cleanTasks = (planner.tasks || [])
      .map((t) => ({
        ...(t.id && !String(t.id).startsWith('new-') ? { id: t.id } : {}),
        text: String(t.text || '').trim(),
        done: Boolean(t.done),
      }))
      .filter((t) => Boolean(t.text));

    try {
      const response = await request(`/api/planner/${targetDate}`, {
        method: 'PUT',
        body: JSON.stringify({
          reflection: planner.reflection || '',
          goals: cleanGoals,
          tasks: cleanTasks,
        }),
      });
      setPlanner((current) => ({
        ...current,
        ...response,
        goals: normalizeList(response.goals),
        tasks: normalizeList(response.tasks),
      }));
      setSuccessMessage('Daily plan saved.');
      setLoadErrors((current) => ({ ...current, planner: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, planner: error.message }));
    }
  };

  const handlePlannerCarryOver = async () => {
    const targetDate = planner.date || localDate(new Date(), user?.time_zone);
    try {
      const response = await request(`/api/planner/${targetDate}/carry-over`, { method: 'POST' });
      setPlanner((current) => ({
        ...current,
        ...response,
        goals: normalizeList(response.goals),
        tasks: normalizeList(response.tasks),
      }));
      setSuccessMessage('Incomplete tasks carried over.');
      setLoadErrors((current) => ({ ...current, planner: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, planner: error.message }));
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
      setLoadErrors((current) => ({ ...current, syllabus: undefined }));
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
      setLoadErrors((current) => ({ ...current, syllabus: undefined }));
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
      setLoadErrors((current) => ({ ...current, syllabus: undefined }));
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
    if (!window.confirm('Remove this exam?')) return;
    try {
      await request(`/api/exams/${exam.id}`, { method: 'DELETE' });
      setExams((current) => current.filter((item) => item.id !== exam.id));
      setLoadErrors((current) => ({ ...current, exams: undefined }));
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
      setExams((current) => current.map((item) => (item.id === exam.id ? updated : item)).sort((a, b) => a.date.localeCompare(b.date)));
      setLoadErrors((current) => ({ ...current, exams: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, exams: error.message }));
    }
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
      setSuccessMessage(`Friend request ${action}ed.`);
      setLoadErrors((current) => ({ ...current, social: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, social: error.message }));
    }
  };

  const handleFriendRemove = async (friend) => {
    const targetId = friend?.user_id || friend?.id;
    if (!targetId) return;
    if (!window.confirm(`Remove ${friend.username} from your friends?`)) return;
    try {
      await request(`/api/friends/${targetId}`, { method: 'DELETE' });
      await refreshSocialLists();
      setSuccessMessage(`${friend.username} removed from friends.`);
      setLoadErrors((current) => ({ ...current, social: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, social: error.message }));
    }
  };

  const handleBlockUser = async (person) => {
    const targetId = person?.id || person?.user_id;
    if (!targetId) return;
    if (!window.confirm(`Block ${person.username}? This also removes any friendship and hides both profiles from each other.`)) return;
    try {
      await request('/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ user_id: targetId }),
      });
      await refreshSocialLists();
      setSuccessMessage(`${person.username} was blocked.`);
      setLoadErrors((current) => ({ ...current, social: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, social: error.message }));
    }
  };

  const handleUnblockUser = async (person) => {
    const targetId = person?.user_id || person?.id;
    if (!targetId) return;
    try {
      await request(`/api/blocks/${targetId}`, { method: 'DELETE' });
      await refreshSocialLists();
      setSuccessMessage(`${person.username || 'User'} was unblocked.`);
      setLoadErrors((current) => ({ ...current, social: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, social: error.message }));
    }
  };

  const handleDownloadCsv = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/me/export.csv`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Export download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'study-sessions.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setLoadErrors((current) => ({ ...current, export: error.message }));
    }
  };

  const handleSettingsSave = async (event, onProfileUpdated) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const profile = {
      username: values.get('username') || undefined,
      time_zone: values.get('time_zone') || undefined,
      category: values.get('category') || undefined,
      leaderboard_hidden: values.get('leaderboard_hidden') === 'on',
      privacy: {
        weekly_time: values.get('weekly_time') || 'friends',
        subjects: values.get('subjects') || 'friends',
      },
    };
    const targetGoals = {
      daily_target_seconds: Math.round(Number(values.get('daily_hours') || 0) * 3600),
      weekly_target_seconds: Math.round(Number(values.get('weekly_hours') || 0) * 3600),
      streak_minimum_minutes: Number(values.get('streak_minimum_minutes') || 15),
    };
    try {
      const updatedUser = await request('/api/me', {
        method: 'PATCH',
        body: JSON.stringify(profile),
      });
      if (onProfileUpdated) onProfileUpdated(updatedUser);

      const updatedGoals = await request('/api/me/goals', {
        method: 'PUT',
        body: JSON.stringify(targetGoals),
      });
      setGoals(updatedGoals);

      await refreshProgress();
      setSuccessMessage('Settings updated.');
      setLoadErrors((current) => ({ ...current, settings: undefined }));
    } catch (error) {
      setLoadErrors((current) => ({ ...current, settings: error.message }));
    }
  };

  const handleAccountDelete = async (onDeleted) => {
    const confirmation = window.prompt('Type DELETE to permanently erase your StudyForge account and study history.');
    if (confirmation !== 'DELETE') return;
    try {
      await request('/api/me', { method: 'DELETE' });
      if (onDeleted) onDeleted();
    } catch (error) {
      setLoadErrors((current) => ({ ...current, settings: error.message }));
    }
  };

  const todaySeconds = goals?.today_seconds ?? 0;

  return {
    subjects,
    setSubjects,
    activeSession,
    setActiveSession,
    planner,
    setPlanner,
    heatmap,
    setHeatmap,
    stats,
    setStats,
    xp,
    setXp,
    streak,
    setStreak,
    goals,
    setGoals,
    exams,
    setExams,
    insights,
    friends,
    blockedUsers,
    friendRequests,
    leaderboard,
    setLeaderboard,
    leaderboardFilters,
    setLeaderboardFilters,
    friendUsername,
    setFriendUsername,
    socialLoading,
    setSocialLoading,
    syllabus,
    syllabusSubjectId,
    loadSyllabus,
    selectedRange,
    setSelectedRange,
    loadErrors,
    setLoadErrors,
    successMessage,
    setSuccessMessage,
    todaySeconds,
    refreshProgress,
    refreshSocialLists,
    handleSubjectSave,
    handleSubjectEdit,
    handleSubjectDelete,
    handleManualSession,
    handlePlannerSave,
    handlePlannerCarryOver,
    handleTopicAdd,
    handleTopicStatus,
    handleSyllabusImport,
    handleExamAdd,
    handleExamDelete,
    handleExamEdit,
    handleFriendRequestSubmit,
    handleFriendRequestAction,
    handleFriendRemove,
    handleBlockUser,
    handleUnblockUser,
    handleDownloadCsv,
    handleSettingsSave,
    handleAccountDelete,
  };
}

export default useAppData;
