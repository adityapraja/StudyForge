export default function TimerPage({ getSubjectName, subjects, activeSession, loadErrors, selectedSubjectId, setSelectedSubjectId, sessionNote, setSessionNote, timerMode, setTimerMode, countdownMinutes, setCountdownMinutes, successMessage, timerDisplay, handleTimerAction }) {
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
}
