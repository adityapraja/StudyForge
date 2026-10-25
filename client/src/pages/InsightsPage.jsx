export default function InsightsPage({ formatSeconds, loadErrors, insights }) {
  return (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Progress</p>
        <h1>Study insights</h1>
        <p>Rule-based summaries from your study history. Each insight includes the numbers behind it.</p>
      </div>
      {loadErrors.insights ? <p className="error-message" role="alert">{loadErrors.insights}</p> : null}
      {insights.length ? (
        <div className="split-layout">
          {insights.map((insight, index) => (
            <article className="panel insight-card" key={`${insight.kind}-${index}`}>
              <p className="eyebrow">{String(insight.kind || 'insight').replaceAll('_', ' ')}</p>
              <h2>{insight.text}</h2>
              {insight.numbers ? (
                <dl>
                  {Object.entries(insight.numbers).map(([key, value]) => (
                    <div className="insight-number" key={key}>
                      <dt>{key.replaceAll('_', ' ')}</dt>
                      <dd>{key.endsWith('_seconds') ? formatSeconds(value) : value}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p>No supporting figures were returned for this insight.</p>}
            </article>
          ))}
        </div>
      ) : loadErrors.insights ? null : <div className="panel"><p>No insights available yet. Log study sessions and plan goals to build a weekly summary.</p></div>}
    </section>
  );
}
