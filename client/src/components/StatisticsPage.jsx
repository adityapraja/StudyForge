export default function StatisticsPage({ CURRENT_YEAR, daysInYear, dateAtYearDay, formatSeconds, normalizeList, request, heatmap, setHeatmap, stats, loadErrors, setLoadErrors, selectedRange, setSelectedRange }) {
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
      {loadErrors.statistics || loadErrors.heatmap ? <p className="error-message" role="alert">{loadErrors.statistics || loadErrors.heatmap}</p> : null}
      <div className="split-layout">
        <div className="panel">
          <div className="panel-header">
            <div><h2>Study calendar</h2><p>{heatmap.year}</p></div>
            <label>
              <span className="sr-only">Heatmap year</span>
              <select value={heatmap.year} onChange={async (event) => {
                const year = event.target.value;
                try {
                  const data = await request(`/api/stats/heatmap?year=${year}`);
                  setHeatmap({ ...data, days: normalizeList(data.days) });
                } catch (error) {
                  setLoadErrors((current) => ({ ...current, heatmap: error.message }));
                }
              }}>
                {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
          </div>
          <div className="heatmap-grid">
            {Array.from({ length: daysInYear(heatmap.year) }, (_, index) => {
              const date = dateAtYearDay(heatmap.year, index);
              const day = heatmap.days.find((item) => item.date === date);
              const seconds = day?.seconds || 0;
              const intensity = heatmap.max_seconds ? seconds / heatmap.max_seconds : 0;
              return (
                <div
                  key={date}
                  className="heat-cell"
                  role="img"
                  title={`${date}: ${formatSeconds(seconds)}`}
                  aria-label={`${date}: ${formatSeconds(seconds)}`}
                  style={{ backgroundColor: `rgba(10, 10, 10, ${seconds ? 0.12 + intensity * 0.68 : 0.04})` }}
                >
                  <span>{seconds ? `${Math.round(seconds / 3600)}h` : '0'}</span>
                </div>
              );
            })}
          </div>
          <p>Each day shows its logged study hours; color is an additional cue.</p>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div><h2>Study time</h2><p>{formatSeconds(stats.total_seconds || 0)} total · {formatSeconds(stats.daily_average_seconds || 0)} average/{selectedRange === 'year' ? 'month' : 'day'}</p></div>
          </div>
          <div className={`bar-chart ${selectedRange === 'year' ? 'year-chart' : ''}`}>
            {stats.points.map((point) => (
              <div key={point.label} className="bar-item" title={`${point.label}: ${formatSeconds(point.seconds)}`}>
                <span className="bar-value">{selectedRange === 'year' ? formatSeconds(point.seconds) : `${Math.round(point.seconds / 3600)}h`}</span>
                <span className="bar" style={{ height: `${Math.max(2, (point.seconds / Math.max(...stats.points.map((entry) => entry.seconds), 1)) * 100)}%` }} />
                <small>{selectedRange === 'week' ? new Date(`${point.label}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }) : point.label}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel top-gap">
        <div className="panel-header">
          <h2>Subject breakdown</h2>
        </div>
        <div className="subject-breakdown">
          {stats.subjects.map((item) => (
            <div key={item.subject_id} className="breakdown-row">
              <div className="subject-name"><span className="swatch" style={{ background: item.color }} />{item.name}</div>
              <div className="progress-bar compact"><span style={{ width: `${item.percent}%`, background: item.color }} /></div>
              <strong>{formatSeconds(item.seconds)}</strong>
              <span>{item.percent}%</span>
            </div>
          ))}
          {stats.subjects.length === 0 ? <p>No subject study data for this period.</p> : null}
        </div>
      </div>
    </section>
  );
}
