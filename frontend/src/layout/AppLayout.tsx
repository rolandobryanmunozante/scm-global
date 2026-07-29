import {
  BarChart3,
  Bell,
  BookOpenCheck,
  Boxes,
  Building2,
  ChevronLeft,
  ClipboardList,
  FileChartColumn,
  Globe2,
  Languages,
  LogOut,
  Map,
  Menu,
  Moon,
  PackageSearch,
  Route,
  Settings,
  Sun,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { NavLink, useLocation } from "../router";
import { useTheme } from "../theme";

interface NavItem {
  to: string;
  label: string;
  icon: typeof BarChart3;
  permissions?: string[];
  roles?: string[];
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { user, logout, can } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  const items = useMemo<NavItem[]>(
    () => [
      { to: "/", label: t("nav.dashboard"), icon: BarChart3, permissions: ["reports.read"] },
      {
        to: "/proveedores",
        label: t("nav.suppliers"),
        icon: Building2,
        permissions: ["suppliers.read"],
      },
      {
        to: "/inventario",
        label: t("nav.inventory"),
        icon: Boxes,
        permissions: ["inventory.read"],
      },
      {
        to: "/ordenes",
        label: t("nav.purchases"),
        icon: ClipboardList,
        permissions: ["purchases.read"],
      },
      { to: "/rutas", label: t("nav.routes"), icon: Route, permissions: ["routes.manage"] },
      {
        to: "/envios",
        label: t("nav.shipments"),
        icon: Truck,
        permissions: ["shipments.read"],
      },
      {
        to: "/mapa-global",
        label: t("nav.map"),
        icon: Map,
        permissions: ["shipments.read"],
      },
      {
        to: "/reportes",
        label: t("nav.reports"),
        icon: FileChartColumn,
        permissions: ["reports.read"],
      },
      {
        to: "/usuarios",
        label: t("nav.users"),
        icon: Users,
        permissions: ["users.manage"],
      },
      {
        to: "/portal-proveedor",
        label: t("nav.supplierPortal"),
        icon: PackageSearch,
        permissions: ["supplier.portal"],
        roles: ["SUPPLIER"],
      },
      { to: "/guia-operativa", label: t("nav.operationsGuide"), icon: BookOpenCheck },
      { to: "/notificaciones", label: t("nav.notifications"), icon: Bell },
      { to: "/rastreo", label: t("nav.tracking"), icon: Globe2 },
    ],
    [t],
  );

  const visibleItems = items.filter(
    (item) =>
      (!item.permissions || can(...item.permissions)) && (!item.roles || item.roles.includes(user!.role)),
  );

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    void api
      .get<Array<{ read_at: string | null }>>("/configuracion/notificaciones")
      .then(({ data }) => setUnread(data.filter((notification) => !notification.read_at).length))
      .catch(() => undefined);
  }, [location.pathname]);

  const switchLanguage = (language: string) => {
    void i18n.changeLanguage(language);
    localStorage.setItem("scm_language", language);
    void api.patch("/configuracion/idioma", { language }).catch(() => undefined);
  };

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {mobileOpen && <button className="mobile-overlay" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand-block">
          <div className="brand-mark">
            <Boxes size={22} />
          </div>
          <div className="brand-copy">
            <strong>SCM Global</strong>
            <span>Supply command</span>
          </div>
          <button className="sidebar-close" onClick={() => setMobileOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="nav-section-label">{t("nav.overview")}</div>
        <nav className="main-nav">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <item.icon size={19} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.to === "/notificaciones" && unread > 0 && (
                <em>{unread > 9 ? "9+" : unread}</em>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="environment-pill">
            <span />
            <div>
              <strong>Operación estable</strong>
              <small>Datos en tiempo real</small>
            </div>
          </div>
          <button
            className="collapse-button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label="Contraer barra lateral"
          >
            <ChevronLeft size={18} />
            <span>Contraer menú</span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)}>
            <Menu size={21} />
          </button>
          <div className="topbar-context">
            <span>Centro de operaciones</span>
            <strong>Bolivia · Región Andina</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="topbar-icon theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
              title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <label className="language-control">
              <Languages size={17} />
              <select
                value={i18n.language.slice(0, 2)}
                onChange={(event) => switchLanguage(event.target.value)}
                aria-label="Idioma"
              >
                <option value="es">ES</option>
                <option value="en">EN</option>
                <option value="pt">PT</option>
              </select>
            </label>
            <NavLink to="/notificaciones" className="topbar-icon" aria-label="Notificaciones">
              <Bell size={19} />
              {unread > 0 && <span>{unread}</span>}
            </NavLink>
            <div className="user-menu">
              <div className="avatar">{initials(user?.fullName ?? "")}</div>
              <div>
                <strong>{user?.fullName}</strong>
                <span>{roleLabel(user?.role ?? "")}</span>
              </div>
              <button onClick={logout} title={t("common.logout")}>
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>
        <main className="content-area">
          {children}
        </main>
        <footer className="app-footer">
          <span>SCM Global v1.0</span>
          <span>
            <Settings size={13} /> Sistema académico · UMSA 2026
          </span>
        </footer>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    ADMIN: "Administrador",
    PURCHASE_MANAGER: "Compras",
    INVENTORY_MANAGER: "Inventario",
    LOGISTICS_MANAGER: "Logística",
    DRIVER: "Transportista",
    MANAGER: "Gerencia",
    CLIENT: "Cliente",
    SUPPLIER: "Proveedor",
    AUDITOR: "Auditoría",
  };
  return labels[role] ?? role;
}
