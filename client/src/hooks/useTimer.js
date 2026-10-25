import { useEffect, useMemo, useRef, useState } from 'react';
import { request } from '../services/api.js';
import { playChime, toClock, formatSeconds } from '../utils/time.js';
import { getSubjectName } from '../utils/helpers.js';

export function useTimer({
  activeSession,
  setActiveSession,
  subjects = [],
  refreshProgress = async () => {},
  setSuccessMessage = () => {},
  setLoadErrors = () => {},
}) {
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [sessionNote, setSessionNote] = useState(() => localStorage.getItem('studyforge_session_note') || '');
  const [timerMode, setTimerMode] = useState(() => localStorage.getItem('studyforge_timer_mode') || 'stopwatch');
  const [countdownMinutes, setCountdownMinutes] = useState(() => {
    const saved = Number(localStorage.getItem('studyforge_countdown_minutes'));
    return Number.isFinite(saved) && saved >= 1 && saved <= 720 ? saved : 25;
  });
  const [timerLoading, setTimerLoading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const chimePlayedRef = useRef(false);

  // Ticker interval
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Sync selectedSubjectId with subjects default if empty
  useEffect(() => {
    if (!selectedSubjectId && subjects.length > 0) {
      setSelectedSubjectId(subjects[0].id);
    }
  }, [subjects, selectedSubjectId]);

  // Synchronize with activeSession changes
  useEffect(() => {
    if (activeSession) {
      if (activeSession.subject_id) {
        setSelectedSubjectId(activeSession.subject_id);
      }
      try {
        const raw = localStorage.getItem('studyforge_active_timer');
        if (raw) {
          const stored = JSON.parse(raw);
          if (stored.sessionId === activeSession.id) {
            if (stored.timerMode === 'countdown' || stored.timerMode === 'stopwatch') {
              setTimerMode(stored.timerMode);
            }
            if (Number.isFinite(stored.countdownMinutes) && stored.countdownMinutes >= 1) {
              setCountdownMinutes(stored.countdownMinutes);
            }
            if (stored.chimePlayed) {
              chimePlayedRef.current = true;
            }
          }
        }
      } catch {
        // ignore storage parse error
      }
      const savedNote = localStorage.getItem('studyforge_session_note');
      if (savedNote !== null) {
        setSessionNote(savedNote);
      } else if (activeSession.note) {
        setSessionNote(activeSession.note);
      }
    } else {
      localStorage.removeItem('studyforge_active_timer');
      localStorage.removeItem('studyforge_session_note');
    }
  }, [activeSession]);

  // Net focused study seconds
  const trackedTime = useMemo(() => {
    if (!activeSession?.started_at) return 0;
    const start = new Date(activeSession.started_at).getTime();
    if (activeSession.status === 'running') {
      const totalElapsed = Math.floor((nowMs - start) / 1000);
      return Math.max(0, totalElapsed - (activeSession.paused_seconds || 0) - (activeSession.break_seconds || 0));
    }
    // When paused or on_break, active study was frozen at segment_started_at
    const segmentStart = new Date(activeSession.segment_started_at || activeSession.started_at).getTime();
    const studyElapsed = Math.floor((segmentStart - start) / 1000);
    return Math.max(0, studyElapsed - (activeSession.paused_seconds || 0) - (activeSession.break_seconds || 0));
  }, [activeSession, nowMs]);

  // Elapsed duration of current pause or break
  const currentSegmentDuration = useMemo(() => {
    if (!activeSession?.segment_started_at) return 0;
    if (activeSession.status !== 'paused' && activeSession.status !== 'on_break') return 0;
    const segmentStart = new Date(activeSession.segment_started_at).getTime();
    return Math.max(0, Math.floor((nowMs - segmentStart) / 1000));
  }, [activeSession, nowMs]);

  // Check if countdown target is reached
  const isCountdownComplete = useMemo(() => {
    if (!activeSession || timerMode !== 'countdown') return false;
    return trackedTime >= countdownMinutes * 60;
  }, [activeSession, timerMode, trackedTime, countdownMinutes]);

  // Trigger web audio chime once when countdown hits 0
  useEffect(() => {
    if (!activeSession || timerMode !== 'countdown') {
      chimePlayedRef.current = false;
      return;
    }
    if (isCountdownComplete && !chimePlayedRef.current) {
      chimePlayedRef.current = true;
      try {
        const raw = localStorage.getItem('studyforge_active_timer');
        if (raw) {
          const stored = JSON.parse(raw);
          stored.chimePlayed = true;
          localStorage.setItem('studyforge_active_timer', JSON.stringify(stored));
        }
      } catch {
        // ignore
      }
      playChime();
    }
  }, [isCountdownComplete, activeSession, timerMode]);

  // Dynamic document title ticker
  useEffect(() => {
    if (!activeSession) {
      document.title = 'StudyForge';
      return;
    }
    const subject = getSubjectName(activeSession.subject_id, subjects);
    if (activeSession.status === 'on_break') {
      document.title = `☕ Break (${toClock(currentSegmentDuration)}) • ${subject} — StudyForge`;
    } else if (activeSession.status === 'paused') {
      document.title = `⏸ Paused (${toClock(currentSegmentDuration)}) • ${subject} — StudyForge`;
    } else if (timerMode === 'countdown') {
      const remaining = Math.max(0, countdownMinutes * 60 - trackedTime);
      if (remaining === 0) {
        document.title = `🔔 Time's Up! (${countdownMinutes}m) • ${subject} — StudyForge`;
      } else {
        document.title = `(${toClock(remaining)}) • ${subject} — StudyForge`;
      }
    } else {
      document.title = `(${toClock(trackedTime)}) • ${subject} — StudyForge`;
    }
  }, [activeSession, currentSegmentDuration, timerMode, countdownMinutes, trackedTime, subjects]);

  const timerDisplay = timerMode === 'countdown'
    ? toClock(Math.max(0, countdownMinutes * 60 - trackedTime))
    : toClock(trackedTime);

  const handleCountdownMinutesChange = (value) => {
    const parsed = Math.max(1, Math.min(720, Math.floor(Number(value)) || 1));
    setCountdownMinutes(parsed);
    localStorage.setItem('studyforge_countdown_minutes', String(parsed));
    if (activeSession) {
      try {
        const raw = localStorage.getItem('studyforge_active_timer');
        const stored = raw ? JSON.parse(raw) : { sessionId: activeSession.id };
        stored.countdownMinutes = parsed;
        localStorage.setItem('studyforge_active_timer', JSON.stringify(stored));
      } catch {
        // ignore
      }
    }
  };

  const handleTimerModeChange = (newMode) => {
    setTimerMode(newMode);
    localStorage.setItem('studyforge_timer_mode', newMode);
    if (activeSession) {
      try {
        const raw = localStorage.getItem('studyforge_active_timer');
        const stored = raw ? JSON.parse(raw) : { sessionId: activeSession.id };
        stored.timerMode = newMode;
        if (newMode === 'countdown' && !stored.countdownMinutes) {
          stored.countdownMinutes = countdownMinutes;
        }
        localStorage.setItem('studyforge_active_timer', JSON.stringify(stored));
      } catch {
        // ignore
      }
    }
  };

  const handleSessionNoteChange = (note) => {
    const sanitized = note.slice(0, 200);
    setSessionNote(sanitized);
    if (activeSession) {
      localStorage.setItem('studyforge_session_note', sanitized);
    }
  };

  const handleTimerAction = async (action) => {
    try {
      setTimerLoading(true);
      if (action === 'start') {
        const started = await request('/api/sessions/start', {
          method: 'POST',
          body: JSON.stringify({ subject_id: selectedSubjectId }),
        });
        setActiveSession(started);
        chimePlayedRef.current = false;
        const activeMeta = {
          sessionId: started.id,
          timerMode,
          countdownMinutes: timerMode === 'countdown' ? countdownMinutes : undefined,
          chimePlayed: false,
        };
        localStorage.setItem('studyforge_active_timer', JSON.stringify(activeMeta));
        setSuccessMessage('');
        return;
      }
      if (!activeSession?.id) return;
      const response = await request(`/api/sessions/${activeSession.id}/${action}`, {
        method: 'POST',
        ...(action === 'stop' ? { body: JSON.stringify({ note: sessionNote.trim() || undefined }) } : {}),
      });
      if (action === 'stop') {
        const subject = subjects.find((s) => s.id === (activeSession?.subject_id || selectedSubjectId));
        const studySecs = response?.session?.study_seconds ?? trackedTime;
        setActiveSession(null);
        localStorage.removeItem('studyforge_active_timer');
        localStorage.removeItem('studyforge_session_note');
        chimePlayedRef.current = false;
        await refreshProgress();
        setSessionNote('');
        setSuccessMessage(`Focus session completed! Logged ${formatSeconds(studySecs)}${subject ? ` for ${subject.name}` : ''}.`);
      } else {
        const nextSession = response.session || response || null;
        setActiveSession(nextSession);
        setSuccessMessage('');
      }
      setLoadErrors((current) => ({ ...current, timer: undefined }));
    } catch (error) {
      if (error.code === 'SESSION_ALREADY_OPEN' && error.details?.open_session) {
        setActiveSession(error.details.open_session);
      }
      setLoadErrors((current) => ({ ...current, timer: error.message }));
    } finally {
      setTimerLoading(false);
    }
  };

  return {
    selectedSubjectId,
    setSelectedSubjectId,
    sessionNote,
    setSessionNote,
    handleSessionNoteChange,
    timerMode,
    setTimerMode,
    handleTimerModeChange,
    countdownMinutes,
    setCountdownMinutes,
    handleCountdownMinutesChange,
    timerLoading,
    nowMs,
    trackedTime,
    currentSegmentDuration,
    isCountdownComplete,
    timerDisplay,
    handleTimerAction,
  };
}

export default useTimer;

