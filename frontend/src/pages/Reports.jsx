import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  PageHead, Button, StatCard, StatSkeleton, DataTable, EmptyState, ErrorBlock, Badge,
} from '../components/ui.jsx';
import { AreaChart, BarChart, DonutChart } from '../components/charts.jsx';
import { Icon } from '../components/Icon.jsx';
import { money, num, daysAgoStr, todayStr, downloadCsv } from '../lib/format.js';

const PRESETS = [
  { label: 'Today', days: 0 },
  { label: '7 days', days: 6 },
  { label: '30 days', days: 29 },
  { label: '90 days', days: 89 },
];

export function ReportsPage() {
  const { settings } = useAuth();
  const toast = null; // reports page uses inline errors
  const sym = settings.currency_symbol || '$';

  const [tab, setTab] = useState('sales');
  const [days, setDays] = useState(29);
  const [from, setFrom] = useState(daysAgoStr(29));
  const [to, setTo] = useState(todayStr());

  const salesQ = useApi('reports/sales', tab === 'sales' ? { from, to } : null, { immediate: tab === 'sales' });
  const invQ = useApi('reports/inventory', null, { immediate: false });

  function applyPreset(d) {
    setDays(d);
    setFrom(daysAgoStr(d));
    setTo(todayStr());
  }

  function switchTab(t) {
    setTab(t);
    if (t === 'inventory') invQ.reload();
  }

  return (
    <>
      <PageHead title="Reports & Analytics" subtitle="Business performance intelligence">
        <Button icon="download" variant="secondary" onClick={() => exportAll(tab, salesQ.data, invQ.data, sym)}>
          Export CSV
        </Button>
      </PageHead>

      <div className="tabs">
        <button type="button" className={`tab${tab === 'sales' ? ' active' : ''}`} onClick={() => switchTab('sales')}>
          <Icon name="dollar-sign" size={15} /> Sales report
        </button>
        <button type="button" className={`tab${tab === 'inventory' ? ' active' : ''}`} onClick={() => switchTab('inventory')}>
          <Icon name="package" size={15} /> Inventory report
        </button>
      </div>

      {tab === 'sales' ? (
        <SalesReport q={salesQ} from={from} to={to} days={days} applyPreset={applyPreset} setFrom={setFrom} setTo={setTo} sym={sym} />
      ) : (
        <InventoryReport q={invQ} sym={sym} />
      )}
    </>
  );
}

function SalesReport({ q, from, to, days, applyPreset, setFrom, setTo, sym }) {
  if (q.error) return <ErrorBlock message={q.error} onRetry={q.reload} />;
  const d = q.data;

  return (
    <>
      <div className="filter-bar">
        <div className="date-presets">
          {PRESETS.map((p) => (
            <button key={p.days} type="button" className={`chip${days === p.days ? ' active' : ''}`} onClick={() => applyPreset(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="divider-v" />
        <input className="input" type="date" style={{ width: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="muted">→</span>
        <input className="input" type="date" style={{ width: 160 }} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {!d && q.loading ? (
        <StatSkeleton count={5} />
      ) : d && (
        <>
          <div className="stat-row">
            <StatCard label="Revenue" icon="dollar-sign" value={money(d.summary.revenue, sym)} tone="blue" sub={`${num(d.summary.orders)} completed orders`} />
            <StatCard label="Avg order value" icon="percent" value={money(d.summary.avg_order_value, sym)} sub={`${num(d.summary.items_sold)} items sold`} />
            <StatCard label="Discounts given" icon="tag" value={money(d.summary.discounts, sym)} tone="amber" />
            <StatCard label="Tax collected" icon="file-text" value={money(d.summary.tax_collected, sym)} tone="green" />
            <StatCard label="Voided orders" icon="rotate-ccw" value={num(d.summary.voided)} tone={d.summary.voided > 0 ? 'red' : undefined} />
          </div>

          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head"><h3>Daily revenue — {d.range.from} to {d.range.to}</h3></div>
            <div className="card-body">
              <AreaChart
                data={d.series.map((s) => ({
                  label: new Date(s.date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                  value: s.revenue,
                  tooltip: `${money(s.revenue, sym)} · ${s.orders} orders`,
                }))}
                height={250}
                formatValue={(v) => money(v, sym).replace(/\.\d\d$/, '')}
              />
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 18 }}>
            <div className="card">
              <div className="card-head"><h3>Payment breakdown</h3></div>
              <div className="card-body" style={{ display: 'grid', placeItems: 'center' }}>
                <DonutChart
                  data={(d.payments || []).map((p) => ({
                    label: p.method.charAt(0).toUpperCase() + p.method.slice(1),
                    value: p.amount,
                    tooltip: money(p.amount, sym),
                  }))}
                  formatValue={(v) => money(v, sym)}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Top products by revenue</h3></div>
              <div className="card-body">
                {d.top_products.length === 0 ? (
                  <p className="muted" style={{ textAlign: 'center', padding: 20 }}>No product sales in this range.</p>
                ) : (
                  <BarChart
                    data={d.top_products.slice(0, 7).map((p) => ({
                      label: p.name,
                      subLabel: `${p.qty} sold`,
                      value: p.revenue,
                      tooltip: money(p.revenue, sym),
                    }))}
                    formatValue={(v) => money(v, sym).replace(/\.\d\d$/, '')}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-head"><h3>Top customers</h3></div>
              <DataTable
                columns={[
                  { key: 'name', label: 'Customer', render: (r) => <b>{r.name}</b> },
                  { key: 'orders', label: 'Orders', align: 'right' },
                  { key: 'spent', label: 'Spent', align: 'right', render: (r) => <b>{money(r.spent, sym)}</b> },
                ]}
                rows={d.top_customers}
                emptyState={<EmptyState title="No customer purchases in this range" message="" />}
              />
            </div>
            <div className="card">
              <div className="card-head"><h3>Cashier performance</h3></div>
              <DataTable
                columns={[
                  { key: 'name', label: 'Cashier', render: (r) => <b>{r.name}</b> },
                  { key: 'orders', label: 'Orders', align: 'right' },
                  { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => <b>{money(r.revenue, sym)}</b> },
                ]}
                rows={d.cashiers}
                emptyState={<EmptyState title="No cashier activity in this range" message="" />}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function InventoryReport({ q, sym }) {
  if (q.error) return <ErrorBlock message={q.error} onRetry={q.reload} />;
  const d = q.data;
  if (!d && q.loading) return <StatSkeleton count={4} />;
  if (!d) return <StatSkeleton count={4} />;

  return (
    <>
      <div className="stat-row">
        <StatCard label="Active products" icon="package" value={num(d.totals.products)} sub={`${num(d.totals.units)} units on hand`} />
        <StatCard label="Inventory cost value" icon="dollar-sign" value={money(d.totals.cost_value, sym)} tone="green" />
        <StatCard label="Retail value" icon="trending-up" value={money(d.totals.retail_value, sym)} tone="blue" />
        <StatCard
          label="Stock alerts"
          icon="alert-triangle"
          value={`${num(d.totals.low_count)} low · ${num(d.totals.out_count)} out`}
          tone={d.totals.low_count + d.totals.out_count > 0 ? 'red' : 'green'}
        />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head"><h3>Valuation by category</h3></div>
        <DataTable
          columns={[
            { key: 'category', label: 'Category', render: (r) => <b>{r.category}</b> },
            { key: 'products', label: 'Products', align: 'right' },
            { key: 'units', label: 'Units', align: 'right' },
            { key: 'cost_value', label: 'Cost value', align: 'right', render: (r) => money(r.cost_value, sym) },
            { key: 'retail_value', label: 'Retail value', align: 'right', render: (r) => <b>{money(r.retail_value, sym)}</b> },
          ]}
          rows={d.by_category}
          emptyState={<EmptyState icon="package" title="No active inventory" message="Add products to see category valuation." />}
        />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3><Badge tone="amber">Low stock</Badge>&nbsp;{num(d.totals.low_count)}</h3></div>
          <DataTable
            columns={[
              { key: 'name', label: 'Product', render: (r) => (<span><b>{r.name}</b><br /><span className="muted small mono">{r.sku}</span></span>) },
              { key: 'quantity', label: 'Qty', align: 'right' },
              { key: 'reorder_level', label: 'Reorder at', align: 'right' },
            ]}
            rows={d.low_stock}
            emptyState={<EmptyState icon="check" title="No low-stock items" message="" />}
          />
        </div>
        <div className="card">
          <div className="card-head"><h3><Badge tone="red">Out of stock</Badge>&nbsp;{num(d.totals.out_count)}</h3></div>
          <DataTable
            columns={[
              { key: 'name', label: 'Product', render: (r) => (<span><b>{r.name}</b><br /><span className="muted small mono">{r.sku}</span></span>) },
              { key: 'quantity', label: 'Qty', align: 'right' },
            ]}
            rows={d.out_stock}
            emptyState={<EmptyState icon="check" title="Nothing is out of stock" message="" />}
          />
        </div>
      </div>
    </>
  );
}

function exportAll(tab, salesData, invData, sym) {
  if (tab === 'sales' && salesData) {
    downloadCsv('sales-report.csv', [
      { key: 'date', label: 'Date' },
      { key: 'orders', label: 'Orders' },
      { key: 'revenue', label: `Revenue (${sym})` },
    ], salesData.series.map((s) => ({ date: s.date, orders: s.orders, revenue: s.revenue })));
  }
  if (tab === 'inventory' && invData) {
    downloadCsv('inventory-valuation.csv', [
      { key: 'category', label: 'Category' },
      { key: 'products', label: 'Products' },
      { key: 'units', label: 'Units' },
      { key: 'cost_value', label: `Cost value (${sym})` },
      { key: 'retail_value', label: `Retail value (${sym})` },
    ], invData.by_category);
  }
}
