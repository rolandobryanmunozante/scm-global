import type { ReactNode } from "react";
import { useAuth } from "./auth/AuthContext";
import { LoadingState } from "./components/ui";
import { AppLayout } from "./layout/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { GlobalMapPage } from "./pages/GlobalMapPage";
import { InventoryPage } from "./pages/InventoryPage";
import { LoginPage } from "./pages/LoginPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { OperationsGuidePage } from "./pages/OperationsGuidePage";
import { PresentationDemoPage } from "./pages/PresentationDemoPage";
import { PurchaseOrdersPage } from "./pages/PurchaseOrdersPage";
import { ReportsPage } from "./pages/ReportsPage";
import { RoutesPage } from "./pages/RoutesPage";
import { ShipmentsPage } from "./pages/ShipmentsPage";
import { SupplierPortalPage } from "./pages/SupplierPortalPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { TrackingPage } from "./pages/TrackingPage";
import { UsersPage } from "./pages/UsersPage";
import {
  BrowserRouter,
  Navigate,
  RouteParams,
  matchRoute,
  useLocation,
} from "./router";

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

function AppRoutes() {
  const { pathname } = useLocation();
  if (pathname === "/login") return <LoginPage />;
  if (pathname === "/rastreo") return <TrackingPage />;

  const tracking = matchRoute("/rastreo/:code", pathname);
  if (tracking.matched) {
    return (
      <RouteParams params={tracking.params}>
        <TrackingPage />
      </RouteParams>
    );
  }

  const protectedPage = resolveProtectedPage(pathname);
  return (
    <Protected>
      {protectedPage ? <AppLayout>{protectedPage}</AppLayout> : <Navigate to="/" replace />}
    </Protected>
  );
}

function resolveProtectedPage(pathname: string): ReactNode | null {
  const routes: Record<string, ReactNode> = {
    "/": <HomeRoute />,
    "/proveedores": <Permission permission="suppliers.read"><SuppliersPage /></Permission>,
    "/inventario": <Permission permission="inventory.read"><InventoryPage /></Permission>,
    "/ordenes": <Permission permission="purchases.read"><PurchaseOrdersPage /></Permission>,
    "/rutas": <Permission permission="routes.manage"><RoutesPage /></Permission>,
    "/envios": <Permission permission="shipments.read"><ShipmentsPage /></Permission>,
    "/mapa-global": <Permission permission="shipments.read"><GlobalMapPage /></Permission>,
    "/reportes": <Permission permission="reports.read"><ReportsPage /></Permission>,
    "/usuarios": <Permission permission="users.manage"><UsersPage /></Permission>,
    "/portal-proveedor": (
      <Role role="SUPPLIER">
        <Permission permission="supplier.portal"><SupplierPortalPage /></Permission>
      </Role>
    ),
    "/notificaciones": <NotificationsPage />,
    "/guia-operativa": <OperationsGuidePage />,
    "/demo-presentacion": <Permission permission="reports.read"><PresentationDemoPage /></Permission>,
  };
  return routes[pathname] ?? null;
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  return user ? children : <Navigate to="/login" replace />;
}

function Permission({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useAuth();
  return can(permission) ? children : <Navigate to="/" replace />;
}

function Role({ role, children }: { role: string; children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === role ? children : <Navigate to="/" replace />;
}

function HomeRoute() {
  const { can } = useAuth();
  if (can("reports.read")) return <DashboardPage />;
  if (can("supplier.portal")) return <Navigate to="/portal-proveedor" replace />;
  if (can("shipments.read")) return <Navigate to="/envios" replace />;
  if (can("tracking.read")) return <Navigate to="/rastreo" replace />;
  if (can("inventory.read")) return <Navigate to="/inventario" replace />;
  if (can("suppliers.read")) return <Navigate to="/proveedores" replace />;
  return <Navigate to="/notificaciones" replace />;
}
