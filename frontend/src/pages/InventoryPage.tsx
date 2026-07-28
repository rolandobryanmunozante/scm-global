import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, CheckCircle2, Edit3, PackagePlus, Plus, RotateCcw, Search, Trash2, Warehouse } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { io } from "socket.io-client";
import { api, getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Alert, EmptyState, LoadingState, Modal, PageHeader, StatusBadge, formatDate } from "../components/ui";

interface WarehouseData { id: number; code: string; name: string; city: string; country: string; address: string; latitude: number | null; longitude: number | null; active: boolean }
interface Product { id: number; sku: string; name: string; category_id: number; category: string; unit_of_measure: string; minimum_stock: number; maximum_stock: number; unit_price: number; active: boolean }
interface Category { id: number; name: string }
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
  const [tab, setTab] = useState<"stock" | "movements" | "transfers" | "catalog">("stock");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [movementOpen, setMovementOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | "new" | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseData | "new" | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [stockResponse, productsResponse, warehousesResponse, movementsResponse, transfersResponse, categoriesResponse] = await Promise.all([
        api.get<StockRow[]>("/inventarios/stock", { params: { search, warehouseId: warehouseId || undefined } }),
        api.get<Product[]>("/inventarios/productos", { params: { active: can("inventory.catalog") ? "all" : "true" } }),
        api.get<WarehouseData[]>("/inventarios/almacenes", { params: { active: can("inventory.catalog") ? "all" : "true" } }),
        api.get<Movement[]>("/inventarios/movimientos"),
        api.get<Transfer[]>("/inventarios/transferencias"),
        api.get<Category[]>("/proveedores/categorias"),
      ]);
      setStock(stockResponse.data); setProducts(productsResponse.data); setWarehouses(warehousesResponse.data);
      setMovements(movementsResponse.data); setTransfers(transfersResponse.data); setCategories(categoriesResponse.data);
    } catch (cause) { setError(getErrorMessage(cause)); } finally { setLoading(false); }
  }, [search, warehouseId, can]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
      auth: { rooms: ["inventory"] },
    });
    const refresh = () => void load();
    [
      "stock:updated",
      "stock:reserved",
      "stock:dispatched",
      "stock:received",
      "purchase:received",
      "transfer:created",
      "transfer:received",
    ].forEach((event) => socket.on(event, refresh));
    return () => {
      socket.disconnect();
    };
  }, [load]);

  const receive = async (id: number) => {
    try { await api.post(`/inventarios/transferencias/${id}/recibir`); await load(); }
    catch (cause) { setError(getErrorMessage(cause)); }
  };

  const activeWarehouses = useMemo(() => warehouses.filter((warehouse) => warehouse.active), [warehouses]);
  const activeProducts = useMemo(() => products.filter((product) => product.active), [products]);
  const visibleWarehouses = useMemo(() => warehouseId ? activeWarehouses.filter((warehouse) => Number(warehouse.id) === Number(warehouseId)) : activeWarehouses, [warehouseId, activeWarehouses]);

  return (
    <>
      <PageHeader title={t("pages.inventory")} subtitle={t("pages.inventorySubtitle")} actions={
        tab === "catalog" && can("inventory.catalog") ? <>
          <button className="button" onClick={() => setEditingWarehouse("new")}><Warehouse size={15}/> Nuevo almacén</button>
          <button className="button primary" onClick={() => setEditingProduct("new")}><PackagePlus size={15}/> Nuevo producto</button>
        </> : can("inventory.move") ? <>
          <button className="button" onClick={() => setTransferOpen(true)}><ArrowRightLeft size={15} /> Transferir stock</button>
          <button className="button primary" onClick={() => setMovementOpen(true)}><Plus size={15} /> Registrar movimiento</button>
        </> : undefined
      } />
      {error && <Alert>{error}</Alert>}
      <div className="tabs">
        <button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}>Consulta de stock</button>
        <button className={tab === "movements" ? "active" : ""} onClick={() => setTab("movements")}>Movimientos</button>
        <button className={tab === "transfers" ? "active" : ""} onClick={() => setTab("transfers")}>Transferencias</button>
        {can("inventory.catalog") && <button className={tab === "catalog" ? "active" : ""} onClick={() => setTab("catalog")}>Catálogos</button>}
      </div>
      {loading ? <LoadingState /> : tab === "stock" ? (
        <>
          <div className="toolbar">
            <div className="search-control"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código, producto o categoría…" /></div>
            <Warehouse size={15} color="#94a3b8" />
            <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">Todos los almacenes</option>{activeWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
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
      ) : tab === "transfers" ? (
        transfers.length ? <div className="transfer-list">{transfers.map((transfer) => <article className="card transfer-card" key={transfer.id}><div className="transfer-route"><div><span>Origen</span><strong>{transfer.origin_warehouse}</strong></div><ArrowRightLeft size={18}/><div><span>Destino</span><strong>{transfer.destination_warehouse}</strong></div></div><div className="transfer-meta"><StatusBadge status={transfer.status}/><span>{formatDate(transfer.created_at, true)}</span><span>{transfer.created_by_name}</span></div><div className="transfer-items">{transfer.items.map((item) => <span key={item.product_id}>{item.sku} · {item.quantity} uds.</span>)}</div>{transfer.status === "EN_TRANSITO" && can("inventory.transfer") && <button className="button success" onClick={() => void receive(transfer.id)}><CheckCircle2 size={14}/> Confirmar recepción</button>}</article>)}</div> : <EmptyState />
      ) : (
        <CatalogPanel products={products} warehouses={warehouses} onEditProduct={setEditingProduct} onEditWarehouse={setEditingWarehouse} onToggle={async (kind,id,active) => { try { await api.patch(`/inventarios/${kind}/${id}/estado`, { active }); await load(); } catch (cause) { setError(getErrorMessage(cause)); } }}/>
      )}
      <MovementModal open={movementOpen} onClose={() => setMovementOpen(false)} onSaved={async () => { setMovementOpen(false); await load(); }} products={activeProducts} warehouses={activeWarehouses} stock={stock} />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} onSaved={async () => { setTransferOpen(false); await load(); }} products={activeProducts} warehouses={activeWarehouses} />
      <ProductModal product={editingProduct === "new" ? null : editingProduct} open={editingProduct !== null} categories={categories} onClose={() => setEditingProduct(null)} onSaved={async () => { setEditingProduct(null); await load(); }}/>
      <WarehouseModal warehouse={editingWarehouse === "new" ? null : editingWarehouse} open={editingWarehouse !== null} onClose={() => setEditingWarehouse(null)} onSaved={async () => { setEditingWarehouse(null); await load(); }}/>
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

function CatalogPanel({ products, warehouses, onEditProduct, onEditWarehouse, onToggle }: { products: Product[]; warehouses: WarehouseData[]; onEditProduct: (value: Product | "new" | null) => void; onEditWarehouse: (value: WarehouseData | "new" | null) => void; onToggle: (kind: "productos" | "almacenes", id: number, active: boolean) => Promise<void> }) {
  return <div className="catalog-grid">
    <section className="card"><div className="card-header"><div><h2>Productos</h2><p>{products.length} registros</p></div><PackagePlus size={17}/></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Producto</th><th>Categoría</th><th>Mín./Máx.</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{products.map((product)=><tr key={product.id}><td><strong>{product.name}</strong><small>{product.sku} · {product.unit_of_measure}</small></td><td>{product.category}</td><td>{product.minimum_stock} / {product.maximum_stock}</td><td><StatusBadge status={product.active}/></td><td><div className="row-actions"><button className="icon-button" title="Editar" onClick={()=>onEditProduct(product)}><Edit3 size={13}/></button><button className="icon-button" title={product.active?"Desactivar":"Reactivar"} onClick={()=>void onToggle("productos",product.id,!product.active)}>{product.active?<Trash2 size={13}/>:<RotateCcw size={13}/>}</button></div></td></tr>)}</tbody></table></div></section>
    <section className="card"><div className="card-header"><div><h2>Almacenes</h2><p>{warehouses.length} registros</p></div><Warehouse size={17}/></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Almacén</th><th>Ubicación</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{warehouses.map((warehouse)=><tr key={warehouse.id}><td><strong>{warehouse.name}</strong><small>{warehouse.code}</small></td><td>{warehouse.city}, {warehouse.country}</td><td><StatusBadge status={warehouse.active}/></td><td><div className="row-actions"><button className="icon-button" title="Editar" onClick={()=>onEditWarehouse(warehouse)}><Edit3 size={13}/></button><button className="icon-button" title={warehouse.active?"Desactivar":"Reactivar"} onClick={()=>void onToggle("almacenes",warehouse.id,!warehouse.active)}>{warehouse.active?<Trash2 size={13}/>:<RotateCcw size={13}/>}</button></div></td></tr>)}</tbody></table></div></section>
  </div>;
}

function ProductModal({ product, open, categories, onClose, onSaved }: { product: Product | null; open: boolean; categories: Category[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form,setForm]=useState({sku:"",name:"",category_id:"",unit_of_measure:"unidad",minimum_stock:0,maximum_stock:1,unit_price:0});
  const [error,setError]=useState("");
  useEffect(()=>{setForm(product?{sku:product.sku,name:product.name,category_id:String(product.category_id),unit_of_measure:product.unit_of_measure,minimum_stock:Number(product.minimum_stock),maximum_stock:Number(product.maximum_stock),unit_price:Number(product.unit_price)}:{sku:"",name:"",category_id:"",unit_of_measure:"unidad",minimum_stock:0,maximum_stock:1,unit_price:0});setError("")},[product,open]);
  const submit=async(event:FormEvent)=>{event.preventDefault();try{const payload={...form,category_id:Number(form.category_id),minimum_stock:Number(form.minimum_stock),maximum_stock:Number(form.maximum_stock),unit_price:Number(form.unit_price)};if(product)await api.put(`/inventarios/productos/${product.id}`,payload);else await api.post("/inventarios/productos",payload);await onSaved()}catch(cause){setError(getErrorMessage(cause))}};
  return <Modal open={open} onClose={onClose} title={product?"Editar producto":"Nuevo producto"} width="650px">{error&&<Alert>{error}</Alert>}<form onSubmit={submit}><div className="form-grid"><label className="field"><span>SKU *</span><input value={form.sku} onChange={(event)=>setForm({...form,sku:event.target.value.toUpperCase()})} required/></label><label className="field"><span>Nombre *</span><input value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})} required/></label><label className="field"><span>Categoría *</span><select value={form.category_id} onChange={(event)=>setForm({...form,category_id:event.target.value})} required><option value="">Seleccione…</option>{categories.map((category)=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="field"><span>Unidad de medida *</span><input value={form.unit_of_measure} onChange={(event)=>setForm({...form,unit_of_measure:event.target.value})} required/></label><label className="field"><span>Stock mínimo *</span><input type="number" min="0" value={form.minimum_stock} onChange={(event)=>setForm({...form,minimum_stock:Number(event.target.value)})}/></label><label className="field"><span>Stock máximo *</span><input type="number" min={form.minimum_stock} value={form.maximum_stock} onChange={(event)=>setForm({...form,maximum_stock:Number(event.target.value)})}/></label><label className="field"><span>Precio unitario *</span><input type="number" min="0" step=".01" value={form.unit_price} onChange={(event)=>setForm({...form,unit_price:Number(event.target.value)})}/></label></div><div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary">Guardar producto</button></div></form></Modal>;
}

function WarehouseModal({ warehouse, open, onClose, onSaved }: { warehouse: WarehouseData | null; open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form,setForm]=useState({code:"",name:"",city:"",country:"Bolivia",address:"",latitude:"",longitude:""});const[error,setError]=useState("");
  useEffect(()=>{setForm(warehouse?{code:warehouse.code,name:warehouse.name,city:warehouse.city,country:warehouse.country,address:warehouse.address,latitude:warehouse.latitude==null?"":String(warehouse.latitude),longitude:warehouse.longitude==null?"":String(warehouse.longitude)}:{code:"",name:"",city:"",country:"Bolivia",address:"",latitude:"",longitude:""});setError("")},[warehouse,open]);
  const submit=async(event:FormEvent)=>{event.preventDefault();try{const payload={...form,latitude:form.latitude?Number(form.latitude):null,longitude:form.longitude?Number(form.longitude):null};if(warehouse)await api.put(`/inventarios/almacenes/${warehouse.id}`,payload);else await api.post("/inventarios/almacenes",payload);await onSaved()}catch(cause){setError(getErrorMessage(cause))}};
  return <Modal open={open} onClose={onClose} title={warehouse?"Editar almacén":"Nuevo almacén"} width="620px">{error&&<Alert>{error}</Alert>}<form onSubmit={submit}><div className="form-grid"><label className="field"><span>Código *</span><input value={form.code} onChange={(event)=>setForm({...form,code:event.target.value.toUpperCase()})} required/></label><label className="field"><span>Nombre *</span><input value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})} required/></label><label className="field"><span>Ciudad *</span><input value={form.city} onChange={(event)=>setForm({...form,city:event.target.value})} required/></label><label className="field"><span>País *</span><input value={form.country} onChange={(event)=>setForm({...form,country:event.target.value})} required/></label><label className="field full"><span>Dirección *</span><input value={form.address} onChange={(event)=>setForm({...form,address:event.target.value})} required/></label><label className="field"><span>Latitud</span><input type="number" step="any" value={form.latitude} onChange={(event)=>setForm({...form,latitude:event.target.value})}/></label><label className="field"><span>Longitud</span><input type="number" step="any" value={form.longitude} onChange={(event)=>setForm({...form,longitude:event.target.value})}/></label></div><div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary">Guardar almacén</button></div></form></Modal>;
}
