import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  PageHead, Button, IconBtn, StatCard, StatSkeleton, DataTable, Pagination, EmptyState,
  Modal, TextField, SelectField, Badge, ViewToggle, useViewMode, TableSkeleton, ErrorBlock, ConfirmDialog,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { num, fmtDateTime, initials } from '../lib/format.js';

const EMPTY = { username: '', full_name: '', email: '', role: 'cashier', status: 'active', password: '' };

export function UsersPage() {
  const toast = useToast();
  const { user: me } = useAuth();

  const [view, setView] = useViewMode('users');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [editing, setEditing] = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(null);
  const [busy, setBusy] = useState(false);

  const statsQ = useApi('users/stats');
  const listQ = useApi('users', {
    search: debounced || undefined,
    role: roleFilter || undefined,
    status: statusFilter || undefined,
    page,
    per_page: perPage,
  });

  // simple debounce
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const rows = listQ.data?.data || [];
  const meta = listQ.data?.meta;
  const st = statsQ.data?.stats;

  async function toggleStatus() {
    setBusy(true);
    try {
      const u = confirmToggle;
      await api(`users/${u.id}`, {
        method: 'PUT',
        body: { username: u.username, full_name: u.full_name, email: u.email, role: u.role, status: u.status === 'active' ? 'disabled' : 'active' },
      });
      toast(`Account ${u.status === 'active' ? 'disabled' : 'enabled'}.`);
      setConfirmToggle(null);
      listQ.reload(); statsQ.reload();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy(false);
  }

  return (
    <>
      <PageHead title="User Management" subtitle="Staff accounts, roles and access control">
        <ViewToggle view={view} onChange={setView} />
        <button type="button" className="icon-only-header" onClick={() => { listQ.reload(); statsQ.reload(); }} title="Refresh">
          <Icon name="refresh" size={16} />
        </button>
        <Button icon="plus" onClick={() => setEditing({ ...EMPTY })}>Add user</Button>
      </PageHead>

      {!st && statsQ.loading ? (
        <StatSkeleton />
      ) : st && (
        <div className="stat-row">
          <StatCard label="Total accounts" icon="shield" value={num(st.total)} sub={`${st.online_24h} signed in within 24h`} />
          <StatCard label="Administrators" icon="lock" value={num(st.admins)} tone="red" sub="Full system access" />
          <StatCard label="Managers" icon="edit" value={num(st.managers)} tone="blue" sub="Inventory & reports" />
          <StatCard label="Cashiers" icon="user" value={num(st.cashiers)} tone="green" sub={`${st.disabled} disabled account(s)`} />
        </div>
      )}

      <div className="filter-bar">
        <div className="field grow">
          <input className="input" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field" style={{ minWidth: 150 }}>
          <select className="input" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="cashier">Cashier</option>
          </select>
        </div>
        <div className="field" style={{ minWidth: 150 }}>
          <select className="input" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      <div className="card">
        {listQ.error ? (
          <ErrorBlock message={listQ.error} onRetry={listQ.reload} />
        ) : listQ.loading && !rows.length ? (
          <TableSkeleton cols={5} />
        ) : view === 'list' ? (
          <>
            <DataTable
              columns={[
                {
                  key: 'full_name', label: 'User',
                  render: (u) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <span className="avatar">{initials(u.full_name)}</span>
                      <span><b>{u.full_name}</b> {me?.id === u.id && <Badge tone="navy">You</Badge>}<br /><span className="muted small">@{u.username}{u.email ? ` · ${u.email}` : ''}</span></span>
                    </div>
                  ),
                },
                { key: 'role', label: 'Role', align: 'center', render: (u) => <Badge tone={u.role}>{u.role}</Badge> },
                { key: 'status', label: 'Status', align: 'center', render: (u) => <Badge tone={u.status}>{u.status}</Badge> },
                { key: 'last_login_at', label: 'Last login', render: (u) => u.last_login_at ? fmtDateTime(u.last_login_at) : <span className="muted">Never</span> },
                { key: 'sales_count', label: 'Sales processed', align: 'right' },
              ]}
              rows={rows}
              actions={(u) => (
                <>
                  <IconBtn icon="edit" title="Edit" onClick={() => setEditing({ ...EMPTY, ...u, password: '' })} />
                  {me?.id !== u.id && (
                    <IconBtn
                      icon={u.status === 'active' ? 'lock' : 'check'}
                      title={u.status === 'active' ? 'Disable account' : 'Enable account'}
                      danger={u.status === 'active'}
                      onClick={() => setConfirmToggle(u)}
                    />
                  )}
                </>
              )}
              emptyState={
                <EmptyState
                  icon="shield"
                  title="No users found"
                  message="Add staff accounts so cashiers and managers can use the system."
                />
              }
            />
            <Pagination meta={meta} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} />
          </>
        ) : (
          <div className="card-body">
            <div className="card-grid">
              {rows.map((u) => (
                <div className="entity-card" key={u.id}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span className="avatar" style={{ width: 42, height: 42, fontSize: 15 }}>{initials(u.full_name)}</span>
                    <span>
                      <b style={{ fontSize: 15 }}>{u.full_name}</b> {me?.id === u.id && <Badge tone="navy">You</Badge>}<br />
                      <span className="muted small">@{u.username}</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Badge tone={u.role}>{u.role}</Badge>
                    <Badge tone={u.status}>{u.status}</Badge>
                  </div>
                  <div className="meta">
                    {u.email && <div><Icon name="mail" size={13} />{u.email}</div>}
                    <div><Icon name="clock" size={13} />{u.last_login_at ? `Last login ${fmtDateTime(u.last_login_at)}` : 'Never logged in'}</div>
                    <div><Icon name="shopping-cart" size={13} />{num(u.sales_count)} sales processed</div>
                  </div>
                  <div className="foot">
                    <span className="muted small">ID #{u.id}</span>
                    <span className="inline-actions">
                      <IconBtn icon="edit" title="Edit" onClick={() => setEditing({ ...EMPTY, ...u, password: '' })} />
                      {me?.id !== u.id && (
                        <IconBtn
                          icon={u.status === 'active' ? 'lock' : 'check'}
                          title={u.status === 'active' ? 'Disable account' : 'Enable account'}
                          danger={u.status === 'active'}
                          onClick={() => setConfirmToggle(u)}
                        />
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <Pagination meta={meta} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} />
          </div>
        )}
      </div>

      {editing && (
        <UserFormModal
          form={editing}
          isSelf={me?.id === editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => { listQ.reload(); statsQ.reload(); }}
        />
      )}

      {confirmToggle && (
        <ConfirmDialog
          danger={confirmToggle.status === 'active'}
          title={confirmToggle.status === 'active' ? `Disable "${confirmToggle.full_name}"?` : `Enable "${confirmToggle.full_name}"?`}
          message={
            confirmToggle.status === 'active'
              ? 'The user will be signed out everywhere and unable to sign in until re-enabled.'
              : 'The user will regain access immediately.'
          }
          confirmLabel={confirmToggle.status === 'active' ? 'Disable' : 'Enable'}
          busy={busy}
          onConfirm={toggleStatus}
          onClose={() => setConfirmToggle(null)}
        />
      )}
    </>
  );
}

function UserFormModal({ form, isSelf, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(form.id);
  const [f, setF] = useState(form);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    const errs = {};
    if (!f.full_name.trim()) errs.full_name = 'Full name is required.';
    if (!f.username.trim()) errs.username = 'Username is required.';
    if (!isEdit && f.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const body = {
        username: f.username.trim(),
        full_name: f.full_name.trim(),
        email: f.email.trim() || null,
        role: isSelf ? undefined : f.role,
        status: f.status,
      };
      if (f.password) body.password = f.password;
      if (isEdit) {
        await api(`users/${f.id}`, { method: 'PUT', body });
        toast('User updated.');
      } else {
        body.role = f.role;
        await api('users', { method: 'POST', body });
        toast('User created.');
      }
      onSaved();
      onClose();
    } catch (e) {
      setErrors({ _global: e.message });
    }
    setBusy(false);
  }

  return (
    <Modal
      title={isEdit ? `Edit user — ${form.full_name}` : 'New user'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon="save" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save user'}</Button>
        </>
      }
    >
      {errors._global && <div className="login-alert"><span>{errors._global}</span></div>}
      <div className="form-grid">
        <TextField label="Full name" required value={f.full_name} onChange={set('full_name')} error={errors.full_name} />
        <TextField label="Username" required value={f.username} onChange={set('username')} error={errors.username} />
        <TextField label="Email" type="email" value={f.email || ''} onChange={set('email')} />
        <SelectField
          label="Role"
          required
          value={f.role}
          onChange={set('role')}
          disabled={isSelf}
          hint={isSelf ? 'You cannot change your own role.' : undefined}
          options={[
            { value: 'admin', label: 'Administrator — full access' },
            { value: 'manager', label: 'Manager — inventory & reports' },
            { value: 'cashier', label: 'Cashier — register only' },
          ]}
        />
        <SelectField
          label="Status"
          value={f.status}
          onChange={set('status')}
          options={[{ value: 'active', label: 'Active' }, { value: 'disabled', label: 'Disabled' }]}
        />
        <TextField
          label={isEdit ? 'New password (optional)' : 'Password'}
          type="password"
          required={!isEdit}
          value={f.password}
          onChange={set('password')}
          error={errors.password}
          placeholder={isEdit ? 'Leave blank to keep current password' : 'Minimum 8 characters'}
        />
      </div>
    </Modal>
  );
}
