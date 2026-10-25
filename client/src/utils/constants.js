export const CURRENT_YEAR = new Date().getFullYear();

export const emptyPlanner = {
  date: '',
  goals: [],
  tasks: [],
  reflection: '',
  review: { total_seconds: 0, goals_met: 0, goals_total: 0, tasks_done: 0, tasks_total: 0 },
};

export const emptyStats = {
  range: 'week',
  points: [],
  total_seconds: 0,
  daily_average_seconds: 0,
  subjects: [],
};

export const NAV_ITEMS = [
  ['dashboard', 'Dashboard'],
  ['timer', 'Timer'],
  ['planner', 'Planner'],
  ['subjects', 'Subjects'],
  ['statistics', 'Statistics'],
  ['syllabus', 'Syllabus'],
  ['exams', 'Exams'],
  ['insights', 'Insights'],
  ['goals', 'Weekly goals'],
  ['friends', 'Friends'],
  ['leaderboard', 'Leaderboard'],
  ['settings', 'Settings'],
];

