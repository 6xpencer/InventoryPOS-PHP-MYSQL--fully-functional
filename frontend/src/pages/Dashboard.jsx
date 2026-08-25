import { useMemo } from 'react';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { StatCard, StatSkeleton, PageHead, ErrorBlock, Badge } from '../components/ui.jsx';
import { AreaChart, DonutChart, BarChart, Sparkline } from '../components/charts.jsx';
import { Icon } from '../components/Icon.jsx';
import { money, num, pctDelta } from '../lib/format.js';
import { navigate } from '../router.jsx';

export function DashboardPage() {
  const { settings } = useAuth();
  const sym = settings.currency_symbol || '$';
  const { data, loading, error, reload } = useApi('dashboard/stats');

  if (error) return <ErrorBlock message={error} onRetry={reload} />;

  const d = data;
  const delta = useMemo(
    () => (d ? pctDelta(d.today.revenue, d.today.yesterday_rev) : null),
    [d]
  );
  const series = useMemo(
    () =>
      (d?.series || []).map((s) => ({
        label: new Date(s.date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: s.revenue,
        tooltip: `${money(s.revenue, sym)} · ${s.orders} order${s.orders === 1 ? '' : 's'}`,
      })),
    [d, sym]
  );

  return (
    <>
      <PageHead title="Dashboard" subtitle={`Live overview for ${settings.store_name}`}>
        <button type="button" className="icon-only-header" onClick={reload} title="Refresh">
          <Icon name="refresh" size={16} />
        </button>
      </PageHead>

      {loading && !d ? (
        <StatSkeleton />
      ) : (
        <div className="stat-row">
          <div className="stat-card" style={{ position: 'relative' }}>
            <Sparkline values={(d.series || []).map((s) => s.revenue)} color={sym} />
            <div className="stat-label"><Icon name="dollar-sign" size={13} /> Revenue today</div>
            <div className="stat-value">{money(d.today.revenue, sym)}</div>
            <div className="stat-sub">
              {delta !== null ? (
                <span className={`delta ${delta >= 0 ? 'up' : 'down'}`}>
                  <Icon name={delta >= 0 ? 'trending-up' : 'trending-down'} size={13} />
                  {Math.abs(delta).toFixed(1)}%
                </span>
              ) : (
                <span>vs yesterday</span>
              )}
              <span>yesterday {money(d.today.yesterday_rev, sym)}</span>
            </div>
          </div>
          <StatCard label="Orders today" icon="shopping-cart" value={num(d.today.orders)} sub={`${(d.payments || []).reduce((s, p) => s + p.count, 0)} in last 30 days`} tone="" />
          <StatCard label="Inventory cost value" icon="package" value={money(d.inventory.cost_value, sym)} sub={`${num(d.inventory.units)} units · retail ${money(d.inventory.retail_value, sym)}`} tone="green" />
          <StatCard label="Low stock items" icon="alert-triangle" value={num(d.low_stock_count)} sub="At or below reorder level" tone={d.low_stock_count > 0 ? 'amber' : 'green'} />
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3>Revenue — last 14 days</h3>
          </div>
          <div className="card-body">
            <AreaChart data={series} formatValue={(v) => money(v, sym).replace(/\.\d\d$/, '')} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Payment mix — 30 days</h3>
          </div>
          <div className="card-body" style={{ display: 'grid', placeItems: 'center' }}>
            <DonutChart
              data={(d?.payments || []).map((p) => ({
                label: p.method.charAt(0).toUpperCase() + p.method.slice(1),
                value: p.amount,
                tooltip: money(p.amount, sym),
              }))}
              centerLabel="collected"
              centerValue={compact((d?.payments || []).reduce((s, p) => s + p.amount, 0), sym)}
              formatValue={(v) => money(v, sym)}
            />
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Top products — 30 days</h3>
          </div>
          <div className="card-body">
            {(d?.top_products || []).length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: '26px 0' }}>No sales recorded yet. Completed sales will rank products here.</p>
            ) : (
              <BarChart
                data={(d?.top_products || []).map((p) => ({
                  label: p.name,
                  subLabel: `${p.qty} sold`,
                  value: p.revenue,
                  tooltip: money(p.revenue, sym),
                }))}
                formatValue={(v) => compact(v, sym)}
              />
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card">
            <div className="card-head">
              <h3>Recent transactions</h3>
              <span className="spacer" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/sales')}>View all</button>
            </div>
            <div className="card-body tight table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Cashier</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(d?.recent_sales || []).length === 0 && (
                    <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>No sales yet</td></tr>
                  )}
                  {(d?.recent_sales || []).map((s) => (
                    <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/sales?ref=${s.reference}`)}>
                      <td className="mono">{s.reference}</td>
                      <td>{s.cashier_name || '—'}</td>
                      <td className="num"><b>{money(s.total, sym)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Stock alerts</h3>
              <span className="spacer" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/products?low=1')}>Manage</button>
            </div>
            <div className="card-body tight table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Qty</th>
                    <th className="num">Reorder at</th>
                  </tr>
                </thead>
                <tbody>
                  {(d?.low_stock || []).length === 0 && (
                    <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>
                      <Icon name="check" size={14} /> All stock levels healthy
                    </td></tr>
                  )}
                  {(d?.low_stock || []).map((l) => (
                    <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/products?search=${encodeURIComponent(l.sku)}`)}>
                      <td>
                        <b>{l.name}</b>
                        <br /><span className="muted small mono">{l.sku}</span>
                      </td>
                      <td className="num"><Badge tone={l.quantity <= 0 ? 'red' : 'amber'}>{l.quantity <= 0 ? 'OUT' : l.quantity}</Badge></td>
                      <td className="num muted">{l.reorder_level}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function compact(n, sym) {
  if (Math.abs(n) >= 1000000) return `${sym}${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${sym}${(n / 1000).toFixed(1)}K`;
  return money(n, sym);
}
