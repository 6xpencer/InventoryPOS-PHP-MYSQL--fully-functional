import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, getToken, onUnauthorized } from '../api/client.js';
import { navigate } from '../router.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState({ store_name: 'Apex POS', currency_symbol: '$', tax_rate: '12', receipt_footer: '' });
  const [booting, setBooting] = useState(true);

  const loadSession = useCallback(async () => {
    if (!getToken()) {
      setBooting(false);
      return;
    }
    try {
      const me = await api('auth/me');
      setUser(me.user);
      try {
        const s = await api('settings');
        setSettings(s.settings);
      } catch {
        /* settings optional */
      }
    } catch {
      setToken(null);
    }
    setBooting(false);
  }, []);

  useEffect(() => {
    onUnauthorized(() => {
      setUser(null);
      navigate('/login');
    });
    loadSession();
  }, [loadSession]);

  const signIn = useCallback((token, userData) => {
    setToken(token);
    setUser(userData);
    api('settings')
      .then((s) => setSettings(s.settings))
      .catch(() => {});
  }, []);

  const refreshSettings = useCallback(async () => {
    const s = await api('settings');
    setSettings(s.settings);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setToken(null);
    setUser(null);
    navigate('/login');
  }, []);

  return (
    <AuthContext.Provider value={{ user, booting, settings, signIn, signOut, refreshSettings }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
