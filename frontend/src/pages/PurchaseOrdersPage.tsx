import { Bot, Check, ClockAlert, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Alert, EmptyState, LoadingState, PageHeader, StatusBadge, formatDate, formatMoney } from "../components/ui";

interface PurchaseOrder {
  id: number; code: string; supplier: string; status: string; automatic: boolean;
  expected_delivery_date: string | null; created_at: string; total: number;
  items: Array<{ product_id: number; sku: string; product: string; quantity: number; unit_price: number }>;
}

export function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try { const { data } = await api.get<PurchaseOrder[]>("/inventarios/ordenes-compra"); setOrders(data); }
    catch (cause) { setError(getErrorMessage(cause)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const approve = async (id: number) => {
    setError(""); try { await api.post(`/inventarios/ordenes-compra/${id}/aprobar`); setMessage("Orden aprobada correctamente."); await load(); }
    catch (cause) { setError(getErrorMessage(cause)); }
  };
  const generate = async () => {
    setError(""); try { const { data } = await api.post<{ generated: number }>("/inventarios/ordenes-compra/generar-automaticas"); setMessage(`Proceso finalizado: ${data.generated} orden(es) generada(s).`); await load(); }
    catch (cause) { setError(getErrorMessage(cause)); }
  };
  const checkLate = async () => {
    setError(""); try { const { data } = await api.post<{ notified: number }>("/inventarios/ordenes-compra/verificar-incumplimientos"); setMessage(`${data.notified} incumplimiento(s) detectado(s) y notificado(s).`); }
    catch (cause) { setError(getErrorMessage(cause)); }
  };

  return <>
    <PageHeader title={t("pages.purchases")} subtitle="Reabastecimiento automático y aprobación gerencial" actions={
      can("purchases.approve") ? <>
        <button className="button" onClick={() => void checkLate()}><ClockAlert size={15}/> Verificar incumplimientos</button>
        <button className="button primary" onClick={() => void generate()}><Bot size={15}/> Ejecutar reposición</button>
      </> : <button className="button" onClick={() => void load()}><RefreshCw size={15}/> Actualizar</button>
    } />
    {error && <Alert>{error}</Alert>}{message && <Alert type="success">{message}</Alert>}
    {loading ? <LoadingState /> : orders.length === 0 ? <EmptyState title="No hay órdenes de compra" /> : <div className="order-grid">
      {orders.map((order) => <article className="card order-card" key={order.id}>
        <header><div><span>{order.code}</span><h3>{order.supplier}</h3></div><StatusBadge status={order.status}/></header>
        <div className="order-origin">{order.automatic ? <><Bot size={14}/> Generada automáticamente</> : "Orden manual"}</div>
        <div className="order-items">{order.items.map((item) => <div key={item.product_id}><div><strong>{item.product}</strong><small>{item.sku}</small></div><span>{item.quantity} × {formatMoney(item.unit_price)}</span></div>)}</div>
        <div className="order-total"><span>Total estimado</span><strong>{formatMoney(order.total)}</strong></div>
        <footer><div><small>Generada</small><span>{formatDate(order.created_at)}</span></div><div><small>Entrega esperada</small><span>{formatDate(order.expected_delivery_date)}</span></div>
          {order.status === "BORRADOR" && can("purchases.approve") && <button className="button success" onClick={() => void approve(order.id)}><Check size={14}/> Aprobar</button>}
        </footer>
      </article>)}
    </div>}
  </>;
}
