export default function LeaderboardPage({ formatSeconds, user, loadErrors, leaderboard, setLeaderboard, leaderboardFilters, setLeaderboardFilters, socialLoading, setSocialLoading }) {
  return (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Social</p>
        <h1>Study leaderboard</h1>
        <p>Compare verified study time. Periods follow your local time zone; manual entries are excluded.</p>
      </div>
      {loadErrors.leaderboard ? <p className="error-message" role="alert">{loadErrors.leaderboard}</p> : null}
      <div className="panel leaderboard-controls">
        <label>
          <span>Period</span>
          <select value={leaderboardFilters.period} onChange={(event) => {
            setSocialLoading(true);
            setLeaderboard(null);
            setLeaderboardFilters((current) => ({ ...current, period: event.target.value }));
          }}>
            <option value="day">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
        </label>
        <label>
          <span>Category</span>
          <select value={leaderboardFilters.category || user.category} onChange={(event) => {
            setSocialLoading(true);
            setLeaderboard(null);
            setLeaderboardFilters((current) => ({ ...current, category: event.target.value }));
          }}>
            <option value="school">School</option>
            <option value="college">College</option>
            <option value="competitive_exams">Competitive exams</option>
            <option value="professional">Professional</option>
          </select>
        </label>
        <label>
          <span>Who to include</span>
          <select value={leaderboardFilters.scope} onChange={(event) => {
            setSocialLoading(true);
            setLeaderboard(null);
            setLeaderboardFilters((current) => ({ ...current, scope: event.target.value }));
          }}>
            <option value="all">Everyone</option>
            <option value="friends">Friends only</option>
          </select>
        </label>
      </div>

      {leaderboard?.me ? (
        <p className="leaderboard-personal-rank" role="status">
          Your rank: {leaderboard.me.rank ?? '—'} · {formatSeconds(leaderboard.me.seconds || 0)}
        </p>
      ) : null}
      <section className="panel top-gap" aria-label="Leaderboard rankings">
        <div className="panel-header">
          <div>
            <h2>{leaderboardFilters.scope === 'friends' ? 'Friends ranking' : 'Category ranking'}</h2>
            {leaderboard?.period_start && leaderboard?.period_end ? <p>{leaderboard.period_start} to {leaderboard.period_end}</p> : null}
          </div>
        </div>
        {leaderboard?.entries?.length ? (
          <ol className="leaderboard-list">
            {leaderboard.entries.map((entry) => (
              <li key={entry.user_id} className="leaderboard-row">
                <span className="leaderboard-rank">{entry.rank}</span>
                <div><strong>{entry.username}</strong><p>Level {entry.level}</p></div>
                <strong>{formatSeconds(entry.seconds || 0)}</strong>
              </li>
            ))}
          </ol>
        ) : loadErrors.leaderboard ? null : <p>{socialLoading ? 'Loading leaderboard…' : 'No ranked study time for this selection yet.'}</p>}
        {leaderboard && !leaderboard.me ? <p className="social-note">Your profile is not ranked on this board. Check your leaderboard visibility setting and eligible study time.</p> : null}
      </section>
    </section>
  );
}
