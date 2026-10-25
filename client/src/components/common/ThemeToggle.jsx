import { useTheme } from '../../hooks/useTheme.js';

export function SunIcon({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

export function MoonIcon({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function ThemeToggle({ variant = 'sidebar', className = '' }) {
  const { toggleTheme, setTheme, isDark } = useTheme();

  if (variant === 'buttons') {
    return (
      <div className={`theme-toggle-segmented ${className}`} role="group" aria-label="Theme preference">
        <button
          type="button"
          className={`theme-segment-btn ${!isDark ? 'active' : ''}`}
          onClick={() => setTheme('light')}
          aria-pressed={!isDark}
        >
          <SunIcon size={15} />
          <span>Light</span>
        </button>
        <button
          type="button"
          className={`theme-segment-btn ${isDark ? 'active' : ''}`}
          onClick={() => setTheme('dark')}
          aria-pressed={isDark}
        >
          <MoonIcon size={15} />
          <span>Dark</span>
        </button>
      </div>
    );
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className={`theme-icon-btn ${className}`}
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <SunIcon size={17} /> : <MoonIcon size={17} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`ghost-button sidebar-theme-toggle ${className}`}
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}

export default ThemeToggle;
