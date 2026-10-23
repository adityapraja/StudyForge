export default function FriendsPage({ formatSeconds, loadErrors, friends, blockedUsers, friendRequests, friendUsername, setFriendUsername, socialLoading, successMessage, handleFriendRequestSubmit, handleFriendRequestAction, handleFriendRemove, handleBlockUser, handleUnblockUser }) {
  return (
    <section className="page-shell">
      <div className="section-heading">
        <p className="eyebrow">Social</p>
        <h1>Study with friends</h1>
        <p>Send requests by username and manage the people you share progress with.</p>
      </div>
      {loadErrors.social || loadErrors.friends || loadErrors.friendRequests || loadErrors.blockedUsers ? (
        <p className="error-message" role="alert">{loadErrors.social || loadErrors.friends || loadErrors.friendRequests || loadErrors.blockedUsers}</p>
      ) : null}
      {successMessage ? <p className="success-message" role="status">{successMessage}</p> : null}
      <form className="panel friend-request-form" onSubmit={handleFriendRequestSubmit}>
        <h2>Add a friend</h2>
        <label>
          <span>Username</span>
          <input
            type="text"
            value={friendUsername}
            onChange={(event) => setFriendUsername(event.target.value)}
            minLength="3"
            maxLength="20"
            pattern="[A-Za-z0-9_]+"
            required
            aria-label="Username to send a friend request to"
          />
        </label>
        <button type="submit" className="primary-button" disabled={socialLoading}>Send request</button>
      </form>

      <div className="split-layout top-gap">
        <section className="panel" aria-labelledby="incoming-requests-heading">
          <div className="panel-header"><h2 id="incoming-requests-heading">Incoming requests</h2></div>
          {friendRequests.incoming.length ? (
            <ul className="list-stack">
              {friendRequests.incoming.map((item) => (
                <li key={item.id} className="social-row">
                  <span>{item.from?.username || 'Unknown user'}</span>
                  <div className="row-actions">
                    <button type="button" className="primary-button" onClick={() => handleFriendRequestAction(item.id, 'accept')}>Accept</button>
                    <button type="button" className="ghost-button" onClick={() => handleFriendRequestAction(item.id, 'decline')}>Decline</button>
                    {item.from?.id ? <button type="button" className="ghost-button danger" onClick={() => handleBlockUser(item.from)}>Block</button> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : loadErrors.friendRequests ? null : <p>{socialLoading ? 'Loading requests…' : 'No incoming requests.'}</p>}
        </section>

        <section className="panel" aria-labelledby="outgoing-requests-heading">
          <div className="panel-header"><h2 id="outgoing-requests-heading">Sent requests</h2></div>
          {friendRequests.outgoing.length ? (
            <ul className="list-stack">
              {friendRequests.outgoing.map((item) => (
                <li key={item.id} className="social-row">
                  <span>{item.to?.username || 'Unknown user'}</span>
                  {item.to?.id ? <button type="button" className="ghost-button danger" onClick={() => handleBlockUser(item.to)}>Block</button> : null}
                </li>
              ))}
            </ul>
          ) : loadErrors.friendRequests ? null : <p>{socialLoading ? 'Loading requests…' : 'No pending sent requests.'}</p>}
        </section>
      </div>

      <section className="panel top-gap" aria-labelledby="friends-heading">
        <div className="panel-header"><h2 id="friends-heading">Your friends</h2></div>
        {friends.length ? (
          <ul className="list-stack">
            {friends.map((friend) => (
              <li key={friend.user_id} className="friend-row">
                <div>
                  <strong>{friend.username}</strong>
                  <p>Level {friend.level} · {friend.streak_current}-day streak · {friend.week_seconds == null ? 'Weekly time hidden' : `${formatSeconds(friend.week_seconds)} this week`}</p>
                  {friend.subjects == null
                    ? <p>Subject time hidden</p>
                    : friend.subjects.length
                      ? <p>{friend.subjects.map((subject) => `${subject.name}: ${formatSeconds(subject.seconds)}`).join(' · ')}</p>
                      : <p>No subject time logged this week.</p>}
                </div>
                <div className="row-actions">
                  <button type="button" className="ghost-button danger" onClick={() => handleFriendRemove(friend)}>Remove</button>
                  <button type="button" className="ghost-button danger" onClick={() => handleBlockUser({ id: friend.user_id, username: friend.username })}>Block</button>
                </div>
              </li>
            ))}
          </ul>
        ) : loadErrors.friends ? null : <p>{socialLoading ? 'Loading friends…' : 'No friends yet. Send a request by username to get started.'}</p>}
      </section>
      <section className="panel top-gap" aria-labelledby="blocked-users-heading">
        <div className="panel-header"><h2 id="blocked-users-heading">Blocked users</h2></div>
        {blockedUsers.length ? (
          <ul className="list-stack">
            {blockedUsers.map((person) => (
              <li key={person.user_id} className="social-row">
                <span>{person.username}</span>
                <button type="button" className="ghost-button" onClick={() => handleUnblockUser(person)}>Unblock</button>
              </li>
            ))}
          </ul>
        ) : loadErrors.blockedUsers ? null : <p>{socialLoading ? 'Loading blocked users…' : 'You have not blocked anyone.'}</p>}
      </section>
      <p className="social-note">Friends’ weekly study time is shown only when allowed by their privacy settings. There is no live study status.</p>
    </section>
  );
}
