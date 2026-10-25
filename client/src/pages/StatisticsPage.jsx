import { useMemo, useState } from 'react';

export default function StatisticsPage({
  CURRENT_YEAR,
  formatSeconds,
  normalizeList,
  request,
  heatmap,
  setHeatmap,
  stats,
  loadErrors,
  setLoadErrors,
  selectedRange,
  setSelectedRange,
}) {
  const [hoveredDay, setHoveredDay] = useState(null);

  const heatmapYear = heatmap?.year;
  const heatmapDays = heatmap?.days;
  const heatmapMaxSeconds = heatmap?.max_seconds;

  // Fast date lookup map
  const daysMap = useMemo(() => {
    const map = new Map();
    (heatmapDays || []).forEach((item) => {
      if (item?.date) {
        map.set(item.date, Number(item.seconds) || 0);
      }
    });
    return map;
  }, [heatmapDays]);

  // Annual statistics summary & streak calculation
  const annualSummary = useMemo(() => {
    const year = Number(heatmapYear) || CURRENT_YEAR;
    const isLeap = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
    const totalDays = isLeap ? 366 : 365;

    let totalSeconds = 0;
    let activeDays = 0;
    let maxSeconds = 0;
    let longestStreak = 0;
    let currentStreak = 0;

    for (let dayIdx = 0; dayIdx < totalDays; dayIdx++) {
      const dateStr = new Date(Date.UTC(year, 0, dayIdx + 1)).toISOString().slice(0, 10);
      const secs = daysMap.get(dateStr) || 0;
      if (secs > 0) {
        totalSeconds += secs;
        activeDays++;
        if (secs > maxSeconds) maxSeconds = secs;
        currentStreak++;
        if (currentStreak > longestStreak) longestStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }

    return { totalSeconds, activeDays, maxSeconds, longestStreak };
  }, [heatmapYear, CURRENT_YEAR, daysMap]);

  // Compute weeks (53/54 columns) and 7 day rows for GitHub-style layout
  const calendarWeeks = useMemo(() => {
    const year = Number(heatmapYear) || CURRENT_YEAR;
    const isLeap = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
    const totalDays = isLeap ? 366 : 365;
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const startDayOfWeek = jan1.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const totalSlots = startDayOfWeek + totalDays;
    const numWeeks = Math.ceil(totalSlots / 7);

    const maxSecs = heatmapMaxSeconds || annualSummary.maxSeconds || 1;

    const weeks = [];
    for (let w = 0; w < numWeeks; w++) {
      const days = [];
      for (let d = 0; d < 7; d++) {
        const slotIndex = w * 7 + d;
        const dayOfYear = slotIndex - startDayOfWeek;
        if (dayOfYear < 0 || dayOfYear >= totalDays) {
          days.push({ inYear: false, key: `pad-${w}-${d}` });
        } else {
          const dateObj = new Date(Date.UTC(year, 0, dayOfYear + 1));
          const dateStr = dateObj.toISOString().slice(0, 10);
          const seconds = daysMap.get(dateStr) || 0;

          // GitHub 0..4 color level calculation
          let level = 0;
          if (seconds > 0) {
            if (maxSecs <= 3600) {
              if (seconds < 900) level = 1;
              else if (seconds < 1800) level = 2;
              else if (seconds < 2700) level = 3;
              else level = 4;
            } else {
              const ratio = seconds / maxSecs;
              if (ratio <= 0.25) level = 1;
              else if (ratio <= 0.5) level = 2;
              else if (ratio <= 0.75) level = 3;
              else level = 4;
            }
          }

          const formattedDate = dateObj.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          });

          days.push({
            inYear: true,
            key: dateStr,
            date: dateStr,
            dayOfWeek: d,
            seconds,
            level,
            formattedDate,
            formattedTime: seconds > 0 ? formatSeconds(seconds) : 'No study time',
          });
        }
      }
      weeks.push(days);
    }
    return weeks;
  }, [heatmapYear, heatmapMaxSeconds, CURRENT_YEAR, annualSummary.maxSeconds, daysMap, formatSeconds]);

  // Compute month labels aligned with week columns
  const monthLabels = useMemo(() => {
    const year = Number(heatmapYear) || CURRENT_YEAR;
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const startDayOfWeek = jan1.getUTCDay();
    const labels = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(Date.UTC(year, m, 1));
      const dayOfYear = Math.floor((d - jan1) / 86400000);
      const col = Math.floor((dayOfYear + startDayOfWeek) / 7);
      labels.push({
        name: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
        col: col + 1,
      });
    }
    return labels;
  }, [heatmapYear, CURRENT_YEAR]);

  return (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Statistics</p>
        <h1>Study patterns</h1>
        <label className="range-control">
          <span>Study period</span>
          <select value={selectedRange} onChange={(event) => setSelectedRange(event.target.value)}>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
            <option value="year">Last 12 months</option>
          </select>
        </label>
      </div>

      {loadErrors.statistics || loadErrors.heatmap ? (
        <p className="error-message" role="alert">
          {loadErrors.statistics || loadErrors.heatmap}
        </p>
      ) : null}

      <div className="split-layout">
        {/* Full-width GitHub Heatmap Study Calendar */}
        <div className="panel span-12">
          <div className="panel-header">
            <div>
              <h2>Study calendar</h2>
              <p>{heatmap.year} focus activity</p>
            </div>
            <label>
              <span className="sr-only">Heatmap year</span>
              <select
                value={heatmap.year}
                onChange={async (event) => {
                  const year = event.target.value;
                  try {
                    const data = await request(`/api/stats/heatmap?year=${year}`);
                    setHeatmap({ ...data, days: normalizeList(data.days) });
                  } catch (error) {
                    setLoadErrors((current) => ({ ...current, heatmap: error.message }));
                  }
                }}
              >
                {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="gh-heatmap-card">
            <div className="gh-heatmap-scroll" tabIndex={0} aria-label="Study calendar heatmap">
              <div className="gh-heatmap-container">
                {/* Month labels header */}
                <div
                  className="gh-months-row"
                  aria-hidden="true"
                  style={{ gridTemplateColumns: `repeat(${calendarWeeks.length}, 11px)` }}
                >
                  {monthLabels.map((m) => (
                    <span key={m.name} className="gh-month-label" style={{ gridColumnStart: m.col }}>
                      {m.name}
                    </span>
                  ))}
                </div>

                {/* Heatmap Body: Day labels + 53 week columns */}
                <div className="gh-heatmap-body" role="grid" aria-label={`Study activity in ${heatmap.year}`}>
                  <div className="gh-days-col" aria-hidden="true">
                    <span className="gh-day-label"></span>
                    <span className="gh-day-label">Mon</span>
                    <span className="gh-day-label"></span>
                    <span className="gh-day-label">Wed</span>
                    <span className="gh-day-label"></span>
                    <span className="gh-day-label">Fri</span>
                    <span className="gh-day-label"></span>
                  </div>

                  <div className="gh-weeks-grid" role="rowgroup">
                    {calendarWeeks.map((week, wIdx) => (
                      <div className="gh-week-col" key={`week-${wIdx}`} role="row">
                        {week.map((day) => {
                          if (!day.inYear) {
                            return <div key={day.key} className="gh-cell gh-cell-empty" aria-hidden="true" />;
                          }
                          return (
                            <div
                              key={day.key}
                              className={`gh-cell gh-level-${day.level}`}
                              role="gridcell"
                              tabIndex={0}
                              aria-label={`${day.formattedDate}: ${day.formattedTime}`}
                              title={`${day.formattedTime} on ${day.formattedDate}`}
                              onMouseEnter={() => setHoveredDay(day)}
                              onMouseLeave={() => setHoveredDay(null)}
                              onFocus={() => setHoveredDay(day)}
                              onBlur={() => setHoveredDay(null)}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Heatmap Footer: Annual Summary & GitHub-style Legend */}
            <div className="gh-heatmap-footer">
              <div className="gh-hover-info" aria-live="polite">
                {hoveredDay ? (
                  <>
                    <strong>{hoveredDay.formattedTime}</strong>
                    <span>on {hoveredDay.formattedDate}</span>
                  </>
                ) : (
                  <>
                    <span><strong>{formatSeconds(annualSummary.totalSeconds)}</strong> studied in {heatmap.year}</span>
                    <span>·</span>
                    <span>{annualSummary.activeDays} active {annualSummary.activeDays === 1 ? 'day' : 'days'}</span>
                    <span>·</span>
                    <span>Longest streak: {annualSummary.longestStreak} {annualSummary.longestStreak === 1 ? 'day' : 'days'}</span>
                  </>
                )}
              </div>

              <div className="gh-legend" aria-label="Heatmap contribution levels">
                <span className="gh-legend-label">Less</span>
                <span className="gh-legend-cell gh-level-0" title="No study time" />
                <span className="gh-legend-cell gh-level-1" title="Low study time" />
                <span className="gh-legend-cell gh-level-2" title="Medium-low study time" />
                <span className="gh-legend-cell gh-level-3" title="Medium-high study time" />
                <span className="gh-legend-cell gh-level-4" title="High study time" />
                <span className="gh-legend-label">More</span>
              </div>
            </div>
          </div>
        </div>

        {/* Study Time Chart */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Study time</h2>
              <p>
                {formatSeconds(stats.total_seconds || 0)} total · {formatSeconds(stats.daily_average_seconds || 0)} average/{selectedRange === 'year' ? 'month' : 'day'}
              </p>
            </div>
          </div>
          <div className={`bar-chart ${selectedRange === 'year' ? 'year-chart' : ''}`}>
            {stats.points.map((point) => (
              <div key={point.label} className="bar-item" title={`${point.label}: ${formatSeconds(point.seconds)}`}>
                <span className="bar-value">
                  {selectedRange === 'year' ? formatSeconds(point.seconds) : `${Math.round(point.seconds / 3600)}h`}
                </span>
                <span
                  className="bar"
                  style={{ height: `${Math.max(2, (point.seconds / Math.max(...stats.points.map((entry) => entry.seconds), 1)) * 100)}%` }}
                />
                <small>
                  {selectedRange === 'week'
                    ? new Date(`${point.label}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
                    : point.label}
                </small>
              </div>
            ))}
          </div>
        </div>

        {/* Subject Breakdown */}
        <div className="panel">
          <div className="panel-header">
            <h2>Subject breakdown</h2>
          </div>
          <div className="subject-breakdown">
            {stats.subjects.map((item) => (
              <div key={item.subject_id} className="breakdown-row">
                <div className="subject-name">
                  <span className="swatch" style={{ background: item.color }} />
                  {item.name}
                </div>
                <div className="progress-bar compact">
                  <span style={{ width: `${item.percent}%`, background: item.color }} />
                </div>
                <strong>{formatSeconds(item.seconds)}</strong>
                <span>{item.percent}%</span>
              </div>
            ))}
            {stats.subjects.length === 0 ? <p>No subject study data for this period.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
