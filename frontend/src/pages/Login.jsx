import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, TextField } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import loginImg from '../assets/login.jpg';

export function LoginPage() {
  const { signIn, settings: ctxSettings } = useAuth();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checking, setChecking] = useState(true);
  const [storeName, setStoreName] = useState('Apex POS');
  const [form, setForm] = useState({ username: '', password: '', full_name: '', email: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    document.title = 'Sign in — Apex POS';
    (async () => {
      try {
        const status = await api('auth/status');
        setNeedsSetup(status.needs_setup);
        const pub = await api('settings/public');
        if (pub.settings?.store_name) setStoreName(pub.settings.store_name);
      } catch {
        setError('Cannot reach the server. Verify Apache and MySQL are running.');
      }
      setChecking(false);
    })();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = needsSetup
        ? await api('auth/setup', { method: 'POST', body: form })
        : await api('auth/login', { method: 'POST', body: { username: form.username, password: form.password } });
      signIn(res.token, res.user);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="login-page">
      <div className="login-hero" style={{ backgroundImage: `linear-gradient(205deg, rgba(15,36,56,.72) 0%, rgba(22,50,79,.42) 45%, rgba(15,36,56,.85) 100%), url(${loginImg})` }}>
        <div className="hero-brand">
          <span className="brand-mark">A</span>
          <span style={{ fontWeight: 700, letterSpacing: '0.08em', fontSize: 17 }}>APEX POS</span>
        </div>
        <blockquote>
          <p>Inventory precision and point-of-sale speed, unified in one professional workspace.</p>
          <cite>{storeName} — Management Suite</cite>
        </blockquote>
        <div className="hero-stats">
          <div className="stat"><b>Real-time</b><span>Stock sync</span></div>
          <div className="stat"><b>Insightful</b><span>Page analytics</span></div>
          <div className="stat"><b>Secure</b><span>Role-based</span></div>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-box">
          <div className="login-logo">
            <span className="brand-mark" style={{ width: 44, height: 44, fontSize: 20 }}>A</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '0.06em' }}>{ctxSettings?.store_name || storeName}</div>
              <div className="muted small">INVENTORY &amp; SALES SUITE</div>
            </div>
          </div>

          {checking ? (
            <div className="spinner" />
          ) : (
            <>
              <h1>{needsSetup ? 'Welcome' : 'Sign in'}</h1>
              <p className="sub">
                {needsSetup
                  ? 'This is a fresh installation with no users yet. Create your administrator account to begin.'
                  : `Use your ${storeName} credentials to access the dashboard.`}
              </p>

              {error && (
                <div className="login-alert">
                  <Icon name="alert-triangle" size={15} />
                  {error}
                </div>
              )}

              <form onSubmit={submit}>
                {needsSetup && (
                  <>
                    <TextField label="Full name" required value={form.full_name} onChange={set('full_name')} placeholder="e.g. Alex Morgan" />
                    <TextField label="Email (optional)" type="email" value={form.email} onChange={set('email')} placeholder="admin@company.com" />
                  </>
                )}
                <TextField
                  label="Username"
                  required
                  value={form.username}
                  onChange={set('username')}
                  placeholder="your.username"
                  autoComplete="username"
                />
                <TextField
                  label="Password"
                  type="password"
                  required
                  value={form.password}
                  onChange={set('password')}
                  placeholder={needsSetup ? 'Minimum 8 characters' : '••••••••'}
                  autoComplete={needsSetup ? 'new-password' : 'current-password'}
                />
                <Button block icon="lock" disabled={busy} style={{ marginTop: 6 }}>
                  {busy ? 'Please wait…' : needsSetup ? 'Create administrator & sign in' : 'Sign in'}
                </Button>
              </form>

              {!needsSetup && (
                <p className="login-footnote">
                  Access is role-based: admins manage everything, managers handle inventory &amp; reports,
                  cashiers operate the register.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
