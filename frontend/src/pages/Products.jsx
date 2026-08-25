import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  PageHead, Button, IconBtn, StatCard, StatSkeleton, DataTable, Pagination, EmptyState,
  Modal, ConfirmDialog, StockBadge, Badge, ViewToggle, useViewMode,
  TableSkeleton, ErrorBlock,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { money, num, fmtDateTime, downloadCsv } from '../lib/format.js';
import { ProductFormModal, AdjustStockModal, MovementsModal } from './ProductModals.jsx';

const EMPTY_FORM = {
  sku: '', name: '', category_id: '', supplier_id: '', barcode: '',
  cost_price: '', sell_price: '', quantity: '0', reorder_level: '5', status: 'active',
};

function exportCsv(rows, sym) {
  downloadCsv('products.csv', [
    { key: 'sku', label: 'SKU' },
    { key: 'name', label: 'Name' },
    { key: 'category_name', label: 'Category' },
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'barcode', label: 'Barcode' },
    { key: 'cost_price', label: `Cost (${sym})` },
    { key: 'sell_price', label: `Price (${sym})` },
    { key: 'quantity', label: 'Quantity' },
    { key: 'reorder_level', label: 'Reorder level' },
    { key: 'status', label: 'Status' },
  ], rows);
}

export function ProductsPage({ initialQuery = {} }) {
  const { settings, user } = useAuth();
  const toast = useToast();
  const sym = settings.currency_symbol || '$';
  const canManage = ['admin', 'manager'].includes(user.role);

  const [view, setView] = useViewMode('products');
  const [search, setSearch] = useState(initialQuery.search || '');
  const [debounced, setDebounced] = useState(initialQuery.search || '');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('active');
  const [stockFilter, setStockFilter] = useState(initialQuery.low ? 'low' : initialQuery.out ? 'out' : '');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sort, setSort] = useState('created_at');
  const [dir, setDir] = useState('DESC');

  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialQuery.search !== undefined) setSearch(initialQuery.search);
    if (initialQuery.low) setStockFilter('low');
    if (initialQuery.out) setStockFilter('out');
  }, [initialQuery.search, initialQuery.low, initialQuery.out]);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const statsQ = useApi('products/stats');
  const catsQ = useApi('categories');
  const listQ = useApi('products', {
    search: debounced || undefined,
    category_id: category || undefined,
    status: status || undefined,
    low: stockFilter === 'low' ? 1 : undefined,
    out: stockFilter === 'out' ? 1 : undefined,
    page,
    per_page: perPage,
    sort,
    dir,
  });

  const categories = useMemo(() => catsQ.data?.data || [], [catsQ.data]);
  const rows = listQ.data?.data || [];
  const meta = listQ.data?.meta;
  const st = statsQ.data?.stats;

  function toggleSort(key) {
    if (sort === key) setDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
    else { setSort(key); setDir('ASC'); }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      const res = await api(`products/${confirmDelete.id}`, { method: 'DELETE' });
      toast(res.deleted ? 'Product deleted.' : 'Product has transaction history — archived instead.');
      setConfirmDelete(null);
      listQ.reload(); statsQ.reload();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy(false);
  }

  return (
    <>
      <PageHead title="Products" subtitle="Manage catalog, pricing and stock levels">
        <ViewToggle view={view} onChange={setView} />
        <button type="button" className="icon-only-header" onClick={() => { listQ.reload(); statsQ.reload(); }} title="Refresh">
          <Icon name="refresh" size={16} />
        </button>
        {canManage && <Button icon="download" variant="secondary" onClick={() => exportCsv(rows, sym)}>Export CSV</Button>}
        {canManage && <Button icon="plus" onClick={() => setEditing({ ...EMPTY_FORM })}>Add product</Button>}
      </PageHead>

      {!st && statsQ.loading ? (
        <StatSkeleton />
      ) : st && (
        <div className="stat-row">
          <StatCard label="Active products" icon="package" value={num(st.active_products)} sub={`${num(st.total_products)} total incl. archived`} />
          <StatCard label="Total units on hand" icon="box" value={num(st.total_units)} tone="blue" sub="Across all active products" />
          <StatCard label="Inventory cost value" icon="dollar-sign" value={money(st.inventory_cost_value, sym)} tone="green" sub={`Retail ${money(st.inventory_retail_value, sym)}`} />
          <StatCard
            label="Needs attention"
            icon="alert-triangle"
            value={num(Number(st.low_stock) + Number(st.out_of_stock))}
            tone={Number(st.low_stock) + Number(st.out_of_stock) > 0 ? 'amber' : 'green'}
            sub={`${st.low_stock} low · ${st.out_of_stock} out`}
          />
        </div>
      )}

      <div className="filter-bar">
        <div className="field grow">
          <input className="input" placeholder="Search name, SKU or barcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <select className="input" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ minWidth: 140 }}>
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="">All statuses</option>
          </select>
        </div>
        <div className="field" style={{ minWidth: 150 }}>
          <select className="input" value={stockFilter} onChange={(e) => { setStockFilter(e.target.value); setPage(1); }}>
            <option value="">All stock levels</option>
            <option value="low">Low stock only</option>
            <option value="out">Out of stock</option>
          </select>
        </div>
      </div>

      <div className="card">
        {listQ.error ? (
          <ErrorBlock message={listQ.error} onRetry={listQ.reload} />
        ) : listQ.loading && !rows.length ? (
          <TableSkeleton cols={6} />
        ) : view === 'list' ? (
          <>
            <DataTable
              columns={[
                {
                  key: 'name',
                  label: 'Product',
                  sortable: true,
                  sorted: sort === 'name' ? dir.toLowerCase() : undefined,
                  render: (p) => (
                    <div style={{ cursor: 'pointer' }} onClick={() => setHistoryFor(p.id)} title="View movement history">
                      <b>{p.name}</b><br />
                      <span className="muted small mono">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</span>
                    </div>
                  ),
                },
                { key: 'category_name', label: 'Category', render: (p) => p.category_name || <span className="muted">—</span> },
                { key: 'supplier_name', label: 'Supplier', render: (p) => p.supplier_name || <span className="muted">—</span> },
                { key: 'cost_price', label: 'Cost', align: 'right', sortable: true, sorted: sort === 'cost_price' ? dir.toLowerCase() : undefined, render: (p) => money(p.cost_price, sym) },
                { key: 'sell_price', label: 'Price', align: 'right', sortable: true, sorted: sort === 'sell_price' ? dir.toLowerCase() : undefined, render: (p) => <b>{money(p.sell_price, sym)}</b> },
                {
                  key: 'quantity',
                  label: 'Stock',
                  align: 'center',
                  sortable: true,
                  sorted: sort === 'quantity' ? dir.toLowerCase() : undefined,
                  render: (p) => <StockBadge state={p.stock_state} quantity={p.quantity} reorderLevel={p.reorder_level} />,
                },
              ]}
              rows={rows}
              actions={(p) =>
                canManage ? (
                  <>
                    <IconBtn icon="activity" title="Adjust stock" onClick={() => setAdjusting(p)} />
                    <IconBtn icon="edit" title="Edit" onClick={() => setEditing({ ...EMPTY_FORM, ...toForm(p) })} />
                    <IconBtn icon="trash" title="Delete / archive" danger onClick={() => setConfirmDelete(p)} />
                  </>
                ) : (
                  <IconBtn icon="eye" title="Movement history" onClick={() => setHistoryFor(p.id)} />
                )
              }
              emptyState={
                <EmptyState
                  icon="package"
                  title="No products yet"
                  message={debounced || category || stockFilter ? 'No products match the current filters.' : 'Create your first product to start tracking inventory.'}
                  actionLabel={canManage && !debounced && !category && !stockFilter ? 'Add your first product' : undefined}
                  onAction={() => setEditing({ ...EMPTY_FORM })}
                />
              }
            />
            <Pagination meta={meta} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} />
          </>
        ) : (
          <>
            <div className="card-body">
              {rows.length === 0 ? (
                <EmptyState icon="package" title="No products yet" message="Create your first product to start tracking inventory." actionLabel={canManage ? 'Add product' : undefined} onAction={() => setEditing({ ...EMPTY_FORM })} />
              ) : (
                <div className="card-grid">
                  {rows.map((p) => (
                    <div className="entity-card" key={p.id}>
                      <div className="top">
                        <span className="title">{p.name}</span>
                        <StockBadge state={p.stock_state} quantity={p.quantity} />
                      </div>
                      <span className="mono muted small">{p.sku}</span>
                      <div className="meta">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="tag" size={12} />{p.category_name || 'Uncategorized'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="truck" size={12} />{p.supplier_name || 'No supplier'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{money(p.sell_price, sym)}</span>
                        <span className="muted small">cost {money(p.cost_price, sym)}</span>
                      </div>
                      {canManage ? (
                        <div className="foot">
                          <span className="muted small">Reorder at {p.reorder_level}</span>
                          <span className="inline-actions">
                            <IconBtn icon="activity" title="Adjust stock" onClick={() => setAdjusting(p)} />
                            <IconBtn icon="edit" title="Edit" onClick={() => setEditing({ ...EMPTY_FORM, ...toForm(p) })} />
                            <IconBtn icon="trash" title="Delete / archive" danger onClick={() => setConfirmDelete(p)} />
                          </span>
                        </div>
                      ) : (
                        <div className="foot">
                          <span className="muted small">Reorder at {p.reorder_level}</span>
                          <IconBtn icon="activity" title="Movement history" onClick={() => setHistoryFor(p.id)} />
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

      {editing !== null && (
        <ProductFormModal
          form={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => { listQ.reload(); statsQ.reload(); }}
        />
      )}

      {adjusting && (
        <AdjustStockModal
          product={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => { listQ.reload(); statsQ.reload(); }}
        />
      )}

      {historyFor && <MovementsModal productId={historyFor} onClose={() => setHistoryFor(null)} />}

      {confirmDelete && (
        <ConfirmDialog
          danger
          title={`Delete "${confirmDelete.name}"?`}
          message="If this product has sales or purchase history it will be archived instead of deleted, to keep records intact."
          confirmLabel="Delete"
          busy={busy}
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}

function toForm(p) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category_id: p.category_id ?? '',
    supplier_id: p.supplier_id ?? '',
    barcode: p.barcode ?? '',
    cost_price: String(p.cost_price),
    sell_price: String(p.sell_price),
    reorder_level: String(p.reorder_level),
    status: p.status,
  };
}
