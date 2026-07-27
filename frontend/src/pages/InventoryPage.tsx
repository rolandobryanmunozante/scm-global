import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, CheckCircle2, Plus, Search, Warehouse } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Alert, EmptyState, LoadingState, Modal, PageHeader, StatusBadge, formatDate } from "../components/ui";

interface WarehouseData { id: number; code: string; name: string; city: string; country: string }
interface Product { id: number; sku: string; name: string; category: string; minimum_stock: number; maximum_stock: number }
interface StockRow {
  product_id: number; sku: string; product: string; category: string; minimum_stock: number; maximum_stock: number;
  global_stock: number; available: number;
  warehouses: Array<{ warehouse_id: number; warehouse: string; code: string; current: number; reserved: number; available: number }>;
}
interface Movement { id: number; movement_type: string; reason: string; quantity: number; previous_quantity: number; resulting_quantity: number; observations: string | null; created_at: string; sku: string; product: string; warehouse: string; user_name: string }
interface Transfer { id: number; origin_warehouse: string; destination_warehouse: string; status: string; created_at: string; received_at: string | null; created_by_name: string; items: Array<{ product_id: number; sku: string; product: string; quantity: number }> }

export function InventoryPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [tab, setTab] = useState<"stock" | "movements" | "transfers">("stock");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [movementOpen, setMovementOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [stockResponse, productsResponse, warehousesResponse, movementsResponse, transfersResponse] = await Promise.all([
        api.get<StockRow[]>("/inventarios/stock", { params: { search, warehouseId: warehouseId || undefined } }),
        api.get<Product[]>("/inventarios/productos"),
        api.get<WarehouseData[]>("/inventarios/almacenes"),
        api.get<Movement[]>("/inventarios/movimientos"),
        api.get<Transfer[]>("/inventarios/transferencias"),
      ]);
      setStock(stockResponse.data); setProducts(productsResponse.data); setWarehouses(warehousesResponse.data);
      setMovements(movementsResponse.data); setTransfers(transfersResponse.data);
    } catch (cause) { setError(getErrorMessage(cause)); } finally { setLoading(false); }
  }, [search, warehouseId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [load]);

  const receive = async (id: number) => {
    try { await api.post(`/inventarios/transferencias/${id}/recibir`); await load(); }
    catch (cause) { setError(getErrorMessage(cause)); }
  };

  const visibleWarehouses = useMemo(() => warehouseId ? warehouses.filter((warehouse) => Number(warehouse.id) === Number(warehouseId)) : warehouses, [warehouseId, warehouses]);

  return (
    <>
      <PageHeader title={t("pages.inventory")} subtitle={t("pages.inventorySubtitle")} actions={
        can("inventory.move") ? <>
          <button className="button" onClick={() => setTransferOpen(true)}><ArrowRightLeft size={15} /> Transferir stock</button>
          <button className="button primary" onClick={() => setMovementOpen(true)}><Plus size={15} /> Registrar movimiento</button>
        </> : undefined
      } />
      {error && <Alert>{error}</Alert>}
      <div className="tabs">
        <button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}>Consulta de stock</button>
        <button className={tab === "movements" ? "active" : ""} onClick={() => setTab("movements")}>Movimientos</button>
        <button className={tab === "transfers" ? "active" : ""} onClick={() => setTab("transfers")}>Transferencias</button>
      </div>
      {loading ? <LoadingState /> : tab === "stock" ? (
        <>
          <div className="toolbar">
            <div className="search-control"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código, producto o categoría…" /></div>
            <Warehouse size={15} color="#94a3b8" />
            <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">Todos los almacenes</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
          </div>
          <div className="data-table-wrap"><table className="data-table stock-table">
            <thead><tr><th>Producto</th>{visibleWarehouses.map((warehouse) => <th key={warehouse.id}>{warehouse.code}</th>)}<th>Stock mínimo</th><th>Disponible</th><th>Estado</th></tr></thead>
            <tbody>{stock.map((row) => {
              const low = row.available <= row.minimum_stock; const warning = !low && row.available <= row.minimum_stock * 1.5;
              return <tr key={row.product_id}>
                <td><strong>{row.product}</strong><small>{row.sku} · {row.category}</small></td>
                {visibleWarehouses.map((warehouse) => { const value = row.warehouses?.find((item) => Number(item.warehouse_id) === Number(warehouse.id)); return <td key={warehouse.id}><strong>{value?.current ?? 0}</strong><small>{value?.reserved ?? 0} reservado</small></td>; })}
                <td>{row.minimum_stock}</td><td><strong>{row.available}</strong><small>Global</small></td>
                <td><span className={`stock-light ${low ? "red" : warning ? "yellow" : "green"}`}><i />{low ? "Crítico" : warning ? "Bajo" : "Óptimo"}</span></td>
              </tr>;
            })}</tbody>
          </table></div>
        </>
      ) : tab === "movements" ? (
        movements.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Fecha</th><th>Producto</th><th>Almacén</th><th>Tipo</th><th>Motivo</th><th>Cantidad</th><th>Stock</th><th>Usuario</th></tr></thead><tbody>
          {movements.map((movement) => <tr key={movement.id}><td>{formatDate(movement.created_at, true)}</td><td><strong>{movement.product}</strong><small>{movement.sku}</small></td><td>{movement.warehouse}</td><td><span className={`movement-type ${movement.movement_type.toLowerCase()}`}>{movement.movement_type === "ENTRADA" ? <ArrowDownToLine size={13}/> : <ArrowUpFromLine size={13}/>} {movement.movement_type}</span></td><td>{movement.reason}</td><td><strong>{movement.quantity}</strong></td><td>{movement.previous_quantity} → <strong>{movement.resulting_quantity}</strong></td><td>{movement.user_name}</td></tr>)}
        </tbody></table></div> : <EmptyState />
      ) : (
        transfers.length ? <div className="transfer-list">{transfers.map((transfer) => <article className="card transfer-card" key={transfer.id}><div className="transfer-route"><div><span>Origen</span><strong>{transfer.origin_warehouse}</strong></div><ArrowRightLeft size={18}/><div><span>Destino</span><strong>{transfer.destination_warehouse}</strong></div></div><div className="transfer-meta"><StatusBadge status={transfer.status}/><span>{formatDate(transfer.created_at, true)}</span><span>{transfer.created_by_name}</span></div><div className="transfer-items">{transfer.items.map((item) => <span key={item.product_id}>{item.sku} · {item.quantity} uds.</span>)}</div>{transfer.status === "EN_TRANSITO" && can("inventory.transfer") && <button className="button success" onClick={() => void receive(transfer.id)}><CheckCircle2 size={14}/> Confirmar recepción</button>}</article>)}</div> : <EmptyState />
      )}
      <MovementModal open={movementOpen} onClose={() => setMovementOpen(false)} onSaved={async () => { setMovementOpen(false); await load(); }} products={products} warehouses={warehouses} stock={stock} />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} onSaved={async () => { setTransferOpen(false); await load(); }} products={products} warehouses={warehouses} />
    </>
  );
}

function MovementModal({ open, onClose, onSaved, products, warehouses, stock }: { open: boolean; onClose: () => void; onSaved: () => Promise<void>; products: Product[]; warehouses: WarehouseData[]; stock: StockRow[] }) {
  const [form, setForm] = useState({ movement_type: "ENTRADA", product_id: "", warehouse_id: "", quantity: 1, reason: "COMPRA", observations: "" });
  const [error, setError] = useState("");
  const current = stock.find((row) => Number(row.product_id) === Number(form.product_id))?.warehouses?.find((item) => Number(item.warehouse_id) === Number(form.warehouse_id))?.current ?? 0;
  const after = form.movement_type === "ENTRADA" ? current + Number(form.quantity) : current - Number(form.quantity);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    try { await api.post("/inventarios/movimientos", { ...form, product_id: Number(form.product_id), warehouse_id: Number(form.warehouse_id), quantity: Number(form.quantity), observations: form.observations || null }); await onSaved(); }
    catch (cause) { setError(getErrorMessage(cause)); }
  };
  return <Modal open={open} onClose={onClose} title="Registrar movimiento de inventario">
    {error && <Alert>{error}</Alert>}
    <form onSubmit={submit}><div className="movement-layout"><div className="form-grid">
      <label className="field"><span>Tipo *</span><select value={form.movement_type} onChange={(event) => setForm({ ...form, movement_type: event.target.value, reason: event.target.value === "ENTRADA" ? "COMPRA" : "VENTA" })}><option>ENTRADA</option><option>SALIDA</option></select></label>
      <label className="field"><span>Motivo *</span><select value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })}>{(form.movement_type === "ENTRADA" ? ["COMPRA","DEVOLUCION","AJUSTE"] : ["VENTA","TRANSFERENCIA","MERMA","AJUSTE"]).map((reason) => <option key={reason}>{reason}</option>)}</select></label>
      <label className="field full"><span>Producto *</span><select value={form.product_id} onChange={(event) => setForm({ ...form, product_id: event.target.value })} required><option value="">Seleccione…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label>
      <label className="field"><span>Almacén *</span><select value={form.warehouse_id} onChange={(event) => setForm({ ...form, warehouse_id: event.target.value })} required><option value="">Seleccione…</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
      <label className="field"><span>Cantidad *</span><input type="number" min="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} required /></label>
      <label className="field full"><span>Observaciones</span><textarea value={form.observations} onChange={(event) => setForm({ ...form, observations: event.target.value })}/></label>
    </div><aside className="stock-preview"><span>Proyección de stock</span><div><small>Antes</small><strong>{current}</strong></div><ArrowRightLeft/><div className={after < 0 ? "negative" : ""}><small>Después</small><strong>{after}</strong></div><p>La actualización se propagará en tiempo real.</p></aside></div>
    <div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary" disabled={after < 0}>Confirmar movimiento</button></div></form>
  </Modal>;
}

function TransferModal({ open, onClose, onSaved, products, warehouses }: { open: boolean; onClose: () => void; onSaved: () => Promise<void>; products: Product[]; warehouses: WarehouseData[] }) {
  const [form, setForm] = useState({ origin_warehouse_id: "", destination_warehouse_id: "", product_id: "", quantity: 1, notes: "" });
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    try { await api.post("/inventarios/transferencias", { origin_warehouse_id: Number(form.origin_warehouse_id), destination_warehouse_id: Number(form.destination_warehouse_id), notes: form.notes || null, items: [{ product_id: Number(form.product_id), quantity: Number(form.quantity) }] }); await onSaved(); }
    catch (cause) { setError(getErrorMessage(cause)); }
  };
  return <Modal open={open} onClose={onClose} title="Transferir stock entre almacenes" width="620px">
    {error && <Alert>{error}</Alert>}<Alert type="warning">El stock quedará “En tránsito” hasta que el almacén de destino confirme la recepción.</Alert>
    <form onSubmit={submit}><div className="form-grid">
      <label className="field"><span>Almacén origen *</span><select value={form.origin_warehouse_id} onChange={(event) => setForm({ ...form, origin_warehouse_id: event.target.value })} required><option value="">Seleccione…</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
      <label className="field"><span>Almacén destino *</span><select value={form.destination_warehouse_id} onChange={(event) => setForm({ ...form, destination_warehouse_id: event.target.value })} required><option value="">Seleccione…</option>{warehouses.filter((warehouse) => Number(warehouse.id) !== Number(form.origin_warehouse_id)).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
      <label className="field"><span>Producto *</span><select value={form.product_id} onChange={(event) => setForm({ ...form, product_id: event.target.value })} required><option value="">Seleccione…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label>
      <label className="field"><span>Cantidad *</span><input type="number" min="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })}/></label>
      <label className="field full"><span>Notas</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></label>
    </div><div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary">Crear transferencia</button></div></form>
  </Modal>;
}
