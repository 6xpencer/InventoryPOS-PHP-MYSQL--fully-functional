import { useState } from 'react';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  PageHead, Button, IconBtn, StatCard, StatSkeleton, DataTable, EmptyState,
  Modal, TextField, TextArea, ConfirmDialog, ViewToggle, useViewMode, TableSkeleton, ErrorBlock,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { num } from '../lib/format.js';

export function CategoriesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const canManage = ['admin', 'manager'].includes(user.role);

  const [view, setView] = useViewMode('categories');
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const q = useApi('categories');
  const rows = q.data?.data || [];

  const totalCats = rows.length;
  const totalProducts = rows.reduce((s, r) => s + r.products_count, 0);
  const totalUnits = rows.reduce((s, r) => s + r.units_count, 0);
  const biggest = [...rows].sort((a, b) => b.products_count - a.products_count)[0];

  async function handleDelete() {
    setBusy(true);
    try {
      await api(`categories/${confirmDelete.id}`, { method: 'DELETE' });
      toast('Category deleted.');
      setConfirmDelete(null);
      q.reload();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy(false);
  }

  return (
    <>
      <PageHead title="Categories" subtitle="Organize products into logical groups">
        <ViewToggle view={view} onChange={setView} />
        <button type="button" className="icon-only-header" onClick={() => q.reload()} title="Refresh">
          <Icon name="refresh" size={16} />
        </button>
        {canManage && <Button icon="plus" onClick={() => setEditing({ name: '', description: '' })}>Add category</Button>}
      </PageHead>

      {!q.data && q.loading ? (
        <StatSkeleton />
      ) : (
        <div className="stat-row">
          <StatCard label="Categories" icon="layers" value={num(totalCats)} />
          <StatCard label="Products assigned" icon="package" value={num(totalProducts)} tone="blue" />
          <StatCard label="Units in stock" icon="box" value={num(totalUnits)} tone="green" />
          <StatCard label="Largest category" icon="tag" value={biggest ? biggest.name : '—'} tone={biggest?.products_count > 0 ? 'amber' : undefined} sub={biggest ? `${num(biggest.products_count)} products` : 'No data yet'} />
        </div>
      )}

      <div className="card">
        {q.error ? (
          <ErrorBlock message={q.error} onRetry={q.reload} />
        ) : q.loading && !rows.length ? (
          <TableSkeleton cols={4} />
        ) : view === 'list' ? (
          <DataTable
            columns={[
              { key: 'name', label: 'Category', render: (c) => <b>{c.name}</b> },
              { key: 'description', label: 'Description', render: (c) => c.description || <span className="muted">—</span> },
              { key: 'products_count', label: 'Products', align: 'right' },
              { key: 'units_count', label: 'Units in stock', align: 'right' },
            ]}
            rows={rows}
            actions={(c) =>
              canManage ? (
                <>
                  <IconBtn icon="edit" title="Edit" onClick={() => setEditing({ ...c })} />
                  <IconBtn icon="trash" title="Delete" danger onClick={() => setConfirmDelete(c)} />
                </>
              ) : null
            }
            emptyState={
              <EmptyState
                icon="layers"
                title="No categories yet"
                message="Categories group related products and power the POS filter chips."
                actionLabel={canManage ? 'Add your first category' : undefined}
                onAction={() => setEditing({ name: '', description: '' })}
              />
            }
          />
        ) : (
          <div className="card-body">
            {rows.length === 0 ? (
              <EmptyState icon="layers" title="No categories yet" message="Create categories to organize your catalog." actionLabel={canManage ? 'Add category' : undefined} onAction={() => setEditing({ name: '', description: '' })} />
            ) : (
              <div className="card-grid">
                {rows.map((c) => (
                  <div className="entity-card" key={c.id}>
                    <div className="top">
                      <span className="title">{c.name}</span>
                      <span className="badge navy">{c.products_count} products</span>
                    </div>
                    <p className="muted small" style={{ minHeight: 30 }}>{c.description || 'No description.'}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }} className="small muted">
                      <Icon name="box" size={13} /> {num(c.units_count)} units in stock
                    </div>
                    {canManage && (
                      <div className="foot">
                        <span className="muted small">ID #{c.id}</span>
                        <span className="inline-actions">
                          <IconBtn icon="edit" title="Edit" onClick={() => setEditing({ ...c })} />
                          <IconBtn icon="trash" title="Delete" danger onClick={() => setConfirmDelete(c)} />
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <Modal
          title={editing.id ? `Edit category — ${editing.name}` : 'New category'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button icon="save" onClick={() => saveCategory(editing, toast, () => { setEditing(null); q.reload(); })}>Save</Button>
            </>
          }
        >
          <div className="form-grid">
            <TextField label="Name" required value={editing.name} onChange={(v) => setEditing((x) => ({ ...x, name: v }))} />
            <TextArea label="Description" value={editing.description || ''} onChange={(v) => setEditing((x) => ({ ...x, description: v }))} />
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          danger
          title={`Delete "${confirmDelete.name}"?`}
          message="This is only possible when no products are assigned to the category."
          confirmLabel="Delete"
          busy={busy}
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}

async function saveCategory(cat, toast, done) {
  if (!cat.name.trim()) {
    toast('Category name is required.', 'error');
    return;
  }
  const body = { name: cat.name.trim(), description: cat.description?.trim() || null };
  try {
    if (cat.id) {
      await api(`categories/${cat.id}`, { method: 'PUT', body });
      toast('Category updated.');
    } else {
      await api('categories', { method: 'POST', body });
      toast('Category created.');
    }
    done();
  } catch (e) {
    toast(e.message, 'error');
  }
}
