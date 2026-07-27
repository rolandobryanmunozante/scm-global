import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { LoadingState } from "./components/ui";
import { AppLayout } from "./layout/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { GlobalMapPage } from "./pages/GlobalMapPage";
import { InventoryPage } from "./pages/InventoryPage";
import { LoginPage } from "./pages/LoginPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { PurchaseOrdersPage } from "./pages/PurchaseOrdersPage";
import { ReportsPage } from "./pages/ReportsPage";
import { RoutesPage } from "./pages/RoutesPage";
import { ShipmentsPage } from "./pages/ShipmentsPage";
import { SupplierPortalPage } from "./pages/SupplierPortalPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { TrackingPage } from "./pages/TrackingPage";
import { UsersPage } from "./pages/UsersPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/rastreo" element={<TrackingPage />} />
        <Route path="/rastreo/:code" element={<TrackingPage />} />
        <Route element={<Protected><AppLayout /></Protected>}>
          <Route index element={<HomeRoute />} />
          <Route path="/proveedores" element={<Permission permission="suppliers.read"><SuppliersPage /></Permission>} />
          <Route path="/inventario" element={<Permission permission="inventory.read"><InventoryPage /></Permission>} />
          <Route path="/ordenes" element={<Permission permission="purchases.read"><PurchaseOrdersPage /></Permission>} />
          <Route path="/rutas" element={<Permission permission="routes.manage"><RoutesPage /></Permission>} />
          <Route path="/envios" element={<Permission permission="shipments.read"><ShipmentsPage /></Permission>} />
          <Route path="/mapa-global" element={<Permission permission="shipments.read"><GlobalMapPage /></Permission>} />
          <Route path="/reportes" element={<Permission permission="reports.read"><ReportsPage /></Permission>} />
          <Route path="/usuarios" element={<Permission permission="users.manage"><UsersPage /></Permission>} />
          <Route path="/portal-proveedor" element={<Role role="SUPPLIER"><Permission permission="supplier.portal"><SupplierPortalPage /></Permission></Role>} />
          <Route path="/notificaciones" element={<NotificationsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
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
  if (can("inventory.read")) return <Navigate to="/inventario" replace />;
  if (can("suppliers.read")) return <Navigate to="/proveedores" replace />;
  return <Navigate to="/notificaciones" replace />;
}
