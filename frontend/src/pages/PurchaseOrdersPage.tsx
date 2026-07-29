import { Bot, Check, ClockAlert, PackageCheck, Plus, RefreshCw, Search, ShoppingCart, Trash2, Truck } from "lucide-react";
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
interface CatalogProduct {
  id: number;
  sku: string;
  name: string;
  category_id: number;
  category: string;
  unit_of_measure: string;
  unit_price: number;
  lead_time_days: number;
}
interface Warehouse { id: number; code: string; name: string }

export function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);

  const load = useCallback(async () => {
    try {
      const [ordersResponse, suppliersResponse, warehousesResponse] = await Promise.all([
        api.get<PurchaseOrder[]>("/inventarios/ordenes-compra"),
        can("purchases.write") ? api.get<Supplier[]>("/proveedores?active=true") : Promise.resolve({ data: [] }),
        can("purchases.receive") ? api.get<Warehouse[]>("/inventarios/almacenes") : Promise.resolve({ data: [] }),
      ]);
      setOrders(ordersResponse.data);
      setSuppliers(suppliersResponse.data);
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
    <CreateOrderModal open={createOpen} suppliers={suppliers} onClose={() => setCreateOpen(false)} onSaved={async () => { setCreateOpen(false); setMessage("Orden manual creada en estado borrador."); await load(); }}/>
    <ReceiveOrderModal order={receiving} warehouses={warehouses} onClose={() => setReceiving(null)} onSaved={async () => { setReceiving(null); setMessage("Orden recibida; el inventario y su trazabilidad fueron actualizados."); await load(); }}/>
  </>;
}

function CreateOrderModal({ open, suppliers, onClose, onSaved }: { open: boolean; suppliers: Supplier[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Array<{ product_id: number; quantity: number }>>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState("");
  const supplier = suppliers.find((item) => item.id === Number(supplierId));
  const visibleCatalog = catalog.filter((product) =>
    `${product.sku} ${product.name} ${product.category}`
      .toLocaleLowerCase()
      .includes(catalogSearch.trim().toLocaleLowerCase()),
  );
  const orderTotal = items.reduce((total, item) => {
    const product = catalog.find((entry) => Number(entry.id) === Number(item.product_id));
    return total + Number(product?.unit_price ?? 0) * Number(item.quantity);
  }, 0);

  useEffect(() => {
    if (!open) return;
    setSupplierId("");
    setExpectedDate("");
    setNotes("");
    setItems([]);
    setCatalog([]);
    setCatalogSearch("");
    setError("");
  }, [open]);

  const changeSupplier = async (value: string) => {
    setSupplierId(value);
    setItems([]);
    setCatalog([]);
    setCatalogSearch("");
    setError("");
    if (!value) return;
    setCatalogLoading(true);
    try {
      const { data } = await api.get<{ products: CatalogProduct[] }>(
        `/proveedores/${value}/catalogo`,
      );
      setCatalog(data.products);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setCatalogLoading(false);
    }
  };
  const addProduct = (productId: number) =>
    setItems((current) =>
      current.some((item) => item.product_id === productId)
        ? current
        : [...current, { product_id: productId, quantity: 1 }],
    );
  const updateQuantity = (productId: number, quantity: number) =>
    setItems((current) =>
      current.map((item) => (item.product_id === productId ? { ...item, quantity } : item)),
    );
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!items.length) {
      setError("Agregue al menos un producto del catálogo del proveedor.");
      return;
    }
    try {
      await api.post("/inventarios/ordenes-compra", {
        supplier_id: Number(supplierId),
        expected_delivery_date: expectedDate || undefined,
        notes: notes || null,
        items: items.map((item) => ({ product_id: item.product_id, quantity: Number(item.quantity) })),
      });
      await onSaved();
    } catch (cause) { setError(getErrorMessage(cause)); }
  };
  return <Modal open={open} onClose={onClose} title="Nueva orden de compra" width="920px">
    {error && <Alert>{error}</Alert>}
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field"><span>Proveedor *</span><select value={supplierId} onChange={(event) => void changeSupplier(event.target.value)} required><option value="">Seleccione…</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.commercial_name}</option>)}</select><small className="hint">El catálogo se carga al seleccionar el proveedor.</small></label>
        <label className="field"><span>Entrega esperada</span><input type="date" min={new Date().toISOString().slice(0,10)} value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)}/></label>
        <label className="field full"><span>Notas</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)}/></label>
      </div>
      {supplierId && <div className="purchase-catalog-layout">
        <section className="purchase-catalog">
          <header>
            <div><strong>Catálogo · {supplier?.commercial_name}</strong><small>{catalog.length} productos habilitados para este proveedor</small></div>
            <div className="search-input"><Search size={14}/><input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Buscar producto o SKU"/></div>
          </header>
          {catalogLoading ? <LoadingState label="Cargando catálogo…"/> : visibleCatalog.length ? <div className="purchase-catalog-grid">
            {visibleCatalog.map((product) => {
              const selected = items.some((item) => item.product_id === Number(product.id));
              return <button key={product.id} type="button" className={selected ? "selected" : ""} onClick={() => addProduct(Number(product.id))} disabled={selected}>
                <span><strong>{product.name}</strong><small>{product.sku} · {product.unit_of_measure} · entrega {product.lead_time_days} días</small></span>
                <b>{selected ? "Agregado" : formatMoney(product.unit_price)}</b>
              </button>;
            })}
          </div> : <EmptyState title="Sin productos en el catálogo" description="Edite el proveedor y asigne productos de su rubro."/>}
        </section>
        <aside className="purchase-cart">
          <header><ShoppingCart size={17}/><div><strong>Productos de la orden</strong><small>{items.length} seleccionados</small></div></header>
          {items.length ? <div className="purchase-cart-items">{items.map((item) => {
            const product = catalog.find((entry) => Number(entry.id) === item.product_id);
            if (!product) return null;
            return <article key={item.product_id}>
              <div><strong>{product.name}</strong><small>{product.sku} · {formatMoney(product.unit_price)} c/u</small></div>
              <input aria-label={`Cantidad de ${product.name}`} type="number" min="1" value={item.quantity} onChange={(event) => updateQuantity(item.product_id, Math.max(1, Number(event.target.value)))}/>
              <button type="button" className="icon-button" title="Quitar producto" onClick={() => setItems((current) => current.filter((entry) => entry.product_id !== item.product_id))}><Trash2 size={13}/></button>
            </article>;
          })}</div> : <p>Seleccione productos desde el catálogo de la izquierda.</p>}
          <footer><span>Total estimado</span><strong>{formatMoney(orderTotal)}</strong></footer>
        </aside>
      </div>}
      <div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary" disabled={!supplierId || !items.length}><Plus size={13}/> Crear orden</button></div>
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
