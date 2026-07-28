import { Bot, Check, ClockAlert, PackageCheck, Plus, RefreshCw, Trash2, Truck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Alert, EmptyState, LoadingState, Modal, PageHeader, StatusBadge, formatDate, formatMoney } from "../components/ui";

interface PurchaseOrder {
  id: number; code: string; supplier: string; status: string; automatic: boolean;
  shipment_id: number | null;
  expected_delivery_date: string | null; created_at: string; total: number;
  items: Array<{ product_id: number; sku: string; product: string; quantity: number; unit_price: number }>;
}
interface Supplier { id: number; commercial_name: string; category_id: number }
interface Product { id: number; sku: string; name: string; category_id: number }
interface Warehouse { id: number; code: string; name: string }

export function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);

  const load = useCallback(async () => {
    try {
      const [ordersResponse, suppliersResponse, productsResponse, warehousesResponse] = await Promise.all([
        api.get<PurchaseOrder[]>("/inventarios/ordenes-compra"),
        can("purchases.write") ? api.get<Supplier[]>("/proveedores?active=true") : Promise.resolve({ data: [] }),
        can("purchases.write") ? api.get<Product[]>("/inventarios/productos") : Promise.resolve({ data: [] }),
        can("purchases.receive") ? api.get<Warehouse[]>("/inventarios/almacenes") : Promise.resolve({ data: [] }),
      ]);
      setOrders(ordersResponse.data);
      setSuppliers(suppliersResponse.data);
      setProducts(productsResponse.data);
      setWarehouses(warehousesResponse.data);
    }
    catch (cause) { setError(getErrorMessage(cause)); } finally { setLoading(false); }
  }, [can]);
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
    <PageHeader title={t("pages.purchases")} subtitle="Creación, reabastecimiento, aprobación y recepción en inventario" actions={<>
      {can("purchases.write") && <button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={15}/> Nueva orden</button>}
      {can("purchases.approve") && <>
        <button className="button" onClick={() => void checkLate()}><ClockAlert size={15}/> Verificar incumplimientos</button>
        <button className="button primary" onClick={() => void generate()}><Bot size={15}/> Ejecutar reposición</button>
      </>}
      {!can("purchases.approve") && !can("purchases.write") && <button className="button" onClick={() => void load()}><RefreshCw size={15}/> Actualizar</button>}
    </>} />
    {error && <Alert>{error}</Alert>}{message && <Alert type="success">{message}</Alert>}
    {loading ? <LoadingState /> : orders.length === 0 ? <EmptyState title="No hay órdenes de compra" /> : <div className="order-grid">
      {orders.map((order) => <article className="card order-card" key={order.id}>
        <header><div><span>{order.code}</span><h3>{order.supplier}</h3></div><StatusBadge status={order.status}/></header>
        <div className="order-origin">{order.shipment_id ? <><Truck size={14}/> Recepción gestionada por Transporte · envío #{order.shipment_id}</> : order.automatic ? <><Bot size={14}/> Generada automáticamente</> : "Orden manual"}</div>
        <div className="order-items">{order.items.map((item) => <div key={item.product_id}><div><strong>{item.product}</strong><small>{item.sku}</small></div><span>{item.quantity} × {formatMoney(item.unit_price)}</span></div>)}</div>
        <div className="order-total"><span>Total estimado</span><strong>{formatMoney(order.total)}</strong></div>
        <footer><div><small>Generada</small><span>{formatDate(order.created_at)}</span></div><div><small>Entrega esperada</small><span>{formatDate(order.expected_delivery_date)}</span></div>
          {order.status === "BORRADOR" && can("purchases.approve") && <button className="button success" onClick={() => void approve(order.id)}><Check size={14}/> Aprobar</button>}
          {!order.shipment_id && ["APROBADA","ENVIADA","CONFIRMADA"].includes(order.status) && can("purchases.receive") && <button className="button success" onClick={() => setReceiving(order)}><PackageCheck size={14}/> Recibir</button>}
        </footer>
      </article>)}
    </div>}
    <CreateOrderModal open={createOpen} suppliers={suppliers} products={products} onClose={() => setCreateOpen(false)} onSaved={async () => { setCreateOpen(false); setMessage("Orden manual creada en estado borrador."); await load(); }}/>
    <ReceiveOrderModal order={receiving} warehouses={warehouses} onClose={() => setReceiving(null)} onSaved={async () => { setReceiving(null); setMessage("Orden recibida; el inventario y su trazabilidad fueron actualizados."); await load(); }}/>
  </>;
}

function CreateOrderModal({ open, suppliers, products, onClose, onSaved }: { open: boolean; suppliers: Supplier[]; products: Product[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ product_id: "", quantity: 1 }]);
  const [error, setError] = useState("");
  const supplier = suppliers.find((item) => item.id === Number(supplierId));
  const compatibleProducts = products.filter((product) => !supplier || product.category_id === supplier.category_id);
  const updateItem = (index: number, patch: Partial<(typeof items)[number]>) =>
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    try {
      await api.post("/inventarios/ordenes-compra", {
        supplier_id: Number(supplierId),
        expected_delivery_date: expectedDate || undefined,
        notes: notes || null,
        items: items.map((item) => ({ product_id: Number(item.product_id), quantity: Number(item.quantity) })),
      });
      await onSaved();
    } catch (cause) { setError(getErrorMessage(cause)); }
  };
  return <Modal open={open} onClose={onClose} title="Nueva orden de compra" width="760px">
    {error && <Alert>{error}</Alert>}
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field"><span>Proveedor *</span><select value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setItems([{ product_id: "", quantity: 1 }]); }} required><option value="">Seleccione…</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.commercial_name}</option>)}</select></label>
        <label className="field"><span>Entrega esperada</span><input type="date" min={new Date().toISOString().slice(0,10)} value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)}/></label>
        <label className="field full"><span>Notas</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)}/></label>
      </div>
      <div className="order-items">
        {items.map((item, index) => <div key={index}>
          <select value={item.product_id} onChange={(event) => updateItem(index, { product_id: event.target.value })} required><option value="">Producto…</option>{compatibleProducts.filter((product) => !items.some((selected, selectedIndex) => selectedIndex !== index && Number(selected.product_id) === product.id)).map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select>
          <input aria-label="Cantidad" type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })}/>
          {items.length > 1 && <button type="button" className="button danger" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={13}/></button>}
        </div>)}
      </div>
      <button type="button" className="button" onClick={() => setItems((current) => [...current, { product_id: "", quantity: 1 }])} disabled={!supplierId || items.length >= compatibleProducts.length}><Plus size={13}/> Agregar producto</button>
      <div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary">Crear orden</button></div>
    </form>
  </Modal>;
}

function ReceiveOrderModal({ order, warehouses, onClose, onSaved }: { order: PurchaseOrder | null; warehouses: Warehouse[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [warehouseId, setWarehouseId] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!order) return;
    try {
      await api.post(`/inventarios/ordenes-compra/${order.id}/recibir`, { warehouse_id: Number(warehouseId) });
      await onSaved();
    } catch (cause) { setError(getErrorMessage(cause)); }
  };
  return <Modal open={Boolean(order)} onClose={onClose} title={`Recibir ${order?.code ?? ""}`} width="520px">
    {error && <Alert>{error}</Alert>}
    <p className="modal-intro">La recepción creará movimientos de entrada para todos los productos de la orden.</p>
    <form onSubmit={submit}><label className="field"><span>Almacén de destino *</span><select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required><option value="">Seleccione…</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label><div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button success"><PackageCheck size={14}/> Confirmar recepción</button></div></form>
  </Modal>;
}
