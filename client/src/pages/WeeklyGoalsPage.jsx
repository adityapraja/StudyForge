export default function WeeklyGoalsPage({ formatSeconds, loadErrors, goals }) {
  const dailyPercent = goals?.daily_target_seconds ? Math.min(100, Math.round(goals.today_seconds / goals.daily_target_seconds * 100)) : 0;
  const weeklyPercent = goals?.weekly_target_seconds ? Math.min(100, Math.round(goals.week_seconds / goals.weekly_target_seconds * 100)) : 0;
  return (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Progress</p>
        <h1>Weekly goals</h1>
        <p>Progress is calculated from study time recorded in your local time zone.</p>
      </div>
      {loadErrors.goals ? <p className="error-message" role="alert">{loadErrors.goals}</p> : null}
      <div className="split-layout">
        <article className="panel">
          <div className="panel-header"><h2>This week</h2><strong>{weeklyPercent}%</strong></div>
          <div className="progress-bar" role="progressbar" aria-label="Weekly goal progress" aria-valuenow={weeklyPercent} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${weeklyPercent}%` }} /></div>
          <p>{formatSeconds(goals?.week_seconds || 0)} of {formatSeconds(goals?.weekly_target_seconds || 0)}</p>
        </article>
        <article className="panel">
          <div className="panel-header"><h2>Today</h2><strong>{dailyPercent}%</strong></div>
          <div className="progress-bar" role="progressbar" aria-label="Daily goal progress" aria-valuenow={dailyPercent} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${dailyPercent}%` }} /></div>
          <p>{formatSeconds(goals?.today_seconds || 0)} of {formatSeconds(goals?.daily_target_seconds || 0)}</p>
        </article>
      </div>
    </section>
  );
}
