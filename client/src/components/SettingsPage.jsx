export default function SettingsPage({ user, loadErrors, goals, successMessage, handleLogout, handleDownloadCsv, handleSettingsSave, handleAccountDelete }) {
  return (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Settings</p>
        <h1>Control your profile</h1>
      </div>
      {loadErrors.settings || loadErrors.export ? <p className="error-message" role="alert">{loadErrors.settings || loadErrors.export}</p> : null}
      {successMessage ? <p className="success-message" role="status">{successMessage}</p> : null}
      <form className="stack-form" onSubmit={handleSettingsSave}>
        <div className="split-layout">
          <div className="panel stack-form">
            <h2>Profile and goals</h2>
            <label><span>Username</span><input name="username" defaultValue={user.username} minLength="3" maxLength="20" required /></label>
            <label><span>Time zone (IANA)</span><input name="time_zone" defaultValue={user.time_zone} required /></label>
            <label><span>Category</span>
              <select name="category" defaultValue={user.category}>
                <option value="school">School</option>
                <option value="college">College</option>
                <option value="competitive_exams">Competitive exams</option>
                <option value="professional">Professional</option>
              </select>
            </label>
            <label><span>Daily target (hours)</span><input name="daily_hours" type="number" min="0" step="0.5" defaultValue={(goals?.daily_target_seconds ?? user.daily_target_seconds ?? 0) / 3600} required /></label>
            <label><span>Weekly target (hours)</span><input name="weekly_hours" type="number" min="0" step="0.5" defaultValue={(goals?.weekly_target_seconds ?? user.weekly_target_seconds ?? 0) / 3600} required /></label>
            <label><span>Streak minimum (minutes)</span><input name="streak_minimum_minutes" type="number" min="1" defaultValue={goals?.streak_minimum_minutes ?? user.streak_minimum_minutes ?? 15} required /></label>
          </div>
          <div className="panel stack-form">
            <h2>Privacy and account</h2>
            <label><span>Weekly time visibility</span>
              <select name="weekly_time" defaultValue={user.privacy?.weekly_time || 'friends'}>
                <option value="everyone">Everyone</option><option value="friends">Friends</option><option value="nobody">Nobody</option>
              </select>
            </label>
            <label><span>Subject visibility</span>
              <select name="subjects" defaultValue={user.privacy?.subjects || 'friends'}>
                <option value="everyone">Everyone</option><option value="friends">Friends</option><option value="nobody">Nobody</option>
              </select>
            </label>
            <label className="inline-setting"><input type="checkbox" name="leaderboard_hidden" defaultChecked={user.leaderboard_hidden} /><span>Hide my profile from leaderboards</span></label>
            <button type="button" className="ghost-button" onClick={handleDownloadCsv}>Download session CSV</button>
            <button type="button" className="ghost-button danger" onClick={handleAccountDelete}>Delete account and data</button>
            <button type="button" className="ghost-button" onClick={handleLogout}>Log out</button>
          </div>
        </div>
        <div className="footer-actions"><button type="submit" className="primary-button">Save settings</button></div>
      </form>
    </section>
  );
}
