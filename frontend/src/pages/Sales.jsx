import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  PageHead, Button, IconBtn, StatCard, StatSkeleton, DataTable, Pagination, EmptyState,
  Modal, Badge, ConfirmDialog, ViewToggle, useViewMode, TableSkeleton, ErrorBlock,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { money, num, fmtDateTime, daysAgoStr, todayStr, downloadCsv } from '../lib/format.js';

const METHOD_ICONS = { cash: 'dollar-sign', card: 'credit-card', mobile: 'smartphone' };

export function SalesPage({ initialQuery = {} }) {
  const { settings, user } = useAuth();
  const toast = useToast();
  const sym = settings.currency_symbol || '$';
  const canVoid = ['admin', 'manager'].includes(user.role);

  const [view, setView] = useViewMode('sales');
  const [search, setSearch] = useState(initialQuery.ref || '');
  const [debounced, setDebounced] = useState(search);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [detail, setDetail] = useState(null);
  const [confirmVoid, setConfirmVoid] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialQuery.ref) setSearch(initialQuery.ref);
  }, [initialQuery.ref]);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const statsQ = useApi('sales/stats', { from: daysAgoStr(29), to: todayStr() });
  const listQ = useApi('sales', {
    search: debounced || undefined,
    from: from || undefined,
    to: to || undefined,
    method: method || undefined,
    status: status || undefined,
    page,
    per_page: perPage,
  });

  const rows = listQ.data?.data || [];
  const meta = listQ.data?.meta;
  const st = statsQ.data?.stats;
  const payMap = {};
  (statsQ.data?.payments || []).forEach((p) => (payMap[p.method] = p));

  async function openDetail(id) {
    try {
      const res = await api(`sales/${id}`);
      setDetail(res);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function handleVoid() {
    setBusy(true);
    try {
      await api(`sales/${confirmVoid.id}/void`, { method: 'POST' });
      toast(`Sale ${confirmVoid.reference} voided — stock restored.`);
      setConfirmVoid(null);
      setDetail(null);
      listQ.reload(); statsQ.reload();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy(false);
  }

  function exportCsv() {
    downloadCsv('transactions.csv', [
      { key: 'reference', label: 'Reference' },
      { key: 'created_at', label: 'Date' },
      { key: 'cashier_name', label: 'Cashier' },
      { key: 'customer_name', label: 'Customer' },
      { key: 'items_count', label: 'Items' },
      { key: 'payment_method', label: 'Payment' },
      { key: 'subtotal', label: `Subtotal (${sym})` },
      { key: 'discount', label: `Discount (${sym})` },
      { key: 'tax', label: `Tax (${sym})` },
      { key: 'total', label: `Total (${sym})` },
      { key: 'status', label: 'Status' },
    ], rows.map((r) => ({ ...r, customer_name: r.customer_name || 'Walk-in' })));
  }

  return (
    <>
      <PageHead title="Transactions" subtitle="Sales history, receipts and voids">
        <ViewToggle view={view} onChange={setView} />
        <button type="button" className="icon-only-header" onClick={() => { listQ.reload(); statsQ.reload(); }} title="Refresh">
          <Icon name="refresh" size={16} />
        </button>
        <Button icon="download" variant="secondary" onClick={exportCsv}>Export CSV</Button>
      </PageHead>

      {!st && statsQ.loading ? (
        <StatSkeleton />
      ) : st && (
        <>
          <div className="stat-row">
            <StatCard label="Revenue — 30 days" icon="dollar-sign" value={money(st.revenue, sym)} tone="blue" delta={null} sub={`${st.orders_count} completed orders`} />
            <StatCard label="Avg order value" icon="percent" value={money(st.avg_order_value, sym)} tone="" sub={`Items sold ${num(st.items_sold)}`} />
            <StatCard label="Discounts given" icon="tag" value={money(st.discounts_total, sym)} tone="amber" sub={`Tax collected ${money(st.tax_total, sym)}`} />
            <div className="stat-card">
              <div className="stat-label"><Icon name="credit-card" size={13} /> Payments — 30 days</div>
              <div style={{ marginTop: 8 }}>
                {['cash', 'card', 'mobile'].map((m) => (
                  <div key={m} className="sum-row" style={{ fontSize: 12.5 }}>
                    <span><Icon name={METHOD_ICONS[m]} size={13} /> {m}</span>
                    <b>{payMap[m] ? `${payMap[m].count} · ${money(payMap[m].amount, sym)}` : '—'}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="filter-bar">
        <div className="field grow">
          <input className="input" placeholder="Search reference, cashier or customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field">
          <label>Method</label>
          <select className="input" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}>
            <option value="">All methods</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mobile">Mobile</option>
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="voided">Voided</option>
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
      </div>

      <div className="card">
        {listQ.error ? (
          <ErrorBlock message={listQ.error} onRetry={listQ.reload} />
        ) : listQ.loading && !rows.length ? (
          <TableSkeleton cols={7} />
        ) : view === 'list' ? (
          <>
            <DataTable
              columns={[
                { key: 'reference', label: 'Reference', render: (s) => <span className="mono"><b>{s.reference}</b></span> },
                { key: 'created_at', label: 'Date', render: (s) => fmtDateTime(s.created_at) },
                { key: 'cashier_name', label: 'Cashier', render: (s) => s.cashier_name || '—' },
                { key: 'customer_name', label: 'Customer', render: (s) => s.customer_name || 'Walk-in' },
                { key: 'items_count', label: 'Items', align: 'center' },
                { key: 'payment_method', label: 'Payment', align: 'center', render: (s) => (<Badge tone="navy"><Icon name={METHOD_ICONS[s.payment_method]} size={11} />{s.payment_method}</Badge>) },
                { key: 'status', label: 'Status', align: 'center', render: (s) => <Badge tone={s.status}>{s.status}</Badge> },
                { key: 'total', label: 'Total', align: 'right', render: (s) => <b>{money(s.total, sym)}</b> },
              ]}
              rows={rows}
              rowKey={(r) => r.id}
              actions={(s) => (
                <>
                  <IconBtn icon="eye" title="View receipt" onClick={() => openDetail(s.id)} />
                  {canVoid && s.status === 'completed' && <IconBtn icon="rotate-ccw" title="Void sale" danger onClick={() => setConfirmVoid(s)} />}
                </>
              )}
              emptyState={
                <EmptyState
                  icon="file-text"
                  title="No transactions yet"
                  message="Completed sales from the register will appear here."
                />
              }
            />
            <Pagination meta={meta} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} />
          </>
        ) : (
          <>
            <div className="card-body">
              {rows.length === 0 ? (
                <EmptyState icon="file-text" title="No transactions yet" message="Sales recorded at the register appear here." />
              ) : (
                <div className="card-grid">
                  {rows.map((s) => (
                    <div className="entity-card" key={s.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(s.id)}>
                      <div className="top">
                        <span className="title mono">{s.reference}</span>
                        <Badge tone={s.status}>{s.status}</Badge>
                      </div>
                      <div className="meta">
                        <div><Icon name="calendar" size={13} />{fmtDateTime(s.created_at)}</div>
                        <div><Icon name="user" size={13} />{s.cashier_name || '—'} → {s.customer_name || 'Walk-in'}</div>
                        <div><Icon name={METHOD_ICONS[s.payment_method]} size={13} />{s.payment_method}</div>
                      </div>
                      <div className="foot">
                        <span className="muted small">{s.items_count} item(s)</span>
                        <b style={{ color: 'var(--accent)', fontSize: 17 }}>{money(s.total, sym)}</b>
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

      {detail && (
        <SaleDetailModal
          payload={detail}
          sym={sym}
          storeSettings={settings}
          canVoid={canVoid}
          onVoid={() => setConfirmVoid(detail.sale)}
          onClose={() => setDetail(null)}
        />
      )}

      {confirmVoid && (
        <ConfirmDialog
          danger
          title={`Void sale ${confirmVoid.reference}?`}
          message="The transaction will be marked as voided and all sold quantities will be returned to stock. This cannot be undone."
          confirmLabel="Void sale"
          busy={busy}
          onConfirm={handleVoid}
          onClose={() => setConfirmVoid(null)}
        />
      )}
    </>
  );
}

export function SaleDetailModal({ payload, sym, storeSettings, canVoid, onVoid, onClose }) {
  const s = payload.sale;
  return (
    <Modal
      title={`Transaction — ${s.reference}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          {canVoid && s.status === 'completed' && <Button variant="danger" icon="rotate-ccw" onClick={onVoid}>Void sale</Button>}
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button icon="printer" onClick={() => window.print()}>Print receipt</Button>
        </>
      }
    >
      <div className="grid-2">
        <div>
          <div className="kv-list">
            <div className="row"><span className="k">Date</span><span className="v">{fmtDateTime(s.created_at)}</span></div>
            <div className="row"><span className="k">Cashier</span><span className="v">{s.cashier_name || '—'}</span></div>
            <div className="row"><span className="k">Customer</span><span className="v">{s.customer_name || 'Walk-in'}</span></div>
            <div className="row">
              <span className="k">Payment method</span>
              <span className="v"><Badge tone="navy">{s.payment_method.toUpperCase()}</Badge></span>
            </div>
            <div className="row">
              <span className="k">Status</span>
              <span className="v"><Badge tone={s.status}>{s.status}</Badge></span>
            </div>
            {s.status === 'voided' && (
              <div className="row"><span className="k">Voided by</span><span className="v">{s.voided_by_name || '—'} · {fmtDateTime(s.voided_at)}</span></div>
            )}
          </div>
          <h4 style={{ margin: '16px 0 8px', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-soft)' }}>Totals</h4>
          <div className="kv-list">
            <div className="row"><span className="k">Subtotal</span><span className="v">{money(s.subtotal, sym)}</span></div>
            <div className="row"><span className="k">Discount</span><span className="v">-{money(s.discount, sym)}</span></div>
            <div className="row"><span className="k">Tax</span><span className="v">{money(s.tax, sym)}</span></div>
            <div className="row"><span className="k">Total</span><span className="v"><b>{money(s.total, sym)}</b></span></div>
            <div className="row"><span className="k">Paid / Change</span><span className="v">{money(s.paid_amount, sym)} / {money(s.change_due, sym)}</span></div>
          </div>
        </div>
        <div className="print-area receipt">
          <div className="center">
            <b style={{ fontSize: 15 }}>{storeSettings.store_name || 'Apex POS'}</b><br />
            <hr />
            <b>SALES RECEIPT</b><br />
            {s.reference}
          </div>
          <hr />
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Item</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {payload.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.product_name}<br /><small>@ {money(it.unit_price, sym)}</small></td>
                  <td style={{ textAlign: 'right' }}>{it.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{money(it.line_total, sym)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <hr />
          <table>
            <tbody>
              <tr><td>Subtotal</td><td style={{ textAlign: 'right' }}>{money(s.subtotal, sym)}</td></tr>
              <tr><td>Tax</td><td style={{ textAlign: 'right' }}>{money(s.tax, sym)}</td></tr>
              <tr><td><b>TOTAL</b></td><td style={{ textAlign: 'right' }}><b>{money(s.total, sym)}</b></td></tr>
            </tbody>
          </table>
          <hr />
          <div className="center">{storeSettings.receipt_footer || 'Thank you for your business!'}</div>
        </div>
      </div>
    </Modal>
  );
}
