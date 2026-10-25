export const normalizeList = (value) => {
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

export const normalizeSession = (value) => {
  if (!value) return null;
  if (Object.hasOwn(value, 'session')) return value.session;
  return value;
};

export const getSubjectName = (subjectId, subjects) =>
  (Array.isArray(subjects) ? subjects : []).find((subject) => subject.id === subjectId)?.name || 'General';

