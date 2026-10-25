import { useState } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { useAppData } from './hooks/useAppData.js';
import { useTimer } from './hooks/useTimer.js';
import Sidebar from './components/layout/Sidebar.jsx';
import DotGrid from './components/common/DotGrid.jsx';
import {
  AuthPage,
  DashboardPage,
  TimerPage,
  PlannerPage,
  SubjectsPage,
  StatisticsPage,
  SyllabusPage,
  ExamsPage,
  InsightsPage,
  WeeklyGoalsPage,
  FriendsPage,
  LeaderboardPage,
  SettingsPage,
} from './pages/index.js';
import { formatSeconds, toClock } from './utils/time.js';
import { localDateAt, daysInYear, dateAtYearDay } from './utils/date.js';
import { getSubjectName, normalizeList } from './utils/helpers.js';
import { CURRENT_YEAR } from './utils/constants.js';

export default function App() {
  const { user, setUser, isAuthenticated, checkingAuth, handleLogout } = useAuth();
  const [mode, setMode] = useState(() => localStorage.getItem('studyforge_nav_mode') || 'dashboard');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const appData = useAppData(isAuthenticated, user, mode);
  const timer = useTimer({
    activeSession: appData.activeSession,
    setActiveSession: appData.setActiveSession,
    subjects: appData.subjects,
    refreshProgress: appData.refreshProgress,
    setSuccessMessage: appData.setSuccessMessage,
    setLoadErrors: appData.setLoadErrors,
  });

  const handleNavChange = (newMode) => {
    if (mode !== newMode && (newMode === 'friends' || newMode === 'leaderboard')) {
      appData.setSocialLoading(true);
    }
    if (mode !== newMode && newMode === 'leaderboard') {
      appData.setLeaderboard(null);
    }
    setMode(newMode);
    localStorage.setItem('studyforge_nav_mode', newMode);
    appData.setSuccessMessage('');
    if (newMode === 'syllabus' && !appData.syllabusSubjectId && appData.subjects[0]) {
      appData.loadSyllabus(appData.subjects[0].id);
    }
  };

  const handleSettingsSaveWrapper = (event) => {
    return appData.handleSettingsSave(event, (updatedUser) => {
      setUser(updatedUser);
    });
  };

  const handleAccountDeleteWrapper = () => {
    return appData.handleAccountDelete(() => {
      handleLogout();
    });
  };

  if (checkingAuth) {
    return <main className="auth-shell" aria-live="polite">Checking your session…</main>;
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  const pageProps = {
    ...appData,
    ...timer,
    user,
    setMode: handleNavChange,
    formatSeconds,
    toClock,
    getSubjectName,
    normalizeList,
    CURRENT_YEAR,
    daysInYear,
    dateAtYearDay,
    localDateAt,
    handleLogout,
    handleSettingsSave: handleSettingsSaveWrapper,
    handleAccountDelete: handleAccountDeleteWrapper,
  };

  const pages = {
    dashboard: <DashboardPage {...pageProps} />,
    subjects: <SubjectsPage {...pageProps} />,
    timer: <TimerPage {...pageProps} />,
    planner: <PlannerPage {...pageProps} />,
    statistics: <StatisticsPage {...pageProps} />,
    syllabus: <SyllabusPage {...pageProps} />,
    exams: <ExamsPage {...pageProps} />,
    insights: <InsightsPage {...pageProps} />,
    goals: <WeeklyGoalsPage {...pageProps} />,
    friends: <FriendsPage {...pageProps} />,
    leaderboard: <LeaderboardPage {...pageProps} />,
    settings: <SettingsPage {...pageProps} />,
  };

  return (
    <div className="app-shell app-layout-sidebar">
      <div className="page-bg">
        <DotGrid
          baseColor="#ebebeb"
          activeColor="#0a0a0a"
          shape="circle"
          dotSize={3}
          gap={26}
          proximity={120}
          shockRadius={260}
          shockStrength={4}
          returnDuration={0.8}
          glow={0.2}
          opacity={0.5}
        />
      </div>

      {/* Mobile Top Header */}
      <header className="mobile-header">
        <button
          type="button"
          className="mobile-nav-toggle"
          onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
          aria-label="Toggle navigation"
        >
          ☰
        </button>
        <div className="mobile-brand">
          <img src="/studyforge.svg" alt="StudyForge" width="24" height="24" />
          <strong>StudyForge</strong>
        </div>
        <span className="mobile-user">{user?.username}</span>
      </header>

      {/* Left Navigation Sidebar */}
      <Sidebar
        mode={mode}
        onNavChange={handleNavChange}
        user={user}
        onLogout={handleLogout}
        isMobileOpen={isMobileNavOpen}
        setIsMobileOpen={setIsMobileNavOpen}
      />

      <div className="app-main-area">
        <main className="app-content">
          {Object.entries(appData.loadErrors)
            .filter(
              ([key, message]) =>
                Boolean(message) &&
                ![
                  'auth', 'settings', 'export', 'subjects', 'timer', 'planner',
                  'statistics', 'heatmap', 'syllabus', 'exams', 'insights',
                  'goals', 'social', 'friends', 'friendRequests', 'blockedUsers',
                  'leaderboard',
                ].includes(key)
            )
            .map(([key, message]) => (
              <p className="error-message" role="alert" key={key}>
                {key}: {message}
              </p>
            ))}
          {pages[mode] || pages.dashboard}
        </main>
      </div>
    </div>
  );
}
