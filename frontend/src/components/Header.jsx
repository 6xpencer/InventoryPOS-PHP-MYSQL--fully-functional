import { useEffect, useRef, useState, useCallback } from 'react';
import { Icon } from './Icon.jsx';
import { Button, Badge, IconBtn } from './ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import { navigate } from '../router.jsx';
import { money, initials } from '../lib/format.js';

const TITLES = {
  '/': ['Dashboard', 'Business overview'],
  '/pos': ['Point of Sale', 'New sale register'],
  '/products': ['Products', 'Inventory catalog'],
  '/categories': ['Categories', 'Product groupings'],
  '/purchases': ['Purchases', 'Stock receiving'],
  '/suppliers': ['Suppliers', 'Vendor directory'],
  '/sales': ['Transactions', 'Sales history'],
  '/customers': ['Customers', 'Client directory'],
  '/reports': ['Reports & Analytics', 'Business intelligence'],
  '/users': ['User Management', 'Staff accounts and roles'],
  '/settings': ['Settings', 'Store configuration'],
};

export function Header({ onOpenMobile }) {
  const { user, settings, signOut } = useAuth();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const searchRef = useRef(null);
  const bellRef = useRef(null);
  const userRef = useRef(null);

  const entry = TITLES[window.location.hash.replace(/^#/, '') || '/'] || ['Apex POS', ''];

  // Global product search (debounced)
  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api('products', { params: { search: q.trim(), per_page: 6 } });
        setResults(res.data);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Low-stock notifications (read/unread tracked per user server-side)
  const refreshNotifications = useCallback(async () => {
    try {
      const n = await api('notifications');
      setNotifications(n.items || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const n = await api('notifications');
        if (alive) setNotifications(n.items || []);
      } catch {
        /* ignore */
      }
    };
    load();
    const iv = setInterval(load, 120000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const toggleRead = async (item) => {
    try {
      await api('notifications/mark', {
        method: 'POST',
        body: { product_id: item.id, read: !item.read },
      });
      await refreshNotifications();
    } catch {
      /* ignore */
    }
  };

  const markAllRead = async (read) => {
    try {
      await api('notifications/mark', { method: 'POST', body: { all: true, read } });
      await refreshNotifications();
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const close = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setResults(null);
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const goToProduct = () => {
    navigate(`/products?search=${encodeURIComponent(q.trim())}`);
    setQ('');
    setResults(null);
  };

  return (
    <header className="header">
      <button type="button" className="icon-only-header hamburger" onClick={onOpenMobile} title="Toggle sidebar">
        <Icon name="menu" size={18} />
      </button>

      <div className="header-title">
        <div className="crumb">{settings.store_name}</div>
        <h2>{entry[0]}</h2>
      </div>

      <div className="header-actions">
        <div className="global-search" ref={searchRef}>
          <Icon name="search" size={16} />
          <input
            placeholder="Search products by name, SKU or barcode…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && q.trim() && goToProduct()}
          />
          {results !== null && (
            <div className="search-results">
              {results.length === 0 && (
                <div className="popover-item" style={{ color: 'var(--muted)', cursor: 'default' }}>
                  No products match “{q}”
                </div>
              )}
              {results.map((p) => (
                <div key={p.id} className="search-result-item" onClick={() => navigate(`/products?search=${encodeURIComponent(p.name)}`)}>
                  <span>
                    <b>{p.name}</b>
                    <br />
                    <span className="muted small mono">{p.sku}</span>
                  </span>
                  <Badge tone={p.stock_state === 'out' ? 'red' : p.stock_state === 'low' ? 'amber' : 'green'}>{p.quantity} pcs</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button icon="shopping-cart" onClick={() => navigate('/pos')}>
          New Sale
        </Button>

        <div className="divider-v" />

        <div className="bell-wrap" ref={bellRef}>
          <button type="button" className="icon-only-header" title={`Notifications${unreadCount ? ` — ${unreadCount} unread` : ''}`} onClick={() => setBellOpen((o) => !o)}>
            <Icon name="bell" size={17} />
            {unreadCount > 0 && <span className="bell-dot">{unreadCount}</span>}
          </button>
          {bellOpen && (
            <div className="popover">
              <div className="popover-head">
                <span>Low Stock Alerts{unreadCount > 0 ? ` · ${unreadCount} unread` : ''}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <IconBtn icon="check" title="Mark all read" onClick={() => markAllRead(true)} />
                  <IconBtn icon="mail" title="Mark all unread" onClick={() => markAllRead(false)} />
                </div>
              </div>
              {notifications.length === 0 && (
                <div className="popover-item" style={{ cursor: 'default' }}>
                  <Icon name="check" size={15} style={{ color: 'var(--green-fg)' }} />
                  All stock levels are healthy.
                </div>
              )}
              <div className="popover-scroll">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`popover-item notif-item${n.read ? ' is-read' : ''}`}
                    onClick={() => { navigate(`/products?search=${encodeURIComponent(n.sku)}`); setBellOpen(false); }}
                  >
                    <span className={`notif-dot${n.read ? ' read' : ''}`} />
                    <Icon name="alert-triangle" size={15} style={{ color: n.read ? 'var(--muted)' : 'var(--amber-fg)' }} />
                    <span style={{ flex: 1 }}>
                      <b>{n.name}</b>
                      <br />
                      <span className="muted small mono">{n.sku}</span>
                    </span>
                    <Badge tone={n.quantity <= 0 ? 'red' : 'amber'}>{n.quantity <= 0 ? 'OUT' : `${n.quantity} left`}</Badge>
                    <IconBtn
                      icon={n.read ? 'mail' : 'check'}
                      title={n.read ? 'Mark unread' : 'Mark read'}
                      onClick={(e) => { e.stopPropagation(); toggleRead(n); }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }} ref={userRef}>
          <button type="button" className="user-chip" onClick={() => setUserOpen((o) => !o)}>
            <span className="avatar">{initials(user?.full_name)}</span>
            <span className="user-meta">
              <span className="name">{user?.full_name}</span>
              <br />
              <span className="role">{user?.role}</span>
            </span>
            <Icon name="chevron-down" size={14} />
          </button>
          {userOpen && (
            <div className="dropdown-menu">
              <div className="dropdown-item" style={{ cursor: 'default' }}>
                <Icon name="user" size={15} />
                <span>
                  Signed in as
                  <br />
                  <b>{user?.username}</b>
                </span>
              </div>
              <div className="dropdown-sep" />
              {['admin'].includes(user?.role) && (
                <button type="button" className="dropdown-item" onClick={() => { navigate('/users'); setUserOpen(false); }}>
                  <Icon name="shield" size={15} /> Manage users
                </button>
              )}
              {['admin', 'manager'].includes(user?.role) && (
                <button type="button" className="dropdown-item" onClick={() => { navigate('/settings'); setUserOpen(false); }}>
                  <Icon name="settings" size={15} /> Store settings
                </button>
              )}
              <button type="button" className="dropdown-item danger" onClick={signOut}>
                <Icon name="log-out" size={15} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
