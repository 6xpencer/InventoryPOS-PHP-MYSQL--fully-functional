import { Suspense, lazy } from 'react';
import { useRoute, navigate } from './router.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { Layout } from './components/Layout.jsx';
import { Spinner, Forbidden } from './components/ui.jsx';

const LoginPage = lazy(() => import('./pages/Login.jsx').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./pages/Dashboard.jsx').then((m) => ({ default: m.DashboardPage })));
const POSPage = lazy(() => import('./pages/POS.jsx').then((m) => ({ default: m.POSPage })));
const ProductsPage = lazy(() => import('./pages/Products.jsx').then((m) => ({ default: m.ProductsPage })));
const CategoriesPage = lazy(() => import('./pages/Categories.jsx').then((m) => ({ default: m.CategoriesPage })));
const SuppliersPage = lazy(() => import('./pages/Suppliers.jsx').then((m) => ({ default: m.SuppliersPage })));
const CustomersPage = lazy(() => import('./pages/Customers.jsx').then((m) => ({ default: m.CustomersPage })));
const PurchasesPage = lazy(() => import('./pages/Purchases.jsx').then((m) => ({ default: m.PurchasesPage })));
const SalesPage = lazy(() => import('./pages/Sales.jsx').then((m) => ({ default: m.SalesPage })));
const ReportsPage = lazy(() => import('./pages/Reports.jsx').then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx').then((m) => ({ default: m.UsersPage })));
const SettingsPage = lazy(() => import('./pages/Settings.jsx').then((m) => ({ default: m.SettingsPage })));

const ROUTES = {
  '/': { page: DashboardPage, roles: null },
  '/pos': { page: POSPage, roles: null },
  '/products': { page: ProductsPage, roles: null, passQuery: true },
  '/categories': { page: CategoriesPage, roles: null },
  '/purchases': { page: PurchasesPage, roles: ['admin', 'manager'] },
  '/suppliers': { page: SuppliersPage, roles: ['admin', 'manager'] },
  '/sales': { page: SalesPage, roles: null, passQuery: true },
  '/customers': { page: CustomersPage, roles: null },
  '/reports': { page: ReportsPage, roles: ['admin', 'manager'] },
  '/users': { page: UsersPage, roles: ['admin'] },
  '/settings': { page: SettingsPage, roles: ['admin', 'manager'] },
};

export function App() {
  const { user, booting } = useAuth();
  const route = useRoute();

  if (booting) {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
        <div>
          <Spinner />
          <p className="muted" style={{ textAlign: 'center' }}>Loading Apex POS…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (route.path === '/login') {
    navigate('/');
    return null;
  }

  const def = ROUTES[route.path];
  let content;
  if (!def) {
    content = (
      <div className="empty-state" style={{ paddingTop: 90 }}>
        <h4>Page not found</h4>
        <p>The page “{route.path}” does not exist.</p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>Back to dashboard</button>
      </div>
    );
  } else if (def.roles && !def.roles.includes(user.role)) {
    content = <Forbidden />;
  } else {
    const Page = def.page;
    content = def.passQuery ? <Page initialQuery={route.query} /> : <Page />;
  }

  return (
    <Layout>
      <Suspense fallback={<div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><Spinner /></div>}>
        {content}
      </Suspense>
    </Layout>
  );
}
