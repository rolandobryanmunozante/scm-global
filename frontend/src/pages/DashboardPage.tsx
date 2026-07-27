import { AlertTriangle, Boxes, CircleDollarSign, ClipboardClock, RefreshCw, Star, Truck, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, getErrorMessage } from "../api/client";
import { Alert, formatMoney, LoadingState, PageHeader } from "../components/ui";

interface DashboardData {
  kpis: {
    monthlySales: number;
    inventoryValue: number;
    activeShipments: number;
    delayedShipments: number;
    pendingOrders: number;
    topSupplier: { commercial_name: string; score: number };
  };
  charts: {
    salesByCountry: Array<{ country: string; value: number }>;
    monthlyEvolution: Array<{ month: string; value: number }>;
    stockByCategory: Array<{ category: string; value: number }>;
  };
  refreshedAt: string;
}

const colors = ["#2563EB", "#10B981", "#F59E0B", "#8B5CF6", "#06B6D4"];

export function DashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await api.get<DashboardData>("/reportes/dashboard", { params: { country: country || undefined, categoryId: categoryId || undefined } });
      setData(response.data);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [country, categoryId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (loading && !data) return <LoadingState label="Consolidando indicadores…" />;

  return (
    <>
      <PageHeader title={t("pages.dashboard")} subtitle={t("pages.dashboardSubtitle")} actions={
        <>
          <select className="header-select" value={country} onChange={(event) => setCountry(event.target.value)}>
            <option value="">Todos los países</option><option>Bolivia</option><option>Perú</option><option>Brasil</option><option>Argentina</option>
          </select>
          <select className="header-select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Todas las categorías</option><option value="1">Electrónica</option><option value="2">Alimentos</option><option value="3">Farmacéutica</option><option value="4">Textiles</option><option value="5">Repuestos</option>
          </select>
          <button className="button" onClick={() => void load()}><RefreshCw size={15} /> Actualizar</button>
        </>
      } />
      {error && <Alert>{error}</Alert>}
      {data && (
        <>
          <section className="kpi-grid">
            <KpiCard label="Ventas del mes" value={formatMoney(data.kpis.monthlySales)} icon={CircleDollarSign} tone="blue" trend="+12.4%" />
            <KpiCard label="Valor de inventario" value={formatMoney(data.kpis.inventoryValue)} icon={Boxes} tone="violet" trend="+3.2%" />
            <KpiCard label="Envíos activos" value={String(data.kpis.activeShipments)} icon={Truck} tone="green" trend="En ruta" />
            <KpiCard label="Envíos retrasados" value={String(data.kpis.delayedShipments)} icon={AlertTriangle} tone="red" trend={data.kpis.delayedShipments ? "Requiere atención" : "Sin alertas"} />
            <KpiCard label="Órdenes pendientes" value={String(data.kpis.pendingOrders)} icon={ClipboardClock} tone="amber" trend="Por gestionar" />
            <KpiCard label="Mejor proveedor" value={data.kpis.topSupplier.commercial_name} icon={Star} tone="cyan" trend={`${Number(data.kpis.topSupplier.score).toFixed(1)} / 5`} compact />
          </section>
          <section className="dashboard-grid">
            <article className="card chart-card wide">
              <div className="card-header"><div><h3>Ventas por país</h3><p>Comparación del período seleccionado</p></div><TrendingUp size={18} color="#2563EB" /></div>
              <div className="chart-body">
                <ResponsiveContainer width="100%" height="100%"><BarChart data={data.charts.salesByCountry} margin={{ top: 10, right: 5, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf4" /><XAxis dataKey="country" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#64748B" }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#94A3B8" }} />
                  <Tooltip contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 10 }} formatter={(value) => formatMoney(Number(value))} /><Bar dataKey="value" fill="#2563EB" radius={[5, 5, 0, 0]} maxBarSize={42} />
                </BarChart></ResponsiveContainer>
              </div>
            </article>
            <article className="card chart-card">
              <div className="card-header"><div><h3>Evolución mensual</h3><p>Tendencia consolidada</p></div></div>
              <div className="chart-body"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.charts.monthlyEvolution} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <defs><linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563EB" stopOpacity={0.25}/><stop offset="95%" stopColor="#2563EB" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf4" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: "#64748B" }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: "#94A3B8" }} />
                <Tooltip contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 10 }} formatter={(value) => formatMoney(Number(value))} /><Area type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={2} fill="url(#salesArea)" />
              </AreaChart></ResponsiveContainer></div>
            </article>
            <article className="card chart-card">
              <div className="card-header"><div><h3>Stock por categoría</h3><p>Distribución global</p></div></div>
              <div className="chart-body donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.charts.stockByCategory} dataKey="value" nameKey="category" innerRadius={55} outerRadius={82} paddingAngle={3}>{data.charts.stockByCategory.map((entry, index) => <Cell key={entry.category} fill={colors[index % colors.length]} />)}</Pie><Tooltip contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 10 }} /></PieChart></ResponsiveContainer>
                <div className="chart-legend">{data.charts.stockByCategory.map((entry, index) => <span key={entry.category}><i style={{ background: colors[index % colors.length] }} />{entry.category}</span>)}</div>
              </div>
            </article>
          </section>
          <p className="last-refresh">Actualizado automáticamente: {new Date(data.refreshedAt).toLocaleString("es-BO")}</p>
        </>
      )}
    </>
  );
}

function KpiCard({ label, value, icon: Icon, tone, trend, compact = false }: { label: string; value: string; icon: typeof Boxes; tone: string; trend: string; compact?: boolean }) {
  return <article className="kpi-card"><div className={`kpi-icon ${tone}`}><Icon size={19} /></div><div className="kpi-content"><span>{label}</span><strong className={compact ? "compact" : ""}>{value}</strong><small>{trend}</small></div><div className={`micro-trend ${tone}`}><svg viewBox="0 0 64 24"><path d="M1 20 L12 14 L20 17 L30 7 L40 12 L50 4 L63 8" fill="none" stroke="currentColor" strokeWidth="2" /></svg></div></article>;
}
