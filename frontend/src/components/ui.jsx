import { useEffect, useState } from 'react';
import { Icon } from './Icon.jsx';
import { navigate, Link } from '../router.jsx';

/* ---------- Buttons ---------- */

export function Button({ variant = 'primary', size, icon, children, className = '', ...rest }) {
  const cls = ['btn', `btn-${variant}`];
  if (size === 'sm') cls.push('btn-sm');
  if (rest.block) cls.push('btn-block');
  return (
    <button className={`${cls.join(' ')} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

export function IconBtn({ icon, title, danger, onClick, disabled }) {
  return (
    <button
      type="button"
      className={`btn-icon${danger ? ' danger' : ''}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size={15.5} />
    </button>
  );
}

/* ---------- Form fields ---------- */

let fieldSeq = 0;

export function Field({ label, required, error, hint, children }) {
  return (
    <div className="field">
      {label && (
        <label>
          {label} {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <div className="err" style={{ color: 'var(--muted)' }}>{hint}</div>}
      {error && <div className="err">{error}</div>}
    </div>
  );
}

export function TextField({ label, required, error, hint, type = 'text', value, onChange, ...rest }) {
  const [showPw, setShowPw] = useState(false);
  const isPw = type === 'password';
  return (
    <Field label={label} required={required} error={error} hint={hint}>
      {isPw ? (
        <div className="input-with-btn">
          <input
            className="input"
            type={showPw ? 'text' : 'password'}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            {...rest}
          />
          <IconBtn icon={showPw ? 'eye-off' : 'eye'} title={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((s) => !s)} />
        </div>
      ) : (
        <input
          className="input"
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      )}
    </Field>
  );
}

export function SelectField({ label, required, error, hint, value, onChange, options = [], placeholder, ...rest }) {
  return (
    <Field label={label} required={required} error={error} hint={hint}>
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TextArea({ label, required, error, hint, value, onChange, rows = 3, ...rest }) {
  return (
    <Field label={label} required={required} error={error} hint={hint}>
      <textarea className="input" rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  );
}

/* ---------- Badges ---------- */

const BADGE_TONES = {
  ok: 'green',
  low: 'amber',
  out: 'red',
  archived: 'gray',
  active: 'green',
  disabled: 'gray',
  completed: 'green',
  voided: 'red',
  admin: 'navy',
  manager: 'blue',
  cashier: 'gray',
};

export function Badge({ tone, children }) {
  return <span className={`badge ${BADGE_TONES[tone] || tone || 'gray'}`}>{children}</span>;
}

export function StockBadge({ state, quantity, reorderLevel }) {
  if (state === 'out') return <Badge tone="out">Out of stock</Badge>;
  if (state === 'low')
    return (
      <Badge tone="low">
        Low · {quantity} left
        {reorderLevel !== undefined ? ` / min ${reorderLevel}` : ''}
      </Badge>
    );
  if (state === 'archived') return <Badge tone="archived">Archived</Badge>;
  return <Badge tone="ok">{quantity} in stock</Badge>;
}

/* ---------- Stat cards (page-level analytics) ---------- */

export function StatCard({ label, value, sub, delta, tone, icon }) {
  return (
    <div className="stat-card">
      <div className="stat-head">
        <div className="stat-label">{label}</div>
        {icon && (
          <span className={`stat-icon ${tone ? `tone-${tone}` : ''}`}>
            <Icon name={icon} size={17} />
          </span>
        )}
      </div>
      <div className="stat-value">{value}</div>
      {(sub || (delta !== undefined && delta !== null)) && (
        <div className="stat-sub">
          {delta !== undefined && delta !== null && (
            <span className={`delta ${delta >= 0 ? 'up' : 'down'}`}>
              <Icon name={delta >= 0 ? 'trending-up' : 'trending-down'} size={13} />
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {sub}
        </div>
      )}
    </div>
  );
}

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div className="titles">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

/* ---------- Table ---------- */

export function DataTable({ columns, rows, actions, emptyState, rowKey = (r) => r.id }) {
  if (!rows || rows.length === 0) {
    return emptyState || <EmptyState title="Nothing here yet" message="No records found." />;
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`${c.align === 'right' ? 'num' : ''} ${c.sortable ? 'sortable' : ''}`} style={c.width ? { width: c.width } : undefined} onClick={c.onSort ? () => c.onSort(c.key) : undefined}>
                {c.label}
                {c.sorted === 'asc' ? ' ↑' : c.sorted === 'desc' ? ' ↓' : ''}
              </th>
            ))}
            {actions && <th className="num" style={{ width: 120 }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'num' : ''}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
              {actions && <td className="num"><div className="table-actions">{actions(r)}</div></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Pagination ---------- */

export function Pagination({ meta, onPage, onPerPage }) {
  if (!meta) return null;
  const { page, pages, total, per_page: perPage } = meta;
  const nums = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i);
  return (
    <div className="pagination">
      <span>
        Showing {total === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
      </span>
      <div className="pages" style={{ marginLeft: 'auto' }}>
        <button className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <Icon name="chevron-left" size={13} />
        </button>
        {nums.map((n) => (
          <button key={n} className={`page-btn${n === page ? ' current' : ''}`} onClick={() => onPage(n)}>
            {n}
          </button>
        ))}
        <button className="page-btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <Icon name="chevron-right" size={13} />
        </button>
      </div>
      <select
        className="input"
        style={{ width: 74, height: 30 }}
        value={perPage}
        onChange={(e) => onPerPage(Number(e.target.value))}
      >
        {[10, 25, 50].map((n) => (
          <option key={n} value={n}>
            {n} / page
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------- Empty state ---------- */

export function EmptyState({ icon = 'inbox', title, message, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <div className="icon-circle">
        <Icon name={icon} size={24} />
      </div>
      <h4>{title}</h4>
      <p>{message}</p>
      {actionLabel && (
        <Button icon="plus" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

/* ---------- Skeletons ---------- */

export function TableSkeleton({ cols = 5, rows = 6 }) {
  return (
    <div className="card-body">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          {Array.from({ length: cols }).map((__, j) => (
            <div key={j} className="skeleton" style={{ height: 18, flex: 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatSkeleton({ count = 4 }) {
  return (
    <div className="stat-row">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stat-card">
          <div className="skeleton" style={{ height: 11, width: '55%' }} />
          <div className="skeleton" style={{ height: 26, width: '40%', marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}

/* ---------- Modal ---------- */

export function Modal({ title, onClose, children, footer, size = '' }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <IconBtn icon="x" title="Close" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title = 'Are you sure?', message, confirmLabel = 'Confirm', danger, onConfirm, onClose, busy }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'solid-danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 14, lineHeight: 1.55 }}>{message}</p>
    </Modal>
  );
}

/* ---------- List/Card view toggle ---------- */

export function ViewToggle({ view, onChange }) {
  return (
    <div className="view-toggle" role="group" aria-label="View mode">
      <button type="button" className={view === 'list' ? 'active' : ''} title="List view" onClick={() => onChange('list')}>
        <Icon name="list" size={15} />
      </button>
      <button type="button" className={view === 'cards' ? 'active' : ''} title="Card view" onClick={() => onChange('cards')}>
        <Icon name="grid" size={15} />
      </button>
    </div>
  );
}

export function useViewMode(pageKey, defaultMode = 'list') {
  const [view, setView] = useState(() => localStorage.getItem(`pos_view_${pageKey}`) || defaultMode);
  const change = (m) => {
    setView(m);
    localStorage.setItem(`pos_view_${pageKey}`, m);
  };
  return [view, change];
}

/* ---------- Error block ---------- */

export function ErrorBlock({ message, onRetry }) {
  return (
    <div className="empty-state">
      <div className="icon-circle" style={{ background: 'var(--red-bg)', color: 'var(--red-fg)' }}>
        <Icon name="alert-triangle" size={22} />
      </div>
      <h4>Something went wrong</h4>
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* ---------- Forbidden ---------- */

export function Forbidden() {
  return (
    <div className="empty-state" style={{ paddingTop: 90 }}>
      <div className="icon-circle" style={{ background: 'var(--red-bg)', color: 'var(--red-fg)' }}>
        <Icon name="lock" size={24} />
      </div>
      <h4>Access restricted</h4>
      <p>Your role does not have permission to open this section.</p>
      <Button variant="secondary" onClick={() => navigate('/')}>Back to dashboard</Button>
    </div>
  );
}
