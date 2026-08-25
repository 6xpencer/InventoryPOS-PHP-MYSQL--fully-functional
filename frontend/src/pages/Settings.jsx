import { useEffect, useRef, useState } from 'react';
import { api, download, uploadFile } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHead, Button, TextField, TextArea, StatCard, ErrorBlock } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const TABS = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'backup', label: 'Data Backup', icon: 'box' },
];

export function SettingsPage() {
  const toast = useToast();
  const { settings, refreshSettings } = useAuth();
  const [active, setActive] = useState('general');
  const [f, setF] = useState(null);
  const [system, setSystem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function load() {
    try {
      const res = await api('settings');
      setF(res.settings);
      setSystem(res.system);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function save(e) {
    if (e) e.preventDefault();
    setBusy(true);
    try {
      await api('settings', { method: 'PUT', body: f });
      await refreshSettings();
      toast('Settings saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
    setBusy(false);
  }

  function doBackup(format) {
    download('settings/backup', { format }, `apexpos-backup.${format}`).catch((e) => toast(e.message, 'error'));
  }

  async function onRestoreFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('Restoring will replace ALL current data with the contents of this backup. This cannot be undone. Continue?')) {
      return;
    }
    setBusy(true);
    try {
      const res = await uploadFile('settings/restore', file);
      toast(`Backup restored (${res.statements} statements). You will be signed out — please log in again.`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast(err.message, 'error');
    }
    setBusy(false);
  }

  if (error) return <ErrorBlock message={error} onRetry={load} />;
  if (!f) return null;

  return (
    <>
      <PageHead title="Settings" subtitle="Configure the system and manage your data">
        <button type="button" className="icon-only-header" onClick={load} title="Reload">
          <Icon name="refresh" size={16} />
        </button>
        {active !== 'backup' && (
          <Button icon="save" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
        )}
      </PageHead>

      <div className="settings-layout">
        <nav className="settings-nav card">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`settings-nav-item${active === t.id ? ' active' : ''}`}
              onClick={() => setActive(t.id)}
            >
              <Icon name={t.icon} size={16} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-panel">
          {active === 'general' && (
            <>
              <div className="grid-2">
                <div className="card">
                  <div className="card-head"><h3>Store information</h3></div>
                  <div className="card-body">
                    <div className="form-grid">
                      <TextField label="Store name" required value={f.store_name} onChange={set('store_name')} hint="Shown on the login page and receipts." />
                      <TextField label="Store phone" value={f.store_phone || ''} onChange={set('store_phone')} />
                      <TextField label="Store email" type="email" value={f.store_email || ''} onChange={set('store_email')} />
                      <TextArea label="Store address" value={f.store_address || ''} onChange={set('store_address')} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div className="card">
                    <div className="card-head"><h3>Financial defaults</h3></div>
                    <div className="card-body">
                      <div className="form-grid">
                        <TextField label="Currency symbol" required value={f.currency_symbol} onChange={set('currency_symbol')} hint="Used across the entire app." />
                        <TextField
                          label="Sales tax rate (%)"
                          required
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={f.tax_rate}
                          onChange={set('tax_rate')}
                          hint="Applied automatically at checkout."
                        />
                      </div>
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-head"><h3>Receipt</h3></div>
                    <div className="card-body">
                      <TextField label="Receipt footer message" value={f.receipt_footer || ''} onChange={set('receipt_footer')} hint="Printed at the bottom of every receipt." />
                    </div>
                  </div>
                </div>
              </div>

              <h4 style={{ margin: '22px 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-soft)' }}>
                System information
              </h4>
              <div className="stat-row" style={{ marginBottom: 0 }}>
                <StatCard label="PHP version" icon="activity" value={system?.php_version || '—'} tone="" />
                <StatCard label="MySQL version" icon="activity" value={system?.mysql_version?.split('-')[0] || '—'} tone="blue" />
                <StatCard label="Server time" icon="clock" value={<span style={{ fontSize: 17 }}>{system?.server_time || '—'}</span>} tone="green" sub={`Timezone ${system?.timezone || ''}`} />
                <StatCard label="Current tax rate" icon="percent" value={`${settings.tax_rate}%`} tone="amber" sub={`Currency ${settings.currency_symbol}`} />
              </div>
            </>
          )}

          {active === 'notifications' && (
            <div className="card">
              <div className="card-head"><h3>Notifications</h3></div>
              <div className="card-body">
                <div className="switch-row">
                  <div>
                    <div className="switch-title">Low-stock alerts</div>
                    <div className="muted small">Show a bell notification for products at or below their reorder level.</div>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={String(f.low_stock_alerts) === '1'}
                      onChange={(e) => setF((x) => ({ ...x, low_stock_alerts: e.target.checked ? '1' : '0' }))}
                    />
                    <span className="slider" />
                  </label>
                </div>
                <p className="muted small" style={{ marginTop: 14 }}>Use the “Save changes” button above to apply.</p>
              </div>
            </div>
          )}

          {active === 'backup' && (
            <>
              <div className="card">
                <div className="card-head"><h3>Database backup</h3></div>
                <div className="card-body">
                  <p className="muted" style={{ marginTop: 0 }}>
                    Download a copy of your entire database. Keep these files safe — they are the only way to recover your data if something goes wrong.
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                    <Button icon="download" onClick={() => doBackup('sql')}>Download SQL backup</Button>
                    <Button icon="download" variant="secondary" onClick={() => doBackup('json')}>Download JSON backup</Button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h3>Restore from backup</h3></div>
                <div className="card-body">
                  <p className="muted" style={{ marginTop: 0 }}>
                    Upload a <code>.sql</code> backup created by this system. This replaces all current data and cannot be undone. You will be signed out afterwards.
                  </p>
                  <input ref={fileRef} type="file" accept=".sql" style={{ display: 'none' }} onChange={onRestoreFile} />
                  <Button icon="rotate-ccw" variant="secondary" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>
                    {busy ? 'Restoring…' : 'Restore from SQL file'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
