export default function PlannerPage({ formatSeconds, subjects, planner, setPlanner, loadErrors, successMessage, handleManualSession, handlePlannerSave, handlePlannerCarryOver }) {
  return (
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
}
