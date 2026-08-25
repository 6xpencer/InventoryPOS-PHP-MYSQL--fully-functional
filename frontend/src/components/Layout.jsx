import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar.jsx';
import { Header } from './Header.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('pos_sidebar_collapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('pos_sidebar_collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  const handleMenu = () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      setMobileOpen((o) => !o);
    } else {
      setCollapsed((c) => !c);
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="app-main">
        <Header onOpenMobile={handleMenu} />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
