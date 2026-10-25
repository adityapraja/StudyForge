export default function SubjectsPage({ subjects, loadErrors, handleSubjectSave, handleSubjectEdit, handleSubjectDelete }) {
  return (
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
              <input type="text" name="name" placeholder="e.g. Biology" required maxLength="40" />
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
}
