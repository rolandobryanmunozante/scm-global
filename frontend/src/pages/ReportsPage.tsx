import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Route,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  Alert,
  EmptyState,
  LoadingState,
  PageHeader,
  StatusBadge,
  formatDate,
  formatMoney,
} from "../components/ui";

interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
}

interface SupplierOption {
  id: number;
  code: string;
  commercial_name: string;
  country: string;
}

interface ReportFilters {
  suppliers: SupplierOption[];
  products: Product[];
  countries: string[];
}

interface Traceability {
  product: Product & { unit_of_measure: string; unit_price: number };
  orders: Array<{
    id: number;
    code: string;
    status: string;
    created_at: string;
    expected_delivery_date: string;
    supplier: string;
    quantity: number;
  }>;
  movements: Array<{
    id: number;
    movement_type: string;
    reason: string;
    quantity: number;
    created_at: string;
    warehouse: string;
    user_name: string;
  }>;
  shipments: Array<{
    id: number;
    tracking_code: string;
    origin: string;
    destination: string;
    status: string;
    departure_at: string;
    eta_at: string;
    delivered_at: string;
    quantity: number;
    events: Array<{ type: string; status: string; description: string; date: string }>;
  }>;
}

interface AuditItem {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  ip_address: string;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
}

type ExportFormat = "pdf" | "xlsx";

export function ReportsPage() {
  const { can } = useAuth();
  const canExport = can("reports.export");
  const [tab, setTab] = useState<"export" | "traceability" | "audit">("export");
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [trace, setTrace] = useState<Traceability | null>(null);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    country: "",
    supplierId: "",
  });
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void api
      .get<ReportFilters>("/reportes/filtros")
      .then(({ data }) => {
        setProducts(data.products);
        setSuppliers(data.suppliers);
        setCountries(data.countries);
      })
      .catch((cause) => setError(getErrorMessage(cause)));
    if (can("audit.read")) {
      void api
        .get<AuditItem[]>("/reportes/auditoria")
        .then(({ data }) => setAudit(data))
        .catch(() => undefined);
    }
  }, [can]);

  const visibleSuppliers = suppliers.filter((supplier) => {
    const term = supplierSearch.trim().toLocaleLowerCase();
    return (
      !term ||
      `${supplier.code} ${supplier.commercial_name} ${supplier.country}`
        .toLocaleLowerCase()
        .includes(term)
    );
  });

  const selectedSupplier = suppliers.find(
    (supplier) => supplier.id === Number(filters.supplierId),
  );
  const filterSummary = [
    filters.from ? `Desde ${filters.from}` : "",
    filters.to ? `Hasta ${filters.to}` : "",
    filters.country || "",
    selectedSupplier?.commercial_name || "",
  ].filter(Boolean);

  const loadTrace = async () => {
    if (!productId) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<Traceability>(`/reportes/trazabilidad/${productId}`);
      setTrace(data);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async (format: ExportFormat) => {
    if (!canExport || downloading) return;
    setError("");
    setMessage("");
    if (filters.from && filters.to && filters.from > filters.to) {
      setError("La fecha inicial no puede ser posterior a la fecha final.");
      return;
    }
    setDownloading(format);
    try {
      const response = await api.get("/reportes/exportar", {
        params: {
          format,
          from: filters.from || undefined,
          to: filters.to || undefined,
          country: filters.country || undefined,
          supplierId: filters.supplierId || undefined,
        },
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        extractFilename(response.headers["content-disposition"]) ||
        `reporte-scm.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        format === "pdf"
          ? "PDF ejecutivo generado correctamente."
          : "Libro Excel con resumen, detalle y proveedores generado correctamente.",
      );
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Reportes y trazabilidad"
        subtitle="Información consolidada para decisiones, presentaciones y auditorías"
      />
      {error && <Alert>{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}
      <div className="tabs">
        <button
          className={tab === "export" ? "active" : ""}
          onClick={() => setTab("export")}
        >
          Exportar reportes
        </button>
        <button
          className={tab === "traceability" ? "active" : ""}
          onClick={() => setTab("traceability")}
        >
          Trazabilidad de producto
        </button>
        {can("audit.read") && (
          <button
            className={tab === "audit" ? "active" : ""}
            onClick={() => setTab("audit")}
          >
            Auditoría
          </button>
        )}
      </div>

      {tab === "export" ? (
        <section className="reports-layout">
          <article className="card report-builder">
            <div className="report-hero">
              <div className="report-hero-icon">
                <BarChart3 size={23} />
              </div>
              <div>
                <span>Centro de exportación</span>
                <h2>Reporte consolidado de compras</h2>
                <p>Hasta 10.000 registros con indicadores, filtros y detalle operativo.</p>
              </div>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <label className="field">
                  <span>Fecha desde</span>
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(event) => setFilters({ ...filters, from: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Fecha hasta</span>
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(event) => setFilters({ ...filters, to: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>País</span>
                  <select
                    value={filters.country}
                    onChange={(event) =>
                      setFilters({ ...filters, country: event.target.value })
                    }
                  >
                    <option value="">Todos los países</option>
                    {countries.map((country) => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field supplier-filter">
                  <span>Proveedor</span>
                  <div className="search-input">
                    <Search size={14} />
                    <input
                      value={supplierSearch}
                      onChange={(event) => setSupplierSearch(event.target.value)}
                      placeholder="Buscar por nombre, código o país"
                      aria-label="Buscar proveedor"
                    />
                  </div>
                  <select
                    value={filters.supplierId}
                    onChange={(event) =>
                      setFilters({ ...filters, supplierId: event.target.value })
                    }
                    aria-label="Seleccionar proveedor"
                  >
                    <option value="">Todos los proveedores</option>
                    {visibleSuppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.code} · {supplier.commercial_name} · {supplier.country}
                      </option>
                    ))}
                  </select>
                  {supplierSearch && visibleSuppliers.length === 0 && (
                    <small>No hay proveedores que coincidan con la búsqueda.</small>
                  )}
                </div>
              </div>

              {!canExport && (
                <Alert type="warning">
                  Su perfil puede consultar trazabilidad, pero la exportación está reservada a
                  Gerencia, Auditoría y Administración.
                </Alert>
              )}

              <div className="report-preview">
                <div className="report-logo">SCM</div>
                <div>
                  <span>Vista previa de alcance</span>
                  <strong>Reporte consolidado SCM Global</strong>
                  <p>
                    {filterSummary.length
                      ? filterSummary.join(" · ")
                      : "Todas las fechas, países y proveedores"}
                  </p>
                </div>
                <div className="report-preview-tags">
                  <span><CheckCircle2 size={12} /> Indicadores</span>
                  <span><CalendarDays size={12} /> Fecha y filtros</span>
                  <span><ShieldCheck size={12} /> Paginación</span>
                </div>
              </div>

              <div className="export-buttons">
                <button
                  className="export-card pdf"
                  disabled={!canExport || downloading !== null}
                  onClick={() => void exportReport("pdf")}
                >
                  <span className="export-icon"><FileText size={25} /></span>
                  <div>
                    <em>Documento ejecutivo</em>
                    <strong>{downloading === "pdf" ? "Generando PDF…" : "Descargar PDF"}</strong>
                    <span>KPIs, tabla legible, filtros y paginación</span>
                  </div>
                  <Download size={17} />
                </button>
                <button
                  className="export-card excel"
                  disabled={!canExport || downloading !== null}
                  onClick={() => void exportReport("xlsx")}
                >
                  <span className="export-icon"><FileSpreadsheet size={25} /></span>
                  <div>
                    <em>Libro para análisis</em>
                    <strong>
                      {downloading === "xlsx" ? "Generando Excel…" : "Descargar Excel"}
                    </strong>
                    <span>Resumen, detalle filtrable y proveedores</span>
                  </div>
                  <Download size={17} />
                </button>
              </div>
            </div>
          </article>

          <aside className="card export-info">
            <div className="card-header"><h3>Contenido mejorado</h3></div>
            <div className="card-body">
              <ul>
                <li><ShieldCheck size={16} /><span><strong>Trazable</strong>Filtros y fecha de generación</span></li>
                <li><FileText size={16} /><span><strong>Ejecutivo</strong>Totales, órdenes y estados</span></li>
                <li><Search size={16} /><span><strong>Detallado</strong>Proveedor, país y categoría</span></li>
                <li><FileSpreadsheet size={16} /><span><strong>Analizable</strong>Filtros, formatos y totales</span></li>
              </ul>
            </div>
          </aside>
        </section>
      ) : tab === "traceability" ? (
        <>
          <div className="toolbar">
            <select value={productId} onChange={(event) => setProductId(event.target.value)}>
              <option value="">Seleccione un producto…</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} · {product.name}
                </option>
              ))}
            </select>
            <button
              className="button primary"
              disabled={!productId}
              onClick={() => void loadTrace()}
            >
              <Search size={14} /> Consultar recorrido
            </button>
          </div>
          {loading ? (
            <LoadingState />
          ) : trace ? (
            <TraceView data={trace} />
          ) : (
            <EmptyState
              title="Seleccione un producto"
              description="Consulte su recorrido completo desde el proveedor hasta el envío."
            />
          )}
        </>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Usuario</th><th>Acción</th>
                <th>Entidad</th><th>ID</th><th>Dirección IP</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.created_at, true)}</td>
                  <td><strong>{item.user_name ?? "Sistema"}</strong><small>{item.user_email}</small></td>
                  <td><StatusBadge status={item.action} /></td>
                  <td>{item.entity_type}</td>
                  <td>{item.entity_id ?? "—"}</td>
                  <td>{item.ip_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function TraceView({ data }: { data: Traceability }) {
  const events = [
    ...data.orders.map((order) => ({
      date: order.created_at,
      type: "ORDEN",
      title: `${order.code} · ${order.supplier}`,
      detail: `${order.quantity} unidades · ${order.status}`,
    })),
    ...data.movements.map((movement) => ({
      date: movement.created_at,
      type: "INVENTARIO",
      title: `${movement.movement_type} · ${movement.warehouse}`,
      detail: `${movement.quantity} unidades · ${movement.user_name}`,
    })),
    ...data.shipments.flatMap((shipment) =>
      shipment.events.map((event) => ({
        date: event.date,
        type: "TRANSPORTE",
        title: `${shipment.tracking_code} · ${event.type}`,
        detail: event.description,
      })),
    ),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <section className="trace-layout">
      <article className="card trace-product">
        <div className="trace-product-icon"><Route size={24} /></div>
        <span>{data.product.sku}</span>
        <h2>{data.product.name}</h2>
        <p>{data.product.category} · {data.product.unit_of_measure}</p>
        <div><small>Precio unitario</small><strong>{formatMoney(data.product.unit_price)}</strong></div>
        <div><small>Órdenes</small><strong>{data.orders.length}</strong></div>
        <div><small>Movimientos</small><strong>{data.movements.length}</strong></div>
        <div><small>Envíos</small><strong>{data.shipments.length}</strong></div>
      </article>
      <article className="card trace-timeline">
        <div className="card-header">
          <div><h2>Recorrido completo</h2><p>{events.length} eventos auditables</p></div>
        </div>
        <div className="timeline trace">
          {events.map((event, index) => (
            <article
              key={`${event.type}-${event.date}-${index}`}
              className={index === events.length - 1 ? "current" : ""}
            >
              <i />
              <div>
                <span>{event.type}</span>
                <strong>{event.title}</strong>
                <p>{event.detail}</p>
                <small>{formatDate(event.date, true)}</small>
              </div>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}

function extractFilename(contentDisposition: unknown) {
  if (typeof contentDisposition !== "string") return "";
  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? "";
}
