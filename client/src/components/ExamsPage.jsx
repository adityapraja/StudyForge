export default function ExamsPage({ localDateAt, getSubjectName, user, subjects, loadErrors, exams, nowMs, handleExamAdd, handleExamDelete, handleExamEdit }) {
  return (
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
}
