import { createContext, useEffect, useState } from 'react';
import { request } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [formError, setFormError] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let active = true;
    request('/api/me')
      .then((profile) => {
        if (!active) return;
        setUser(profile);
        setIsAuthenticated(true);
      })
      .catch((error) => {
        if (active && error.status !== 401) {
          setAuthError(error.message);
        }
      })
      .finally(() => {
        if (active) setCheckingAuth(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      email: formData.get('email'),
      password: formData.get('password'),
      username: formData.get('username') || undefined,
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      category: formData.get('category') || 'college',
    };

    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await request(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUser(response);
      setFormError('');
      setAuthError('');
      setIsAuthenticated(true);
      form.reset();
    } catch (error) {
      setFormError(error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      setAuthError(error.message);
    }
    localStorage.removeItem('studyforge_nav_mode');
    localStorage.removeItem('studyforge_active_timer');
    localStorage.removeItem('studyforge_session_note');
    setIsAuthenticated(false);
    setUser(null);
    setAuthMode('login');
  };

  const value = {
    user,
    setUser,
    isAuthenticated,
    setIsAuthenticated,
    checkingAuth,
    authMode,
    setAuthMode,
    formError,
    setFormError,
    authError,
    handleAuthSubmit,
    handleLogout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
