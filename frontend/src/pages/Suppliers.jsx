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

const EMPTY = { name: '', contact_person: '', phone: '', email: '', address: '' };

export function SuppliersPage() {
  const { settings, user } = useAuth();
  const toast = useToast();
  const sym = settings.currency_symbol || '$';
  const canManage = ['admin', 'manager'].includes(user.role);

  const [view, setView] = useViewMode('suppliers');
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

  const statsQ = useApi('suppliers/stats');
  const listQ = useApi('suppliers', { search: debounced || undefined, page, per_page: perPage });
  const rows = listQ.data?.data || [];
  const meta = listQ.data?.meta;
  const st = statsQ.data?.stats;

  async function handleDelete() {
    setBusy(true);
    try {
      await api(`suppliers/${confirmDelete.id}`, { method: 'DELETE' });
      toast('Supplier deleted.');
      setConfirmDelete(null);
      listQ.reload(); statsQ.reload();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy(false);
  }

  function exportCsv() {
    downloadCsv('suppliers.csv', [
      { key: 'name', label: 'Name' },
      { key: 'contact_person', label: 'Contact person' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'address', label: 'Address' },
      { key: 'purchases_count', label: 'Purchase orders' },
      { key: 'total_purchased', label: `Total purchased (${sym})` },
    ], rows);
  }

  return (
    <>
      <PageHead title="Suppliers" subtitle="Vendor directory and purchasing history">
        <ViewToggle view={view} onChange={setView} />
        <button type="button" className="icon-only-header" onClick={() => { listQ.reload(); statsQ.reload(); }} title="Refresh">
          <Icon name="refresh" size={16} />
        </button>
        <Button icon="download" variant="secondary" onClick={exportCsv}>Export CSV</Button>
        {canManage && <Button icon="plus" onClick={() => setEditing({ ...EMPTY })}>Add supplier</Button>}
      </PageHead>

      {!st && statsQ.loading ? (
        <StatSkeleton />
      ) : st && (
        <div className="stat-row">
          <StatCard label="Suppliers" icon="truck" value={num(st.total)} sub={`${st.with_orders} with purchase orders`} />
          <StatCard label="Lifetime purchase spend" icon="dollar-sign" value={money(st.spend_total, sym)} tone="green" />
          <StatCard label="Spend — last 30 days" icon="trending-up" value={money(st.spend_month, sym)} tone="blue" />
          <StatCard
            label="Top supplier"
            icon="package"
            value={topSupplier(rows)?.name || '—'}
            tone={rows.length ? '' : undefined}
            sub={topSupplier(rows) ? money(topSupplier(rows).total_purchased, sym) : 'No purchases yet'}
          />
        </div>
      )}

      <div className="filter-bar">
        <div className="field grow">
          <input className="input" placeholder="Search suppliers…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  key: 'name', label: 'Supplier',
                  render: (s) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <span className="avatar">{initials(s.name)}</span>
                      <span><b>{s.name}</b><br /><span className="muted small">{s.contact_person || '—'}</span></span>
                    </div>
                  ),
                },
                { key: 'phone', label: 'Contact', render: (s) => (<span>{s.phone || '—'}<br /><span className="muted small">{s.email || ''}</span></span>) },
                { key: 'address', label: 'Address', render: (s) => s.address || <span className="muted">—</span> },
                { key: 'purchases_count', label: 'POs', align: 'right', render: (s) => <Badge tone={s.purchases_count > 0 ? 'blue' : 'gray'}>{s.purchases_count}</Badge> },
                { key: 'total_purchased', label: 'Total purchased', align: 'right', render: (s) => <b>{money(s.total_purchased, sym)}</b> },
              ]}
              rows={rows}
              actions={(s) =>
                canManage ? (
                  <>
                    <IconBtn icon="edit" title="Edit" onClick={() => setEditing({ ...s })} />
                    <IconBtn icon="trash" title="Delete" danger onClick={() => setConfirmDelete(s)} />
                  </>
                ) : null
              }
              emptyState={
                <EmptyState
                  icon="truck"
                  title="No suppliers yet"
                  message="Add the vendors you buy stock from to enable purchase orders."
                  actionLabel={canManage ? 'Add your first supplier' : undefined}
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
                <EmptyState icon="truck" title="No suppliers yet" message="Add your first vendor." actionLabel={canManage ? 'Add supplier' : undefined} onAction={() => setEditing({ ...EMPTY })} />
              ) : (
                <div className="card-grid">
                  {rows.map((s) => (
                    <div className="entity-card" key={s.id}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span className="avatar" style={{ width: 42, height: 42, fontSize: 15 }}>{initials(s.name)}</span>
                        <span>
                          <b style={{ fontSize: 15 }}>{s.name}</b><br />
                          <span className="muted small">{s.contact_person || 'No contact person'}</span>
                        </span>
                      </div>
                      <div className="meta">
                        {s.phone && <div><Icon name="phone" size={13} />{s.phone}</div>}
                        {s.email && <div><Icon name="mail" size={13} />{s.email}</div>}
                        {s.address && <div><Icon name="map-pin" size={13} />{s.address}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <Badge tone="blue">{s.purchases_count} POs</Badge>
                        <Badge tone="green">{money(s.total_purchased, sym)}</Badge>
                      </div>
                      {canManage && (
                        <div className="foot">
                          <span className="muted small">Since {fmtDate(s.created_at)}</span>
                          <span className="inline-actions">
                            <IconBtn icon="edit" title="Edit" onClick={() => setEditing({ ...s })} />
                            <IconBtn icon="trash" title="Delete" danger onClick={() => setConfirmDelete(s)} />
                          </span>
                        </div>
                      )}
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
          title={editing.id ? `Edit supplier — ${editing.name}` : 'New supplier'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button icon="save" onClick={() => saveSupplier(editing, toast, () => { setEditing(null); listQ.reload(); statsQ.reload(); })}>Save</Button>
            </>
          }
        >
          <div className="form-grid">
            <TextField label="Company / supplier name" required value={editing.name} onChange={(v) => setEditing((x) => ({ ...x, name: v }))} />
            <TextField label="Contact person" value={editing.contact_person || ''} onChange={(v) => setEditing((x) => ({ ...x, contact_person: v }))} />
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
          message="Suppliers with recorded purchase orders cannot be deleted."
          confirmLabel="Delete"
          busy={busy}
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}

function topSupplier(rows) {
  if (!rows || !rows.length) return null;
  return [...rows].sort((a, b) => b.total_purchased - a.total_purchased)[0];
}

async function saveSupplier(s, toast, done) {
  if (!s.name.trim()) {
    toast('Supplier name is required.', 'error');
    return;
  }
  const body = {
    name: s.name.trim(),
    contact_person: s.contact_person?.trim() || null,
    phone: s.phone?.trim() || null,
    email: s.email?.trim() || null,
    address: s.address?.trim() || null,
  };
  try {
    if (s.id) {
      await api(`suppliers/${s.id}`, { method: 'PUT', body });
      toast('Supplier updated.');
    } else {
      await api('suppliers', { method: 'POST', body });
      toast('Supplier created.');
    }
    done();
  } catch (e) {
    toast(e.message, 'error');
  }
}
