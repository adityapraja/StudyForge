import { NAV_ITEMS } from '../../utils/constants.js';

export default function Header({ mode, onNavChange, username, onLogout }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand-block">
          <img src="/studyforge.svg" alt="StudyForge Logo" className="brand-logo" width="28" height="28" />
          <div>
            <p className="eyebrow">Tracker</p>
            <strong>Study Forge</strong>
          </div>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(([item, label]) => (
            <button
              key={item}
              type="button"
              aria-current={mode === item ? 'page' : undefined}
              className={mode === item ? 'nav-button active' : 'nav-button'}
              onClick={() => onNavChange(item)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="user-block">
          <span>{username}</span>
          <button type="button" className="ghost-button" onClick={onLogout}>Logout</button>
        </div>
      </div>
    </header>
  );
}

