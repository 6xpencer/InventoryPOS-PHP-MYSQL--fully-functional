import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button, IconBtn, Modal, Badge, Spinner, EmptyState, TextField } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { money, num } from '../lib/format.js';
import { CustomerFormModal } from './Customers.jsx';

const METHODS = [
  { value: 'cash', label: 'Cash', icon: 'dollar-sign' },
  { value: 'card', label: 'Card', icon: 'credit-card' },
  { value: 'mobile', label: 'Mobile', icon: 'smartphone' },
];

export function POSPage() {
  const { settings } = useAuth();
  const toast = useToast();
  const sym = settings.currency_symbol || '$';
  const taxRate = Number(settings.tax_rate) || 0;

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cart, setCart] = useState([]); // {product, qty}
  const [discount, setDiscount] = useState('0');
  const [method, setMethod] = useState('cash');
  const [paid, setPaid] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState([]);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const productsQ = useApi('products', { status: 'active', per_page: 1000 });
  const catsQ = useApi('categories');
  const todayQ = useApi('sales/stats');

  useEffect(() => {
    api('customers/all').then((r) => setCustomers(r.data)).catch(() => {});
  }, []);

  const allProducts = useMemo(() => productsQ.data?.data || [], [productsQ.data]);
  const categories = useMemo(() => catsQ.data?.data || [], [catsQ.data]);

  const filtered = useMemo(() => {
    let list = allProducts;
    if (categoryId) list = list.filter((p) => String(p.category_id) === String(categoryId));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [allProducts, categoryId, search]);

  const visible = useMemo(() => filtered.slice(0, 60), [filtered]);

  const cartMap = useMemo(() => new Map(cart.map((c) => [c.product.id, c])), [cart]);

  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.qty * c.product.sell_price, 0), [cart]);
  const discountNum = Math.min(Number(discount) || 0, subtotal);
  const taxable = Math.max(0, subtotal - discountNum);
  const tax = round2((taxable * taxRate) / 100);
  const total = round2(taxable + tax);
  const paidNum = paid === '' ? total : Number(paid) || 0;
  const change = Math.max(0, round2(paidNum - total));

  const addToCart = useCallback((product) => {
    if ((product.quantity || 0) <= 0) {
      toast(`"${product.name}" is out of stock.`, 'error');
      return;
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        if (existing.qty >= product.quantity) {
          toast(`Only ${product.quantity} unit(s) of "${product.name}" in stock.`, 'error');
          return prev;
        }
        return prev.map((c) => (c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { product, qty: 1 }];
    });
  }, [toast]);

  function setQty(productId, qty) {
    setCart((prev) =>
      prev
        .map((c) => (c.product.id === productId ? { ...c, qty: Math.max(0, Math.min(qty, c.product.quantity)) } : c))
        .filter((c) => c.qty > 0)
    );
  }

  async function checkout() {
    if (!cart.length) return;
    if (paidNum < total - 0.001) {
      toast('Paid amount is less than the total due.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api('sales', {
        method: 'POST',
        body: {
          items: cart.map((c) => ({ product_id: c.product.id, quantity: c.qty })),
          customer_id: customerId || null,
          discount: discountNum,
          payment_method: method,
          paid_amount: paidNum,
        },
      });
      setReceipt(res.sale);
      setCart([]);
      setDiscount('0');
      setPaid('');
      setMethod('cash');
      setCustomerId('');
      toast(`Sale ${res.sale.sale.reference} completed.`);
      todayQ.reload();
      productsQ.reload();
    } catch (e) {
      toast(e.message, 'error');
    }
    setSubmitting(false);
  }

  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <div className="stat-card">
          <div className="stat-head">
            <div className="stat-label">Revenue today</div>
            <span className="stat-icon tone-blue"><Icon name="dollar-sign" size={17} /></span>
          </div>
          <div className="stat-value">{money(todayQ.data?.stats.revenue ?? 0, sym)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-head">
            <div className="stat-label">Orders today</div>
            <span className="stat-icon"><Icon name="shopping-cart" size={17} /></span>
          </div>
          <div className="stat-value">{num(todayQ.data?.stats.orders_count ?? 0)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-head">
            <div className="stat-label">Avg order value</div>
            <span className="stat-icon tone-green"><Icon name="percent" size={17} /></span>
          </div>
          <div className="stat-value">{money(todayQ.data?.stats.avg_order_value ?? 0, sym)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-head">
            <div className="stat-label">Items in cart</div>
            <span className="stat-icon tone-amber"><Icon name="package" size={17} /></span>
          </div>
          <div className="stat-value">{cart.reduce((s, c) => s + c.qty, 0)}</div>
        </div>
      </div>

      <div className="pos-layout">
        <section className="pos-catalog">
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="global-search" style={{ flex: 1, maxWidth: 420 }}>
              <Icon name="search" size={16} />
              <input autoFocus placeholder="Scan barcode or search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {search && (
              <Button variant="secondary" icon="x" onClick={() => setSearch('')}>Clear</Button>
            )}
          </div>

          <div className="chip-row">
            <button type="button" className={`chip${categoryId === '' ? ' active' : ''}`} onClick={() => setCategoryId('')}>
              All ({allProducts.length})
            </button>
            {categories.map((c) => (
              <button type="button" key={c.id} className={`chip${String(categoryId) === String(c.id) ? ' active' : ''}`} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>

          <div className="pos-products">
            {filtered.length > visible.length && (
              <div className="muted small" style={{ padding: '2px 2px 8px' }}>
                Showing first {visible.length} of {filtered.length} matches — refine your search to narrow down.
              </div>
            )}
            {productsQ.loading && !allProducts.length && <Spinner />}
            {!productsQ.loading && visible.length === 0 && (
              <EmptyState icon="package" title="No products available" message="Add products in the Products section to start selling." />
            )}
            {visible.map((p) => (
              <ProductTile
                key={p.id}
                p={p}
                sym={sym}
                inCart={cartMap.get(p.id)?.qty || 0}
                onAdd={addToCart}
              />
            ))}
          </div>
        </section>

        <aside className="cart-panel">
          <div className="cart-head">
            <Icon name="shopping-cart" size={17} />
            <h3>Current Sale</h3>
            {cart.length > 0 && <IconBtn icon="trash" title="Clear cart" onClick={() => setCart([])} />}
          </div>

          <div className="cart-lines">
            {cart.length === 0 && (
              <div className="cart-empty">
                <Icon name="inbox" size={30} />
                <br /><br />
                Cart is empty.<br />Click a product tile to add it.
              </div>
            )}
            {cart.map((c) => (
              <div className="cart-line" key={c.product.id}>
                <div className="info">
                  <div className="name" title={c.product.name}>{c.product.name}</div>
                  <div className="price">{money(c.product.sell_price, sym)} × {c.qty} = <b>{money(c.product.sell_price * c.qty, sym)}</b></div>
                </div>
                <div className="qty-stepper">
                  <button type="button" onClick={() => setQty(c.product.id, c.qty - 1)}>−</button>
                  <span>{c.qty}</span>
                  <button type="button" disabled={c.qty >= c.product.quantity} onClick={() => setQty(c.product.id, c.qty + 1)}>+</button>
                </div>
                <IconBtn icon="x" title="Remove" danger onClick={() => setQty(c.product.id, 0)} />
              </div>
            ))}
          </div>

          <div className="cart-summary">
            <div className="sum-row"><span>Subtotal</span><b>{money(subtotal, sym)}</b></div>
            <div className="sum-row" style={{ alignItems: 'center' }}>
              <span>Discount</span>
              <input className="input" style={{ width: 110, height: 30 }} type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div className="sum-row"><span>Tax ({taxRate}%)</span><b>{money(tax, sym)}</b></div>
            <div className="sum-row total"><span>Total due</span><span>{money(total, sym)}</span></div>

            <div className="sum-row"><span>Customer</span></div>
            <div className="input-with-btn">
              <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Walk-in customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
                ))}
              </select>
              <IconBtn icon="plus" title="New customer" onClick={() => setShowCustomerForm(true)} />
            </div>

            <div className="cart-paygrid">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={`chip${method === m.value ? ' active' : ''}`}
                  style={{ display: 'flex', justifyContent: 'center' }}
                  onClick={() => setMethod(m.value)}
                >
                  <Icon name={m.icon} size={14} />&nbsp;{m.label}
                </button>
              ))}
            </div>

            <TextField label="Amount received" type="number" min="0" step="0.01" value={paid} onChange={setPaid} placeholder={String(total.toFixed(2))} />

            <div className="quick-cash">
              <button type="button" onClick={() => setPaid(total.toFixed(2))}>Exact</button>
              {[5, 10, 20, 50, 100].map((v) => (
                <button key={v} type="button" onClick={() => setPaid(String(v))}>{sym}{v}</button>
              ))}
            </div>

            <div className="sum-row"><span>Change due</span><b style={{ color: change > 0 ? 'var(--green-fg)' : undefined }}>{money(change, sym)}</b></div>

            <Button block disabled={!cart.length || submitting} onClick={checkout} icon="check">
              {submitting ? 'Processing…' : `Complete sale — ${money(total, sym)}`}
            </Button>
          </div>
        </aside>
      </div>

      {showCustomerForm && (
        <CustomerFormModal
          onClose={() => setShowCustomerForm(false)}
          onSaved={(c) => {
            api('customers/all').then((r) => {
              setCustomers(r.data);
              setCustomerId(String(c.id));
            }).catch(() => {});
          }}
        />
      )}

      {receipt && <ReceiptModal salePayload={receipt} sym={sym} storeSettings={settings} onClose={() => setReceipt(null)} />}
    </>
  );
}

function ReceiptModal({ salePayload, sym, storeSettings, onClose }) {
  const s = salePayload.sale;
  const items = salePayload.items;
  return (
    <Modal
      title={`Sale completed — ${s.reference}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>New sale</Button>
          <Button variant="secondary" icon="printer" onClick={() => window.print()}>Print receipt</Button>
        </>
      }
    >
      <div className="print-area receipt">
        <div className="center">
          <b style={{ fontSize: 15 }}>{storeSettings.store_name || 'Apex POS'}</b><br />
          {storeSettings.store_address && <>{storeSettings.store_address}<br /></>}
          {storeSettings.store_phone && <>{storeSettings.store_phone}<br /></>}
          <hr />
          <b>SALES RECEIPT</b><br />
          {s.reference}
        </div>
        <hr />
        <table>
          <tbody>
            <tr><td>Date</td><td style={{ textAlign: 'right' }}>{s.created_at}</td></tr>
            <tr><td>Cashier</td><td style={{ textAlign: 'right' }}>{s.cashier_name || '—'}</td></tr>
            <tr><td>Customer</td><td style={{ textAlign: 'right' }}>{s.customer_name || 'Walk-in'}</td></tr>
            <tr><td>Payment</td><td style={{ textAlign: 'right' }}>{s.payment_method.toUpperCase()}</td></tr>
          </tbody>
        </table>
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
            {items.map((it) => (
              <tr key={it.id}>
                <td>
                  {it.product_name}
                  <br />
                  <small>@ {money(it.unit_price, sym)}</small>
                </td>
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
            {Number(s.discount) > 0 && <tr><td>Discount</td><td style={{ textAlign: 'right' }}>-{money(s.discount, sym)}</td></tr>}
            <tr><td>Tax</td><td style={{ textAlign: 'right' }}>{money(s.tax, sym)}</td></tr>
            <tr><td><b>TOTAL</b></td><td style={{ textAlign: 'right' }}><b>{money(s.total, sym)}</b></td></tr>
            <tr><td>Paid ({s.payment_method})</td><td style={{ textAlign: 'right' }}>{money(s.paid_amount, sym)}</td></tr>
            <tr><td>Change</td><td style={{ textAlign: 'right' }}>{money(s.change_due, sym)}</td></tr>
          </tbody>
        </table>
        <hr />
        <div className="center">{storeSettings.receipt_footer || 'Thank you for your business!'}</div>
      </div>
    </Modal>
  );
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const ProductTile = memo(function ProductTile({ p, sym, inCart, onAdd }) {
  const out = p.quantity <= 0;
  return (
    <button
      type="button"
      className="pos-product-tile"
      disabled={out}
      onClick={() => onAdd(p)}
      title={out ? 'Out of stock' : `${p.name} — ${money(p.sell_price, sym)} (${p.quantity} in stock)`}
    >
      <span className="pos-tile-name">{p.name}</span>
      <span className="pos-tile-price">{money(p.sell_price, sym)}</span>
      <span className="pos-tile-sku mono">{p.sku}</span>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Badge tone={out ? 'red' : p.quantity <= p.reorder_level ? 'amber' : 'green'}>
          {out ? 'OUT' : `${p.quantity} left`}
        </Badge>
        {inCart > 0 && <Badge tone="navy">×{inCart}</Badge>}
      </span>
    </button>
  );
});
