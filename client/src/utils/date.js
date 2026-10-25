export const localDate = (date, timeZone = 'UTC') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const nextDate = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
};

export const localDateAt = (timestamp, timeZone) => localDate(new Date(timestamp), timeZone);

export const daysInYear = (year) => (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365);

export const dateAtYearDay = (year, dayIndex) =>
  new Date(Date.UTC(year, 0, dayIndex + 1)).toISOString().slice(0, 10);

