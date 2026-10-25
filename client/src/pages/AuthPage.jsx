import DotGrid from '../components/common/DotGrid.jsx';
import { useAuth } from '../hooks/useAuth.js';

export default function AuthPage(props) {
  const authContext = useAuth();

  const authMode = props.authMode ?? authContext?.authMode ?? 'login';
  const setAuthMode = props.setAuthMode ?? authContext?.setAuthMode ?? (() => {});
  const loadErrors = props.loadErrors ?? (authContext?.authError ? { auth: authContext.authError } : {});
  const formError = props.formError ?? authContext?.formError;
  const handleAuthSubmit = props.handleAuthSubmit ?? authContext?.handleAuthSubmit;

  return (
    <div className="auth-shell">
      <div className="auth-bg">
        <DotGrid
          baseColor="#e0e0e0"
          activeColor="#0a0a0a"
          shape="circle"
          dotSize={4}
          gap={22}
          proximity={140}
          shockRadius={320}
          shockStrength={5}
          returnDuration={0.8}
          glow={0.3}
          opacity={0.85}
        />
      </div>
      <div className="auth-card">
        <div className="auth-header">
          <img src="/studyforge.svg" alt="StudyForge Logo" className="auth-logo" width="44" height="44" />
          <p className="eyebrow">Study Habit Tracker</p>
          <h1>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        </div>
        {loadErrors?.auth ? <p className="error-message" role="alert">{loadErrors.auth}</p> : null}
        {formError ? <p className="error-message" role="alert">{formError}</p> : null}

        <div className="mode-toggle">
          <button type="button" className={authMode === 'login' ? 'primary-button' : 'ghost-button'} onClick={() => setAuthMode('login')}>Login</button>
          <button type="button" className={authMode === 'register' ? 'primary-button' : 'ghost-button'} onClick={() => setAuthMode('register')}>Register</button>
        </div>

        <form className="stack-form" onSubmit={handleAuthSubmit}>
          {authMode === 'register' ? (
            <>
              <label><span>Username</span><input name="username" type="text" required minLength="3" maxLength="20" pattern="[A-Za-z0-9_]+" /></label>
              <label><span>Category</span>
                <select name="category" defaultValue="college">
                  <option value="school">School</option><option value="college">College</option><option value="competitive_exams">Competitive exams</option><option value="professional">Professional</option>
                </select>
              </label>
            </>
          ) : null}
          <label>
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            <span>Password</span>
            <input name="password" type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength="8" required />
          </label>
          <button type="submit" className="primary-button">{authMode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
      </div>
    </div>
  );
}
