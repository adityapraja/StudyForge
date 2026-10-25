export default function TimerPage({
  getSubjectName,
  subjects,
  activeSession,
  loadErrors,
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
  successMessage,
  timerDisplay,
  handleTimerAction,
  timerLoading,
  currentSegmentDuration = 0,
  isCountdownComplete = false,
  toClock,
  trackedTime = 0,
  setMode,
}) {
  const onNoteChange = handleSessionNoteChange || setSessionNote;
  const onModeChange = handleTimerModeChange || setTimerMode;
  const onCountdownChange = handleCountdownMinutesChange || setCountdownMinutes;
  const PRESETS = [15, 25, 45, 60];

  return (
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
            <button
              type="button"
              className={timerMode === 'stopwatch' ? 'primary-button' : 'ghost-button'}
              onClick={() => onModeChange('stopwatch')}
            >
              Stopwatch
            </button>
            <button
              type="button"
              className={timerMode === 'countdown' ? 'primary-button' : 'ghost-button'}
              onClick={() => onModeChange('countdown')}
            >
              Countdown
            </button>
          </div>

          {timerMode === 'countdown' && !activeSession ? (
            <div className="countdown-config">
              <label>
                <span>Countdown length (minutes)</span>
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={countdownMinutes}
                  onChange={(event) => onCountdownChange(event.target.value)}
                />
              </label>
              <div className="preset-row" role="group" aria-label="Quick preset durations">
                <span className="preset-label">Presets:</span>
                {PRESETS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    className={countdownMinutes === mins ? 'preset-pill active' : 'preset-pill'}
                    onClick={() => onCountdownChange(mins)}
                  >
                    {mins}m{mins === 25 ? ' (Pomodoro)' : ''}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {timerMode === 'countdown' && activeSession ? (
            <div className="countdown-info-row">
              <span className="eyebrow">Target: {countdownMinutes}m Focus Block</span>
              {isCountdownComplete && toClock ? (
                <span className="overtime-indicator">
                  Target reached • +{toClock(trackedTime - countdownMinutes * 60)} overtime
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="timer-display-wrap">
            <div className="timer-display" aria-live="polite">{timerDisplay}</div>
            {activeSession ? (
              <div className="timer-status-row">
                {activeSession.status === 'running' && (
                  <span className="timer-badge running">
                    <span className="pulse-dot" /> Focusing on {getSubjectName(activeSession.subject_id, subjects)}
                  </span>
                )}
                {activeSession.status === 'paused' && (
                  <span className="timer-badge paused">
                    ⏸ Paused ({toClock ? toClock(currentSegmentDuration) : `${currentSegmentDuration}s`})
                  </span>
                )}
                {activeSession.status === 'on_break' && (
                  <span className="timer-badge break">
                    ☕ On Break ({toClock ? toClock(currentSegmentDuration) : `${currentSegmentDuration}s`})
                  </span>
                )}
              </div>
            ) : null}
          </div>

          {isCountdownComplete ? (
            <div className="countdown-complete-banner" role="status">
              <div>
                <p>🎉 <strong>Focus target reached!</strong></p>
                <small>{countdownMinutes} min countdown completed.</small>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={timerLoading}
                onClick={() => handleTimerAction('stop')}
              >
                {timerLoading ? 'Saving…' : 'Stop & Save'}
              </button>
            </div>
          ) : null}

          <div className="subject-select">
            <label>
              <span>Subject</span>
              <select
                value={selectedSubjectId}
                disabled={Boolean(activeSession) || subjects.length === 0}
                onChange={(event) => setSelectedSubjectId(event.target.value)}
              >
                <option value="" disabled>Select a subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </label>
            {subjects.length === 0 ? (
              <p className="hint-text top-gap-sm">
                No subjects found.{' '}
                {setMode ? (
                  <button type="button" className="inline-link" onClick={() => setMode('subjects')}>
                    Create a subject
                  </button>
                ) : 'Create a subject'}{' '}
                to start your timer.
              </p>
            ) : null}
          </div>

          <div className="button-row">
            {!activeSession || activeSession.status === 'ended' ? (
              <button
                type="button"
                className="primary-button"
                disabled={!selectedSubjectId || timerLoading || subjects.length === 0}
                onClick={() => handleTimerAction('start')}
              >
                {timerLoading ? 'Starting…' : 'Start timer'}
              </button>
            ) : null}
            {activeSession && activeSession.status === 'running' ? (
              <>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={timerLoading}
                  onClick={() => handleTimerAction('pause')}
                >
                  {timerLoading ? '…' : 'Pause'}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={timerLoading}
                  onClick={() => handleTimerAction('break')}
                >
                  {timerLoading ? '…' : 'Break'}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={timerLoading}
                  onClick={() => handleTimerAction('stop')}
                >
                  {timerLoading ? 'Saving…' : 'Stop'}
                </button>
              </>
            ) : null}
            {activeSession && (activeSession.status === 'paused' || activeSession.status === 'on_break') ? (
              <>
                <button
                  type="button"
                  className="primary-button"
                  disabled={timerLoading}
                  onClick={() => handleTimerAction('resume')}
                >
                  {timerLoading ? 'Resuming…' : 'Resume'}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={timerLoading}
                  onClick={() => handleTimerAction('stop')}
                >
                  {timerLoading ? 'Saving…' : 'Stop'}
                </button>
              </>
            ) : null}
          </div>

          <label className="note-textarea">
            <div className="label-with-count">
              <span>Session note</span>
              <span className="char-count">{(sessionNote || '').length}/200</span>
            </div>
            <textarea
              value={sessionNote || ''}
              maxLength={200}
              rows="4"
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="What did you work on?"
            />
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
              <p>Started: {new Date(activeSession.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              <p>Mode: <strong>{timerMode === 'countdown' ? `Countdown (${countdownMinutes}m)` : 'Stopwatch'}</strong></p>
              <p>
                Status:{' '}
                <span className={`status-pill status-${activeSession.status}`}>
                  {activeSession.status === 'running'
                    ? 'Focusing'
                    : activeSession.status === 'on_break'
                    ? `On Break (${toClock ? toClock(currentSegmentDuration) : `${currentSegmentDuration}s`})`
                    : `Paused (${toClock ? toClock(currentSegmentDuration) : `${currentSegmentDuration}s`})`}
                </span>
              </p>
              <div className="session-metrics top-gap-sm">
                <p>Focused study: <strong>{toClock ? toClock(trackedTime) : trackedTime}</strong></p>
                {activeSession.break_seconds ? <p>Breaks taken: {toClock ? toClock(activeSession.break_seconds) : activeSession.break_seconds}</p> : null}
                {activeSession.paused_seconds ? <p>Paused time: {toClock ? toClock(activeSession.paused_seconds) : activeSession.paused_seconds}</p> : null}
                {timerMode === 'countdown' ? (
                  <p>Goal progress: <strong>{Math.min(100, Math.round((trackedTime / (countdownMinutes * 60)) * 100))}%</strong></p>
                ) : null}
              </div>
            </div>
          ) : (
            <p>No active session. Start a timer to recover it on refresh.</p>
          )}
        </div>
      </div>
    </section>
  );
}
