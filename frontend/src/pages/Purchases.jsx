import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  PageHead, Button, IconBtn, StatCard, StatSkeleton, DataTable, Pagination, EmptyState,
  Modal, TextField, SelectField, Badge, ViewToggle, useViewMode, TableSkeleton, ErrorBlock,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { money, num, fmtDateTime, daysAgoStr, todayStr, downloadCsv } from '../lib/format.js';

export function PurchasesPage() {
  const { settings } = useAuth();
  const toast = useToast();
  const sym = settings.currency_symbol || '$';

  const [view, setView] = useViewMode('purchases');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [showNew, setShowNew] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const statsQ = useApi('purchases/stats');
  const suppliersQ = useApi('suppliers/all');
  const listQ = useApi('purchases', {
    search: debounced || undefined,
    from: from || undefined,
    to: to || undefined,
    supplier_id: supplierId || undefined,
    page,
    per_page: perPage,
  });

  const rows = listQ.data?.data || [];
  const meta = listQ.data?.meta;
  const st = statsQ.data?.stats;
  const suppliers = suppliersQ.data?.data || [];

  function exportCsv() {
    downloadCsv('purchases.csv', [
      { key: 'reference', label: 'Reference' },
      { key: 'created_at', label: 'Date' },
      { key: 'supplier_name', label: 'Supplier' },
      { key: 'received_by_name', label: 'Received by' },
      { key: 'items_count', label: 'Line items' },
      { key: 'total', label: `Total (${sym})` },
    ], rows);
  }

  return (
    <>
      <PageHead title="Purchases" subtitle="Record incoming stock from suppliers">
        <ViewToggle view={view} onChange={setView} />
        <button type="button" className="icon-only-header" onClick={() => { listQ.reload(); statsQ.reload(); }} title="Refresh">
          <Icon name="refresh" size={16} />
        </button>
        <Button icon="download" variant="secondary" onClick={exportCsv}>Export CSV</Button>
        <Button icon="plus" onClick={() => setShowNew(true)}>New purchase</Button>
      </PageHead>

      {!st && statsQ.loading ? (
        <StatSkeleton />
      ) : st && (
        <div className="stat-row">
          <StatCard label="Purchase orders" icon="clipboard" value={num(st.orders_total)} sub={`${st.suppliers_used} supplier(s) used`} />
          <StatCard label="Lifetime spend" icon="dollar-sign" value={money(st.spend_total, sym)} tone="green" />
          <StatCard label="Spend — last 30 days" icon="trending-up" value={money(st.spend_month, sym)} tone="blue" />
          <StatCard
            label="Avg order value"
            icon="percent"
            value={money(st.orders_total ? st.spend_total / st.orders_total : 0, sym)}
            tone="amber"
          />
        </div>
      )}

      <div className="filter-bar">
        <div className="field grow">
          <input className="input" placeholder="Search reference, supplier or receiver…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field">
          <label>Supplier</label>
          <select className="input" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPage(1); }}>
            <option value="">All suppliers</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>From</label>
          <input className="input" type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div className="field">
          <label>To</label>
          <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        {(from || to) && <Button variant="ghost" icon="x" onClick={() => { setFrom(''); setTo(''); }}>Clear dates</Button>}
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
                { key: 'reference', label: 'Reference', render: (p) => <span className="mono"><b>{p.reference}</b></span> },
                { key: 'supplier_name', label: 'Supplier', render: (p) => p.supplier_name || <span className="muted">—</span> },
                { key: 'created_at', label: 'Date', render: (p) => fmtDateTime(p.created_at) },
                { key: 'items_count', label: 'Items', align: 'center' },
                { key: 'status', label: 'Status', align: 'center', render: () => <Badge tone="green">Received</Badge> },
                { key: 'total', label: 'Total', align: 'right', render: (p) => <b>{money(p.total, sym)}</b> },
              ]}
              rows={rows}
              actions={(p) => <IconBtn icon="eye" title="View details" onClick={() => viewPurchase(p.id, setDetail)} />}
              emptyState={
                <EmptyState
                  icon="clipboard"
                  title="No purchase orders yet"
                  message="Record a purchase to add stock and keep product costs current."
                />
              }
            />
            <Pagination meta={meta} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} />
          </>
        ) : (
          <>
            <div className="card-body">
              {rows.length === 0 ? (
                <EmptyState icon="clipboard" title="No purchase orders yet" message="Record a purchase to receive stock." />
              ) : (
                <div className="card-grid">
                  {rows.map((p) => (
                    <div className="entity-card" key={p.id} style={{ cursor: 'pointer' }} onClick={() => viewPurchase(p.id, setDetail)}>
                      <div className="top">
                        <span className="title mono">{p.reference}</span>
                        <Badge tone="green">Received</Badge>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="truck" size={13} />{p.supplier_name || '—'}</div>
                      <div className="meta">
                        <div><Icon name="calendar" size={13} />{fmtDateTime(p.created_at)}</div>
                        <div><Icon name="user" size={13} />{p.received_by_name || '—'}</div>
                        <div><Icon name="box" size={13} />{p.items_count} line item(s)</div>
                      </div>
                      <div className="foot">
                        <span className="muted small">Total</span>
                        <b style={{ color: 'var(--accent)', fontSize: 17 }}>{money(p.total, sym)}</b>
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

      {showNew && (
        <NewPurchaseModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            listQ.reload(); statsQ.reload();
          }}
        />
      )}

      {detail && (
        <Modal title={`Purchase order — ${detail.purchase.reference}`} size="lg" onClose={() => setDetail(null)}>
          <div className="kv-list" style={{ marginBottom: 18 }}>
            <div className="row"><span className="k">Supplier</span><span className="v">{detail.purchase.supplier_name || '—'}</span></div>
            <div className="row"><span className="k">Received by</span><span className="v">{detail.purchase.received_by_name || '—'}</span></div>
            <div className="row"><span className="k">Date</span><span className="v">{fmtDateTime(detail.purchase.created_at)}</span></div>
            {detail.purchase.notes && <div className="row"><span className="k">Notes</span><span className="v">{detail.purchase.notes}</span></div>}
            <div className="row"><span className="k">Total</span><span className="v"><b>{money(detail.purchase.total, sym)}</b></span></div>
          </div>
          <DataTable
            columns={[
              { key: 'product_name', label: 'Product', render: (i) => (<span><b>{i.product_name}</b><br /><span className="muted small mono">{i.sku ?? ''}</span></span>) },
              { key: 'cost_price', label: 'Unit cost', align: 'right', render: (i) => money(i.cost_price, sym) },
              { key: 'quantity', label: 'Qty', align: 'right' },
              { key: 'line_total', label: 'Line total', align: 'right', render: (i) => <b>{money(i.line_total, sym)}</b> },
            ]}
            rows={detail.items}
          />
        </Modal>
      )}
    </>
  );
}

async function viewPurchase(id, setDetail) {
  try {
    const res = await api(`purchases/${id}`);
    setDetail(res);
  } catch {
    /* handled by toast elsewhere */
  }
}

function NewPurchaseModal({ onClose, onSaved }) {
  const toast = useToast();
  const { settings } = useAuth();
  const sym = settings.currency_symbol || '$';

  const suppliersQ = useApi('suppliers/all');
  const productsQ = useApi('products', { status: 'active', per_page: 500 });
  const suppliers = suppliersQ.data?.data || [];
  const products = productsQ.data?.data || [];

  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ product_id: '', quantity: '1', cost_price: '' }]);
  const [busy, setBusy] = useState(false);

  const total = useMemo(
    () =>
      lines.reduce((s, l) => {
        const cost = l.cost_price === '' ? null : Number(l.cost_price);
        return s + (cost !== null && !isNaN(cost) ? cost * Number(l.quantity || 0) : 0);
      }, 0),
    [lines]
  );

  function setLine(idx, patch) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function pickProduct(idx, pid) {
    const prod = products.find((p) => String(p.id) === String(pid));
    setLine(idx, {
      product_id: pid,
      cost_price: prod ? String(prod.cost_price) : '',
    });
  }

  async function submit() {
    if (!supplierId) {
      toast('Select a supplier.', 'error');
      return;
    }
    const valid = lines.filter((l) => l.product_id && Number(l.quantity) > 0);
    if (!valid.length) {
      toast('Add at least one product line with a quantity.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api('purchases', {
        method: 'POST',
        body: {
          supplier_id: Number(supplierId),
          notes: notes.trim() || null,
          items: valid.map((l) => ({
            product_id: Number(l.product_id),
            quantity: Number(l.quantity),
            cost_price: l.cost_price === '' ? undefined : Number(l.cost_price),
          })),
        },
      });
      toast(`Purchase ${res.purchase.purchase.reference} recorded — stock updated.`);
      onSaved();
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy(false);
  }

  return (
    <Modal
      title="New purchase order (stock in)"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon="check" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : `Receive stock — ${money(total, sym)}`}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <SelectField
          label="Supplier"
          required
          placeholder={suppliers.length ? 'Select supplier…' : 'No suppliers yet'}
          value={supplierId}
          onChange={setSupplierId}
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        />
        <TextField label="Notes" value={notes} onChange={setNotes} placeholder="Invoice no., delivery reference…" />
      </div>

      <h4 style={{ margin: '18px 0 10px', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-soft)' }}>
        Line items
      </h4>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 90px 120px 40px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
          <SelectField
            value={l.product_id}
            onChange={(v) => pickProduct(i, v)}
            placeholder="Select product…"
            options={products.map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` }))}
          />
          <TextField type="number" min="1" value={l.quantity} onChange={(v) => setLine(i, { quantity: v })} label="Qty" />
          <TextField type="number" min="0" step="0.01" value={l.cost_price} onChange={(v) => setLine(i, { cost_price: v })} label={`Unit cost (${sym})`} />
          <IconBtn icon="trash" danger title="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button variant="secondary" icon="plus" size="sm" onClick={() => setLines((ls) => [...ls, { product_id: '', quantity: '1', cost_price: '' }])}>
        Add another line
      </Button>

      <div className="sum-row total" style={{ marginTop: 14 }}>
        <span>Purchase total</span>
        <span>{money(total, sym)}</span>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>
        Receiving this purchase will increase product quantities immediately and update each product's unit cost.
      </p>
    </Modal>
  );
}
