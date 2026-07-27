import { CheckCircle2, ExternalLink, PackageCheck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, getErrorMessage } from "../api/client";
import { Alert, EmptyState, LoadingState, Modal, PageHeader, StatusBadge, formatDate, formatMoney } from "../components/ui";

interface PortalOrder {
  id: number; code: string; status: string; created_at: string; expected_delivery_date: string | null;
  supplier_document_url: string | null;
  items: Array<{ product_id: number; sku: string; name: string; quantity: number; unit_price: number }>;
}

export function SupplierPortalPage() {
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PortalOrder | null>(null);
  const load = useCallback(async () => {
    try { const { data } = await api.get<PortalOrder[]>("/proveedores/portal/ordenes"); setOrders(data); }
    catch (cause) { setError(getErrorMessage(cause)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <>
    <PageHeader title="Portal externo de proveedores" subtitle="Órdenes asignadas, confirmaciones y documentos" />
    {error && <Alert>{error}</Alert>}
    {loading ? <LoadingState /> : orders.length === 0 ? <EmptyState title="No hay órdenes asignadas" /> : <div className="portal-orders">{orders.map((order) => <article className="card portal-order" key={order.id}>
      <div className="portal-order-icon"><PackageCheck size={22}/></div><div className="portal-order-main"><div><strong>{order.code}</strong><StatusBadge status={order.status}/></div><span>Recibida {formatDate(order.created_at)} · Entrega {formatDate(order.expected_delivery_date)}</span>
      <div className="portal-order-items">{order.items.map((item) => <small key={item.product_id}>{item.name} · {item.quantity} uds. · {formatMoney(item.unit_price)}</small>)}</div></div>
      {order.supplier_document_url && <a href={order.supplier_document_url} target="_blank" rel="noreferrer" className="icon-button"><ExternalLink size={14}/></a>}
      {["APROBADA","ENVIADA"].includes(order.status) && <button className="button primary" onClick={() => setSelected(order)}><CheckCircle2 size={14}/> Confirmar orden</button>}
    </article>)}</div>}
    <ConfirmOrder order={selected} open={Boolean(selected)} onClose={() => setSelected(null)} onSaved={async () => { setSelected(null); await load(); }} />
  </>;
}

function ConfirmOrder({ order, open, onClose, onSaved }: { order: PortalOrder | null; open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const defaultDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [date, setDate] = useState(defaultDate); const [url, setUrl] = useState(""); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!order) return; try { await api.patch(`/proveedores/portal/ordenes/${order.id}`, { expected_delivery_date: date, document_url: url || null }); await onSaved(); } catch (cause) { setError(getErrorMessage(cause)); } };
  return <Modal open={open} onClose={onClose} title={`Confirmar ${order?.code ?? ""}`} width="520px">{error && <Alert>{error}</Alert>}<form onSubmit={submit}><div className="field"><label>Fecha estimada de entrega *</label><input type="date" min={new Date().toISOString().slice(0,10)} value={date} onChange={(event) => setDate(event.target.value)} required /></div><div className="field" style={{marginTop:12}}><label>URL de documento adjunto</label><input type="url" placeholder="https://…" value={url} onChange={(event) => setUrl(event.target.value)}/></div><div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary">Confirmar recepción</button></div></form></Modal>;
}
