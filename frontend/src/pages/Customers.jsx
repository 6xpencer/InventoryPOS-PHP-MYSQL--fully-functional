import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  PageHead, Button, IconBtn, StatCard, StatSkeleton, DataTable, Pagination, EmptyState,
  Modal, TextField, TextArea, ConfirmDialog, Badge, ViewToggle, useViewMode, TableSkeleton, ErrorBlock,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { money, num, fmtDate, initials, downloadCsv } from '../lib/format.js';

const EMPTY = { name: '', phone: '', email: '', address: '' };

export function CustomersPage() {
  const { settings, user } = useAuth();
  const toast = useToast();
  const sym = settings.currency_symbol || '$';
  const canManage = ['admin', 'manager'].includes(user.role);

  const [view, setView] = useViewMode('customers');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const statsQ = useApi('customers/stats');
  const listQ = useApi('customers', { search: debounced || undefined, page, per_page: perPage });
  const rows = listQ.data?.data || [];
  const meta = listQ.data?.meta;
  const st = statsQ.data?.stats;

  async function handleDelete() {
    setBusy(true);
    try {
      await api(`customers/${confirmDelete.id}`, { method: 'DELETE' });
      toast('Customer deleted.');
      setConfirmDelete(null);
      listQ.reload(); statsQ.reload();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy(false);
  }

  function exportCsv() {
    downloadCsv('customers.csv', [
      { key: 'name', label: 'Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'address', label: 'Address' },
      { key: 'orders_count', label: 'Orders' },
      { key: 'total_spent', label: `Total spent (${sym})` },
    ], rows);
  }

  return (
    <>
      <PageHead title="Customers" subtitle="Client directory and purchase history">
        <ViewToggle view={view} onChange={setView} />
        <button type="button" className="icon-only-header" onClick={() => { listQ.reload(); statsQ.reload(); }} title="Refresh">
          <Icon name="refresh" size={16} />
        </button>
        <Button icon="download" variant="secondary" onClick={exportCsv}>Export CSV</Button>
        <Button icon="plus" onClick={() => setEditing({ ...EMPTY })}>Add customer</Button>
      </PageHead>

      {!st && statsQ.loading ? (
        <StatSkeleton />
      ) : st && (
        <div className="stat-row">
          <StatCard label="Customers" icon="users" value={num(st.total)} sub={`${st.new_month} added in last 30 days`} />
          <StatCard label="With purchases" icon="shopping-cart" value={num(st.with_orders)} tone="blue" />
          <StatCard
            label="Top customer"
            icon="trending-up"
            value={st.top_name || '—'}
            tone="green"
            sub={st.top_name ? `Spent ${money(st.top_spent, sym)}` : 'No sales yet'}
          />
          <StatCard label="New this month" icon="activity" value={num(st.new_month)} tone="amber" sub="Rolling 30 days" />
        </div>
      )}

      <div className="filter-bar">
        <div className="field grow">
          <input className="input" placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  key: 'name', label: 'Customer',
                  render: (c) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <span className="avatar">{initials(c.name)}</span>
                      <span><b>{c.name}</b><br /><span className="muted small">Since {fmtDate(c.created_at)}</span></span>
                    </div>
                  ),
                },
                { key: 'phone', label: 'Contact', render: (c) => (<span>{c.phone || '—'}<br /><span className="muted small">{c.email || ''}</span></span>) },
                { key: 'address', label: 'Address', render: (c) => c.address || <span className="muted">—</span> },
                { key: 'orders_count', label: 'Orders', align: 'right', render: (c) => <Badge tone={c.orders_count > 0 ? 'blue' : 'gray'}>{c.orders_count}</Badge> },
                { key: 'total_spent', label: 'Total spent', align: 'right', render: (c) => <b>{money(c.total_spent, sym)}</b> },
              ]}
              rows={rows}
              actions={(c) => (
                <>
                  <IconBtn icon="edit" title="Edit" onClick={() => setEditing({ ...c })} />
                  {canManage && <IconBtn icon="trash" title="Delete" danger onClick={() => setConfirmDelete(c)} />}
                </>
              )}
              emptyState={
                <EmptyState
                  icon="users"
                  title="No customers yet"
                  message="Add regular customers to track their purchases — or sell as walk-in at the register."
                  actionLabel="Add your first customer"
                  onAction={() => setEditing({ ...EMPTY })}
                />
              }
            />
            <Pagination meta={meta} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} />
          </>
        ) : (
          <>
            <div className="card-body">
              {rows.length === 0 ? (
                <EmptyState icon="users" title="No customers yet" message="Add customers to build purchase history." actionLabel="Add customer" onAction={() => setEditing({ ...EMPTY })} />
              ) : (
                <div className="card-grid">
                  {rows.map((c) => (
                    <div className="entity-card" key={c.id}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span className="avatar" style={{ width: 42, height: 42, fontSize: 15 }}>{initials(c.name)}</span>
                        <span>
                          <b style={{ fontSize: 15 }}>{c.name}</b><br />
                          <span className="muted small">Since {fmtDate(c.created_at)}</span>
                        </span>
                      </div>
                      <div className="meta">
                        {c.phone && <div><Icon name="phone" size={13} />{c.phone}</div>}
                        {c.email && <div><Icon name="mail" size={13} />{c.email}</div>}
                        {c.address && <div><Icon name="map-pin" size={13} />{c.address}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <Badge tone="blue">{c.orders_count} orders</Badge>
                        <Badge tone="green">{money(c.total_spent, sym)}</Badge>
                      </div>
                      <div className="foot">
                        <span className="muted small">{c.last_order_at ? `Last order ${fmtDate(c.last_order_at)}` : 'No orders yet'}</span>
                        <span className="inline-actions">
                          <IconBtn icon="edit" title="Edit" onClick={() => setEditing({ ...c })} />
                          {canManage && <IconBtn icon="trash" title="Delete" danger onClick={() => setConfirmDelete(c)} />}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Pagination meta={meta} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} />
          </>
        )}
      </div>

      {editing && (
        <Modal
          title={editing.id ? `Edit customer — ${editing.name}` : 'New customer'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button icon="save" onClick={() => saveCustomer(editing, toast, () => { setEditing(null); listQ.reload(); statsQ.reload(); })}>Save</Button>
            </>
          }
        >
          <div className="form-grid">
            <TextField label="Full name" required value={editing.name} onChange={(v) => setEditing((x) => ({ ...x, name: v }))} />
            <TextField label="Phone" value={editing.phone || ''} onChange={(v) => setEditing((x) => ({ ...x, phone: v }))} />
            <TextField label="Email" type="email" value={editing.email || ''} onChange={(v) => setEditing((x) => ({ ...x, email: v }))} />
            <TextArea label="Address" value={editing.address || ''} onChange={(v) => setEditing((x) => ({ ...x, address: v }))} />
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          danger
          title={`Delete "${confirmDelete.name}"?`}
          message="Customers with recorded sales cannot be deleted."
          confirmLabel="Delete"
          busy={busy}
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}

export function CustomerFormModal({ onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ ...EMPTY });
  return (
    <Modal
      title="Quick add customer"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon="save" onClick={() => saveCustomer(f, toast, (c) => { onSaved(c); onClose(); })}>Save</Button>
        </>
      }
    >
      <div className="form-grid">
        <TextField label="Full name" required value={f.name} onChange={(v) => setF((x) => ({ ...x, name: v }))} />
        <TextField label="Phone" value={f.phone} onChange={(v) => setF((x) => ({ ...x, phone: v }))} />
      </div>
    </Modal>
  );
}

async function saveCustomer(c, toast, done) {
  if (!c.name?.trim()) {
    toast('Customer name is required.', 'error');
    return;
  }
  const body = {
    name: c.name.trim(),
    phone: c.phone?.trim() || null,
    email: c.email?.trim() || null,
    address: c.address?.trim() || null,
  };
  try {
    let res;
    if (c.id) {
      res = await api(`customers/${c.id}`, { method: 'PUT', body });
      toast('Customer updated.');
    } else {
      res = await api('customers', { method: 'POST', body });
      toast('Customer created.');
    }
    done(res.customer);
  } catch (e) {
    toast(e.message, 'error');
  }
}
