export default function SyllabusTopic({ topic, onStatusChange }) {
  return (
    <li className="syllabus-topic">
      <div className="syllabus-topic-row">
        <span>{topic.title}</span>
        <select aria-label={`Status for ${topic.title}`} value={topic.status} onChange={(event) => onStatusChange(topic.id, event.target.value)}>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>
      </div>
      {topic.children?.length ? <ul>{topic.children.map((child) => <SyllabusTopic key={child.id} topic={child} onStatusChange={onStatusChange} />)}</ul> : null}
    </li>
  );
}
