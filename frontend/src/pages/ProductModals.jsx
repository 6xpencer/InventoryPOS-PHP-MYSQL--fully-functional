import { useState } from 'react';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, Button, TextField, SelectField, Badge, DataTable } from '../components/ui.jsx';
import { money, fmtDateTime } from '../lib/format.js';

export function ProductFormModal({ form, categories, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(form.id);
  const [f, setF] = useState(form);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const suppliersQ = useApi('suppliers/all');
  const suppliers = suppliersQ.data?.data || [];

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function save(e) {
    if (e) e.preventDefault();
    const errs = {};
    if (!f.name.trim()) errs.name = 'Name is required.';
    if (!f.sku.trim()) errs.sku = 'SKU is required.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const body = {
        sku: f.sku.trim(),
        name: f.name.trim(),
        category_id: f.category_id || null,
        supplier_id: f.supplier_id || null,
        barcode: f.barcode.trim() || null,
        cost_price: Number(f.cost_price) || 0,
        sell_price: Number(f.sell_price) || 0,
        reorder_level: Number(f.reorder_level) || 0,
        status: f.status,
      };
      if (isEdit) {
        await api(`products/${f.id}`, { method: 'PUT', body });
        toast('Product updated.');
      } else {
        body.quantity = Number(f.quantity) || 0;
        await api('products', { method: 'POST', body });
        toast('Product created.');
      }
      onSaved();
      onClose();
    } catch (err) {
      setErrors({ _global: err.message });
    }
    setBusy(false);
  }

  return (
    <Modal
      title={isEdit ? `Edit product — ${f.name}` : 'New product'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon="save" onClick={() => save()} disabled={busy}>{busy ? 'Saving…' : 'Save product'}</Button>
        </>
      }
    >
      {errors._global && <div className="login-alert"><span>{errors._global}</span></div>}
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="form-grid">
          <TextField label="SKU" required value={f.sku} onChange={set('sku')} error={errors.sku} placeholder="e.g. BEV-001" />
          <SelectField label="Status" value={f.status} onChange={set('status')} options={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]} />
          <TextField label="Product name" required value={f.name} onChange={set('name')} error={errors.name} />
          <TextField label="Barcode" value={f.barcode} onChange={set('barcode')} placeholder="Scan or type" />
          <SelectField label="Category" value={f.category_id} onChange={set('category_id')} placeholder="Uncategorized"
            options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          <SelectField label="Supplier" value={f.supplier_id} onChange={set('supplier_id')} placeholder="None selected"
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
          <TextField label="Cost price" type="number" min="0" step="0.01" value={f.cost_price} onChange={set('cost_price')} />
          <TextField label="Sell price" required type="number" min="0" step="0.01" value={f.sell_price} onChange={set('sell_price')} />
          {!isEdit && (
            <TextField label="Opening quantity" type="number" min="0" value={f.quantity} onChange={set('quantity')} hint="Adjustable later via stock controls." />
          )}
          <TextField label="Reorder level" type="number" min="0" value={f.reorder_level} onChange={set('reorder_level')} hint="Low-stock alert threshold." />
        </div>
      </form>
    </Modal>
  );
}

export function AdjustStockModal({ product, onClose, onSaved }) {
  const toast = useToast();
  const [change, setChange] = useState('+1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const n = Number(change);
    if (!Number.isInteger(n) || n === 0) {
      toast('Enter a non-zero whole number (use - to reduce).', 'error');
      return;
    }
    if (product.quantity + n < 0) {
      toast(`Cannot go below zero. Current quantity is ${product.quantity}.`, 'error');
      return;
    }
    if (!note.trim()) {
      toast('A note is required for audit purposes.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api('stock/adjust', { method: 'POST', body: { product_id: product.id, change_qty: n, note: note.trim() } });
      toast(`Stock adjusted by ${n > 0 ? '+' : ''}${n}.`);
      onSaved();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
    setBusy(false);
  }

  return (
    <Modal
      title={`Adjust stock — ${product.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon="check" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Apply adjustment'}</Button>
        </>
      }
    >
      <div className="kv-list" style={{ marginBottom: 16 }}>
        <div className="row"><span className="k">Current quantity</span><span className="v"><Badge tone="navy">{product.quantity}</Badge></span></div>
        <div className="row"><span className="k">After adjustment</span><span className="v">{product.quantity + (parseInt(change, 10) || 0)}</span></div>
      </div>
      <div className="form-grid">
        <TextField label="Quantity change (+/-)" required value={change} onChange={setChange} hint="Positive adds stock, negative removes." />
        <TextField label="Reason / note" required value={note} onChange={setNote} placeholder="e.g. Damaged goods, recount…" />
      </div>
    </Modal>
  );
}

const TYPE_TONES = { purchase: 'green', sale: 'blue', adjustment: 'amber', void_restore: 'gray', initial: 'navy' };

export function MovementsModal({ productId, onClose }) {
  const q = useApi('stock/movements', { product_id: productId });
  const rows = q.data?.data || [];
  return (
    <Modal title="Stock movement history" size="lg" onClose={onClose}>
      <DataTable
        columns={[
          { key: 'created_at', label: 'When', render: (r) => fmtDateTime(r.created_at) },
          {
            key: 'type', label: 'Type',
            render: (r) => <Badge tone={TYPE_TONES[r.type] || 'gray'}>{r.type.replace('_', ' ')}</Badge>,
          },
          {
            key: 'change_qty', label: 'Change', align: 'right',
            render: (r) => (
              <b style={{ color: r.change_qty > 0 ? 'var(--green-fg)' : 'var(--red-fg)' }}>
                {r.change_qty > 0 ? '+' : ''}{r.change_qty}
              </b>
            ),
          },
          { key: 'reference', label: 'Reference', render: (r) => <span className="mono small">{r.reference || '—'}</span> },
          { key: 'note', label: 'Note', render: (r) => r.note || <span className="muted">—</span> },
          { key: 'user_name', label: 'By', render: (r) => r.user_name || <span className="muted">System</span> },
        ]}
        rows={rows}
        emptyState={
          <div className="empty-state" style={{ padding: 30 }}>
            <p>No movements recorded yet.</p>
          </div>
        }
      />
    </Modal>
  );
}
