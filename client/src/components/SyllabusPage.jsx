import SyllabusTopic from './SyllabusTopic.jsx';

export default function SyllabusPage({ subjects, loadErrors, syllabus, syllabusSubjectId, loadSyllabus, handleTopicAdd, handleSyllabusImport, handleTopicStatus }) {
  return (
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
            {syllabus.topics.length ? <ul className="syllabus-tree">{syllabus.topics.map((topic) => <SyllabusTopic key={topic.id} topic={topic} onStatusChange={handleTopicStatus} />)}</ul> : <p>No topics yet. Add one or import a list.</p>}
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
}
