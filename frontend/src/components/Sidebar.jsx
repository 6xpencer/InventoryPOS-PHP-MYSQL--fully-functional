import { Icon } from './Icon.jsx';
import { Link } from '../router.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const NAV = [
  {
    section: 'Main',
    items: [
      { to: '/', label: 'Dashboard', icon: 'grid', end: true },
      { to: '/pos', label: 'Point of Sale', icon: 'shopping-cart' },
    ],
  },
  {
    section: 'Inventory',
    items: [
      { to: '/products', label: 'Products', icon: 'package' },
      { to: '/categories', label: 'Categories', icon: 'layers' },
      { to: '/purchases', label: 'Purchases', icon: 'clipboard', roles: ['admin', 'manager'] },
      { to: '/suppliers', label: 'Suppliers', icon: 'truck', roles: ['admin', 'manager'] },
    ],
  },
  {
    section: 'Sales',
    items: [
      { to: '/sales', label: 'Transactions', icon: 'file-text' },
      { to: '/customers', label: 'Customers', icon: 'users' },
      { to: '/reports', label: 'Reports & Analytics', icon: 'pie-chart', roles: ['admin', 'manager'] },
    ],
  },
  {
    section: 'System',
    items: [
      { to: '/users', label: 'Users', icon: 'shield', roles: ['admin'] },
      { to: '/settings', label: 'Settings', icon: 'settings', roles: ['admin', 'manager'] },
    ],
  },
];

export function Sidebar({ collapsed, mobileOpen, onCloseMobile, lowStockCount }) {
  const { user } = useAuth();

  return (
    <>
      <div className={`sidebar-backdrop${mobileOpen ? ' show' : ''}`} onClick={onCloseMobile} />
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
        <Link to="/" className="sidebar-brand" style={{ textDecoration: 'none' }}>
          <span className="brand-mark">A</span>
          <span className="brand-text">
            <span className="name">APEX POS</span>
            <br />
            <span className="tag">Inventory Suite</span>
          </span>
        </Link>

        <nav className="sidebar-nav">
          {NAV.map((group) => {
            const items = group.items.filter((i) => !i.roles || (user && i.roles.includes(user.role)));
            if (!items.length) return null;
            return (
              <div key={group.section}>
                <div className="side-section-label">{group.section}</div>
                {items.map((item) => (
                  <NavLink key={item.to} {...item} badge={item.to === '/products' ? lowStockCount : null} onClickMobile={onCloseMobile} />
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function NavLink({ to, label, icon, end, badge, onClickMobile }) {
  const current = window.location.hash.replace(/^#/, '') || '/';
  const isActive = end ? current === to : current.startsWith(to);
  return (
    <Link to={to} className={`nav-item${isActive ? ' active' : ''}`} title={label} onClick={onClickMobile}>
      <span className="nav-icon">
        <Icon name={icon} size={18.5} />
      </span>
      <span className="nav-label">{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </Link>
  );
}
