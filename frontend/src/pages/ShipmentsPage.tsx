import { CheckCircle2, ClipboardPlus, Edit3, LocateFixed, PackageCheck, Plus, RotateCcw, Send, Settings2, Trash2, Truck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { io } from "socket.io-client";
import { api, getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Alert, EmptyState, LoadingState, Modal, PageHeader, StatusBadge, formatDate } from "../components/ui";

interface Shipment {
  id: number; tracking_code: string; origin: string; destination: string; status: string;
  flow_type: "ENTRADA_COMPRA" | "SALIDA_DISTRIBUCION";
  total_weight_kg: number; total_volume_m3: number; current_latitude: number; current_longitude: number;
  eta_at: string | null; route: string; transport_mode: string; plate: string | null; vehicle: string | null; driver: string | null;
  purchase_order_id: number | null; origin_warehouse_id: number | null; destination_warehouse_id: number | null;
  purchase_order_code: string | null; supplier_name: string | null;
  origin_warehouse_name: string | null; destination_warehouse_name: string | null;
  inventory_reserved_at: string | null; inventory_dispatched_at: string | null; inventory_received_at: string | null;
  last_position_at: string | null; position_state: "EN_VIVO" | "RECIENTE" | "SIN_ACTUALIZAR";
  is_delayed: boolean; delay_minutes: number; incident_count: number;
  latest_incident_type: string | null; latest_incident_description: string | null;
  items: Array<{ product_id: number; sku: string; product: string; quantity: number }>;
}
interface Vehicle { id: number; plate: string; type: string; transport_mode: string; capacity_kg: number; capacity_m3: number; current_location: string; active: boolean; available: boolean }
interface Driver { id: number; full_name: string; email: string; license_number: string; license_expiry: string; license_valid: boolean; available: boolean }
interface RouteData { id: number; name: string; origin_name: string; destination_name: string; transport_mode: string; purpose: "ENTRADA_COMPRA" | "SALIDA_DISTRIBUCION" | "AMBOS"; origin_warehouse_id: number | null; destination_warehouse_id: number | null }
interface Product { id: number; sku: string; name: string }
interface Warehouse { id: number; code: string; name: string }
interface PurchaseOrder { id: number; code: string; supplier: string; status: string; shipment_id: number | null; items: Array<{ product_id: number; sku: string; product: string; quantity: number }> }

export function ShipmentsPage() {
  const { can, user } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [assigning, setAssigning] = useState<Shipment | null>(null);
  const [updating, setUpdating] = useState<Shipment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [fleetOpen, setFleetOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const requests = [
        api.get<Shipment[]>("/transporte/envios"),
        can("shipments.assign") ? api.get<Vehicle[]>("/transporte/vehiculos", { params: { active: can("transport.resources") ? "all" : "true" } }) : Promise.resolve({ data: [] }),
        can("shipments.assign") ? api.get<Driver[]>("/transporte/transportistas") : Promise.resolve({ data: [] }),
        can("shipments.assign") ? api.get<RouteData[]>("/logistica/rutas") : Promise.resolve({ data: [] }),
        can("shipments.assign") ? api.get<Product[]>("/inventarios/productos") : Promise.resolve({ data: [] }),
        can("shipments.assign") ? api.get<Warehouse[]>("/inventarios/almacenes") : Promise.resolve({ data: [] }),
        can("shipments.assign") ? api.get<PurchaseOrder[]>("/inventarios/ordenes-compra") : Promise.resolve({ data: [] }),
      ] as const;
      const [shipmentResponse, vehicleResponse, driverResponse, routeResponse, productResponse, warehouseResponse, orderResponse] = await Promise.all(requests);
      setShipments(shipmentResponse.data); setVehicles(vehicleResponse.data); setDrivers(driverResponse.data); setRoutes(routeResponse.data); setProducts(productResponse.data); setWarehouses(warehouseResponse.data); setPurchaseOrders(orderResponse.data);
    } catch (cause) { setError(getErrorMessage(cause)); } finally { setLoading(false); }
  }, [can]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
      auth: { rooms: ["shipments"] },
    });
    const refresh = () => void load();
    socket.on("shipment:created", refresh);
    socket.on("shipment:updated", refresh);
    socket.on("shipment:event", refresh);
    return () => { socket.disconnect(); };
  }, [load]);

  const acceptShipment = async (shipment: Shipment) => {
    setError("");
    try {
      await api.post(`/transporte/envios/${shipment.id}/aceptar`);
      setMessage("Asignación aceptada. El traslado comenzó y el despacho quedó registrado.");
      await load();
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  const confirmReception = async (shipment: Shipment) => {
    if (
      !window.confirm(
        `¿Confirma que la carga ${shipment.tracking_code} fue revisada físicamente y puede ingresar al inventario?`,
      )
    ) {
      return;
    }
    setError("");
    try {
      await api.post(`/transporte/envios/${shipment.id}/confirmar-recepcion`);
      setMessage("Recepción confirmada. El envío y el inventario fueron actualizados.");
      await load();
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  return <>
    <PageHeader title="Asignación y seguimiento" subtitle={user?.role === "DRIVER" ? "Envíos asignados a su operación" : "Vehículos, transportistas y estado de los envíos"} actions={
      can("shipments.assign") ? <>{can("transport.resources") && <button className="button" onClick={() => setFleetOpen(true)}><Settings2 size={15}/> Gestionar flota</button>}<button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={15}/> Nuevo envío</button></> : undefined
    } />
    {error && <Alert>{error}</Alert>}{message && <Alert type="success">{message}</Alert>}
    {loading ? <LoadingState /> : shipments.length === 0 ? <EmptyState title="No hay envíos disponibles" /> : <div className="shipments-board">{shipments.map((shipment) => <article className="card shipment-card" key={shipment.id}>
      <div className="shipment-card-top"><div className={`transport-symbol ${shipment.transport_mode.toLowerCase()}`}><Truck size={19}/></div><div><span>{shipment.tracking_code}</span><strong>{shipment.origin} → {shipment.destination}</strong></div><StatusBadge status={shipment.status}/></div>
      <div className={`shipment-flow ${shipment.flow_type === "ENTRADA_COMPRA" ? "inbound" : "outbound"}`}><strong>{shipment.flow_type === "ENTRADA_COMPRA" ? "ENTRADA · COMPRA" : "SALIDA · DISTRIBUCIÓN"}</strong><span>{shipment.flow_type === "ENTRADA_COMPRA" ? `Recogida desde ${shipment.supplier_name ?? shipment.origin}. El transportista registra el arribo y después Inventario confirma la recepción en ${shipment.destination_warehouse_name ?? shipment.destination}.` : `Sale de ${shipment.origin_warehouse_name ?? shipment.origin}; el stock reservado se descuenta cuando el conductor acepta la carga${shipment.destination_warehouse_name ? ` y se suma en ${shipment.destination_warehouse_name} cuando Inventario confirma la recepción` : ""}.`}</span></div>
      <div className="shipment-next-action"><strong>Siguiente responsable</strong><span>{shipmentNextAction(shipment)}</span></div>
      {(shipment.status === "INCIDENCIA" || shipment.is_delayed) && <div className={`shipment-ops-alert ${shipment.status === "INCIDENCIA" ? "incident" : "delay"}`}><strong>{shipment.status === "INCIDENCIA" ? `Incidencia · ${incidentTypeLabel(shipment.latest_incident_type)}` : "Retraso detectado"}</strong><span>{shipment.status === "INCIDENCIA" ? shipment.latest_incident_description ?? `${shipment.incident_count} incidencia(s) registrada(s)` : `${formatDelay(shipment.delay_minutes)} sobre la ETA`}</span></div>}
      <div className="shipment-progress"><span className="complete"/><i className={shipmentStage(shipment.status) >= 1 ? "complete" : ""}/><i className={shipmentStage(shipment.status) >= 2 ? "complete" : ""}/><i className={shipmentStage(shipment.status) >= 3 ? "complete" : ""}/><span className={shipmentStage(shipment.status) >= 4 ? "complete" : ""}/></div>
      <div className="shipment-stages"><span>Preparando</span><span>Asignado</span><span>En tránsito</span><span>Recepción</span><span>Entregado</span></div>
      <div className="shipment-details"><div><small>Vehículo</small><strong>{shipment.plate ?? "Sin asignar"}</strong></div><div><small>Transportista</small><strong>{shipment.driver ?? "Sin asignar"}</strong></div><div><small>ETA</small><strong>{formatDate(shipment.eta_at, true)}</strong></div><div><small>Posición</small><strong>{shipment.position_state?.replaceAll("_", " ") ?? "SIN ACTUALIZAR"}</strong></div></div>
      <div className="shipment-items">{shipment.purchase_order_id && <span>{shipment.purchase_order_code ?? `Compra #${shipment.purchase_order_id}`}</span>}{shipment.items?.map((item) => <span key={item.product_id}>{item.sku} · {item.quantity}</span>)}</div>
      <footer><a className="button" href={`/rastreo/${shipment.tracking_code}`}><LocateFixed size={14}/> Ver rastreo</a>
        {shipment.status === "PREPARANDO" && can("shipments.assign") && <button className="button primary" onClick={() => setAssigning(shipment)}><Truck size={14}/> Asignar transporte</button>}
        {user?.role === "DRIVER" && shipment.status === "ASIGNADO" && <button className="button success" onClick={() => void acceptShipment(shipment)}><CheckCircle2 size={14}/> Aceptar carga</button>}
        {user?.role === "DRIVER" && can("shipments.update") && ["EN_TRANSITO","EN_ADUANA","INCIDENCIA","RETRASADO"].includes(shipment.status) && <button className="button primary" onClick={() => setUpdating(shipment)}><Send size={14}/> Actualizar estado</button>}
        {shipment.status === "PENDIENTE_RECEPCION" && can("purchases.receive") && <button className="button success" onClick={() => void confirmReception(shipment)}><PackageCheck size={14}/> Confirmar recepción</button>}
      </footer>
    </article>)}</div>}
    <AssignModal shipment={assigning} open={Boolean(assigning)} vehicles={vehicles} drivers={drivers} onClose={() => setAssigning(null)} onSaved={async () => { setAssigning(null); setMessage("Transporte asignado. El conductor debe aceptar la carga para iniciar el traslado."); await load(); }} />
    <EventModal shipment={updating} open={Boolean(updating)} onClose={() => setUpdating(null)} onSaved={async () => { setUpdating(null); setMessage("Estado actualizado en tiempo real."); await load(); }} />
    <CreateShipmentModal open={createOpen} routes={routes} products={products} warehouses={warehouses} purchaseOrders={purchaseOrders} onClose={() => setCreateOpen(false)} onSaved={async () => { setCreateOpen(false); setMessage("Envío creado con inventario vinculado y listo para asignación."); await load(); }} />
    <FleetModal open={fleetOpen} vehicles={vehicles} onClose={() => setFleetOpen(false)} onSaved={load}/>
  </>;
}

function shipmentStage(status: string): number {
  if (status === "ENTREGADO") return 4;
  if (status === "PENDIENTE_RECEPCION") return 3;
  if (["EN_TRANSITO", "EN_ADUANA", "INCIDENCIA", "RETRASADO"].includes(status)) return 2;
  if (status === "ASIGNADO") return 1;
  return 0;
}

function shipmentNextAction(shipment: Shipment): string {
  if (shipment.status === "PREPARANDO") {
    return "Logística debe asignar un vehículo y un transportista disponible.";
  }
  if (shipment.status === "ASIGNADO") {
    return "El transportista asignado debe aceptar la carga; recién entonces inicia el viaje.";
  }
  if (["EN_TRANSITO", "EN_ADUANA", "INCIDENCIA", "RETRASADO"].includes(shipment.status)) {
    return shipment.destination_warehouse_id
      ? "El transportista actualiza el recorrido y registra el arribo al almacén."
      : "El transportista actualiza el recorrido y confirma la entrega al cliente final.";
  }
  if (shipment.status === "PENDIENTE_RECEPCION") {
    return "Inventario debe revisar físicamente la carga y confirmar su ingreso.";
  }
  return "Flujo completado y existencias conciliadas.";
}

function AssignModal({ shipment, open, vehicles, drivers, onClose, onSaved }: { shipment: Shipment | null; open: boolean; vehicles: Vehicle[]; drivers: Driver[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const compatible = vehicles.filter((vehicle) =>
    vehicle.active &&
    vehicle.available &&
    vehicle.transport_mode === shipment?.transport_mode &&
    Number(vehicle.capacity_kg) >= Number(shipment?.total_weight_kg ?? 0) &&
    Number(vehicle.capacity_m3) >= Number(shipment?.total_volume_m3 ?? 0)
  );
  const availableDrivers = drivers.filter((driver) => driver.available && driver.license_valid);
  const [vehicleId, setVehicleId] = useState(""); const [driverId, setDriverId] = useState(""); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!shipment) return; try { await api.patch(`/transporte/envios/${shipment.id}/asignar`, { vehicle_id: Number(vehicleId), driver_id: Number(driverId) }); await onSaved(); } catch (cause) { setError(getErrorMessage(cause)); } };
  return <Modal open={open} onClose={onClose} title={`Asignar transporte · ${shipment?.tracking_code ?? ""}`} width="620px">{error && <Alert>{error}</Alert>}<div className="assignment-summary"><div><small>Peso</small><strong>{shipment?.total_weight_kg} kg</strong></div><div><small>Volumen</small><strong>{shipment?.total_volume_m3} m³</strong></div><div><small>Ruta</small><strong>{shipment?.origin} → {shipment?.destination}</strong></div></div><Alert type="warning">La asignación no inicia el viaje. Sólo se muestran vehículos {shipment?.transport_mode?.toLowerCase()}s compatibles con la ruta; el conductor deberá aceptar la carga desde su sesión.</Alert><form onSubmit={submit}><div className="form-grid"><label className="field"><span>Vehículo compatible *</span><select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} required><option value="">Seleccione…</option>{compatible.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.type} · {vehicle.capacity_kg} kg</option>)}</select></label><label className="field"><span>Transportista disponible *</span><select value={driverId} onChange={(event) => setDriverId(event.target.value)} required><option value="">Seleccione…</option>{availableDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name} · Lic. {driver.license_number}</option>)}</select></label></div>{(!compatible.length || !availableDrivers.length) && <Alert type="warning">No existen suficientes recursos compatibles y disponibles.</Alert>}<div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary" disabled={!compatible.length || !availableDrivers.length}>Asignar y notificar</button></div></form></Modal>;
}

function EventModal({ shipment, open, onClose, onSaved }: { shipment: Shipment | null; open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ event_type: "UBICACION", description: eventDefaults.UBICACION, incident_type: "", latitude: shipment?.current_latitude ?? -16.5, longitude: shipment?.current_longitude ?? -68.15, delay_minutes: 60, evidence_url: "" });
  const [error, setError] = useState("");
  useEffect(() => {
    if (!shipment) return;
    setForm({
      event_type: "UBICACION",
      description: eventDefaults.UBICACION,
      incident_type: "",
      latitude: Number(shipment.current_latitude),
      longitude: Number(shipment.current_longitude),
      delay_minutes: Math.max(60, Number(shipment.delay_minutes || 0)),
      evidence_url: "",
    });
    setError("");
  }, [shipment]);
  const changeEventType = (eventType: string) =>
    setForm((current) => ({
      ...current,
      event_type: eventType,
      description: eventDefaults[eventType] ?? "",
      incident_type: eventType === "INCIDENCIA" ? current.incident_type || "MECANICA" : "",
    }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!shipment) return;
    try {
      await api.post(`/transporte/envios/${shipment.id}/eventos`, {
        ...form,
        incident_type: form.event_type === "INCIDENCIA" ? form.incident_type : null,
        delay_minutes: form.event_type === "RETRASO" ? Number(form.delay_minutes) : undefined,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        evidence_url: form.evidence_url || null,
      });
      await onSaved();
    } catch (cause) { setError(getErrorMessage(cause)); }
  };
  const descriptionLabel =
    form.event_type === "INCIDENCIA"
      ? "¿Qué ocurrió y cómo afecta la operación? *"
      : form.event_type === "RETRASO"
        ? "Causa del retraso y acción prevista *"
        : form.event_type === "RESOLUCION"
          ? "Cómo se resolvió la alerta *"
          : "Descripción *";
  return <Modal open={open} onClose={onClose} title={`Actualizar · ${shipment?.tracking_code ?? ""}`} width="680px">
    {error && <Alert>{error}</Alert>}
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field full"><span>Evento *</span><select value={form.event_type} onChange={(event) => changeEventType(event.target.value)}><option value="UBICACION">Ubicación</option><option value="ESCALA">Escala</option><option value="ADUANA">Aduana</option><option value="INCIDENCIA">Incidencia</option><option value="RETRASO">Retraso</option><option value="RESOLUCION">Resolución de alerta</option>{shipment?.destination_warehouse_id ? <option value="ARRIBO">Arribo al almacén</option> : <option value="ENTREGA">Entrega a cliente final</option>}</select><small className="hint">{shipment?.destination_warehouse_id ? "Al registrar el arribo, la carga quedará bloqueada hasta que Inventario confirme la recepción física." : "La entrega a cliente final cierra el envío. Ubicación y escala conservan las alertas activas."}</small></label>
        {form.event_type === "INCIDENCIA" && <label className="field full"><span>Tipo de incidencia *</span><select value={form.incident_type} onChange={(event) => setForm({ ...form, incident_type: event.target.value })} required><option value="MECANICA">Falla mecánica</option><option value="CLIMATICA">Condición climática</option><option value="ADUANA">Control aduanero</option><option value="TRAFICO">Tráfico, bloqueo o cierre vial</option><option value="SEGURIDAD">Seguridad de carga o conductor</option><option value="DOCUMENTACION">Documentación incompleta</option><option value="OTRA">Otra incidencia</option></select><small className="hint">Este dato aparecerá en transporte y en el rastreo público.</small></label>}
        {form.event_type === "RETRASO" && <label className="field full"><span>Demora estimada (minutos) *</span><input type="number" min="1" max="10080" value={form.delay_minutes} onChange={(event) => setForm({ ...form, delay_minutes: Number(event.target.value) })}/><small className="hint">Se conserva durante las actualizaciones de posición y se incorpora a la nueva ETA.</small></label>}
        <label className="field"><span>Latitud *</span><input type="number" step="any" value={form.latitude} onChange={(event) => setForm({ ...form, latitude: Number(event.target.value) })}/></label>
        <label className="field"><span>Longitud *</span><input type="number" step="any" value={form.longitude} onChange={(event) => setForm({ ...form, longitude: Number(event.target.value) })}/></label>
        <label className="field full"><span>{descriptionLabel}</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required/></label>
        <label className="field full"><span>Enlace de foto o documento (opcional)</span><input type="url" placeholder="https://servidor.com/evidencias/foto-o-documento.pdf" value={form.evidence_url} onChange={(event) => setForm({ ...form, evidence_url: event.target.value })}/><small className="hint">Pegue una URL pública o corporativa que abra una foto, acta o PDF. No es una dirección física ni un archivo de su PC.</small></label>
      </div>
      <div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary">Publicar actualización</button></div>
    </form>
  </Modal>;
}

const eventDefaults: Record<string, string> = {
  UBICACION: "Posición del vehículo actualizada",
  ESCALA: "Escala operativa completada",
  ADUANA: "Carga ingresó a control aduanero",
  INCIDENCIA: "Describa la incidencia, su impacto y la acción inmediata",
  RETRASO: "Describa la causa del retraso y el nuevo compromiso de entrega",
  RESOLUCION: "Describa la solución aplicada y confirme que el transporte puede continuar",
  ARRIBO: "Carga arribó al almacén y queda pendiente de revisión por Inventario",
  ENTREGA: "Entrega al cliente final confirmada conforme",
};

function incidentTypeLabel(value: string | null) {
  const labels: Record<string, string> = {
    MECANICA: "Falla mecánica",
    CLIMATICA: "Clima",
    ADUANA: "Aduana",
    TRAFICO: "Tráfico o bloqueo",
    SEGURIDAD: "Seguridad",
    DOCUMENTACION: "Documentación",
    OTRA: "Otra",
  };
  return value ? labels[value] ?? value : "Sin clasificar";
}

function formatDelay(minutes: number) {
  if (minutes < 1) return "Menos de 1 min";
  return `${minutes} min`;
}

function FleetModal({ open, vehicles, onClose, onSaved }: { open: boolean; vehicles: Vehicle[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const empty = { plate: "", type: "Camión", transport_mode: "TERRESTRE", capacity_kg: 1000, capacity_m3: 5, current_location: "" };
  const [editing,setEditing]=useState<Vehicle|null>(null);const[creating,setCreating]=useState(false);const[form,setForm]=useState(empty);const[error,setError]=useState("");
  const startCreate=()=>{setCreating(true);setEditing(null);setForm(empty);setError("")};
  const startEdit=(vehicle:Vehicle)=>{setCreating(false);setEditing(vehicle);setForm({plate:vehicle.plate,type:vehicle.type,transport_mode:vehicle.transport_mode,capacity_kg:Number(vehicle.capacity_kg),capacity_m3:Number(vehicle.capacity_m3),current_location:vehicle.current_location??""});setError("")};
  const submit=async(event:FormEvent)=>{event.preventDefault();try{const payload={...form,capacity_kg:Number(form.capacity_kg),capacity_m3:Number(form.capacity_m3),current_location:form.current_location||null};if(editing)await api.put(`/transporte/vehiculos/${editing.id}`,payload);else await api.post("/transporte/vehiculos",payload);setEditing(null);setCreating(false);await onSaved()}catch(cause){setError(getErrorMessage(cause))}};
  const toggle=async(vehicle:Vehicle)=>{try{await api.patch(`/transporte/vehiculos/${vehicle.id}/estado`,{active:!vehicle.active});await onSaved()}catch(cause){setError(getErrorMessage(cause))}};
  return <Modal open={open} onClose={onClose} title="Flota de transporte" width="820px">{error&&<Alert>{error}</Alert>}{!editing&&!creating?<><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Vehículo</th><th>Modo</th><th>Capacidad</th><th>Disponibilidad</th><th>Acciones</th></tr></thead><tbody>{vehicles.map((vehicle)=><tr key={vehicle.id}><td><strong>{vehicle.plate}</strong><small>{vehicle.type}</small></td><td>{vehicle.transport_mode}</td><td>{vehicle.capacity_kg} kg · {vehicle.capacity_m3} m³</td><td>{!vehicle.active?"Inactivo":vehicle.available?"Disponible":"En operación"}</td><td><div className="row-actions"><button className="icon-button" title="Editar" onClick={()=>startEdit(vehicle)}><Edit3 size={13}/></button><button className="icon-button" title={vehicle.active?"Desactivar":"Reactivar"} onClick={()=>void toggle(vehicle)}>{vehicle.active?<Trash2 size={13}/>:<RotateCcw size={13}/>}</button></div></td></tr>)}</tbody></table></div><div className="form-actions"><button className="button" onClick={onClose}>Cerrar</button><button className="button primary" onClick={startCreate}><Plus size={14}/> Nuevo vehículo</button></div></>:<form onSubmit={submit}><div className="form-grid"><label className="field"><span>Placa / matrícula *</span><input value={form.plate} onChange={(event)=>setForm({...form,plate:event.target.value.toUpperCase()})} required/></label><label className="field"><span>Tipo *</span><input value={form.type} onChange={(event)=>setForm({...form,type:event.target.value})} required/></label><label className="field"><span>Modo *</span><select value={form.transport_mode} onChange={(event)=>setForm({...form,transport_mode:event.target.value})}><option>TERRESTRE</option><option>MARITIMO</option><option>AEREO</option></select></label><label className="field"><span>Capacidad kg *</span><input type="number" min="1" value={form.capacity_kg} onChange={(event)=>setForm({...form,capacity_kg:Number(event.target.value)})}/></label><label className="field"><span>Capacidad m³ *</span><input type="number" min=".1" step=".1" value={form.capacity_m3} onChange={(event)=>setForm({...form,capacity_m3:Number(event.target.value)})}/></label><label className="field"><span>Ubicación actual</span><input value={form.current_location} onChange={(event)=>setForm({...form,current_location:event.target.value})}/></label></div><div className="form-actions"><button type="button" className="button" onClick={()=>{setEditing(null);setCreating(false)}}>Volver</button><button className="button primary">Guardar vehículo</button></div></form>}</Modal>;
}

function CreateShipmentModal({ open, routes, products, warehouses, purchaseOrders, onClose, onSaved }: { open: boolean; routes: RouteData[]; products: Product[]; warehouses: Warehouse[]; purchaseOrders: PurchaseOrder[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ mode: "DISTRIBUCION", route_id: "", purchase_order_id: "", origin_warehouse_id: "", destination_warehouse_id: "", product_id: "", quantity: 1, total_weight_kg: 1000, total_volume_m3: 5 });
  const [error, setError] = useState("");
  const inbound = form.mode === "COMPRA";
  const eligibleOrders = purchaseOrders.filter(
    (order) => !order.shipment_id && order.status === "CONFIRMADA",
  );
  const compatibleRoutes = routes.filter((route) => route.purpose === "AMBOS" || route.purpose === (inbound ? "ENTRADA_COMPRA" : "SALIDA_DISTRIBUCION"));
  const selectedRoute = routes.find((route) => route.id === Number(form.route_id));

  const changeMode = (mode: string) => {
    setForm((current) => ({
      ...current,
      mode,
      route_id: "",
      purchase_order_id: "",
      origin_warehouse_id: "",
      destination_warehouse_id: "",
      product_id: "",
    }));
    setError("");
  };

  const changeRoute = (routeId: string) => {
    const route = routes.find((item) => item.id === Number(routeId));
    setForm((current) => ({
      ...current,
      route_id: routeId,
      origin_warehouse_id:
        current.mode === "COMPRA"
          ? ""
          : route?.origin_warehouse_id
            ? String(route.origin_warehouse_id)
            : "",
      destination_warehouse_id: route?.destination_warehouse_id
        ? String(route.destination_warehouse_id)
        : "",
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await api.post("/logistica/envios", {
        route_id: Number(form.route_id),
        purchase_order_id: inbound ? Number(form.purchase_order_id) : null,
        origin_warehouse_id: inbound ? null : Number(form.origin_warehouse_id),
        destination_warehouse_id: form.destination_warehouse_id ? Number(form.destination_warehouse_id) : null,
        total_weight_kg: Number(form.total_weight_kg),
        total_volume_m3: Number(form.total_volume_m3),
        items: inbound ? [] : [{ product_id: Number(form.product_id), quantity: Number(form.quantity) }],
      });
      await onSaved();
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  return <Modal open={open} onClose={onClose} title="Crear envío" width="740px">
    {error && <Alert>{error}</Alert>}
    <form onSubmit={submit}>
      <div className={`flow-choice ${inbound ? "inbound" : "outbound"}`}>
        <strong>{inbound ? "Este camión viene hacia nosotros" : "Este camión sale desde nosotros"}</strong>
        <span>{inbound ? "Solo aparecen órdenes ya confirmadas por el proveedor. El conductor registra el arribo y después Inventario confirma el ingreso." : "Toma productos de un almacén propio. El stock se reserva al crear y se descuenta cuando el conductor acepta la carga."}</span>
      </div>
      <div className="form-grid">
        <label className="field full"><span>Tipo de flujo *</span><select value={form.mode} onChange={(event) => changeMode(event.target.value)}><option value="DISTRIBUCION">Salida de distribución · sale de nuestro almacén</option><option value="COMPRA">Entrada de compra · llega a nuestro almacén</option></select></label>
        <label className="field full"><span>Ruta compatible *</span><select value={form.route_id} onChange={(event) => changeRoute(event.target.value)} required><option value="">Seleccione origen → destino…</option>{compatibleRoutes.map((route) => <option key={route.id} value={route.id}>{route.origin_name} → {route.destination_name} · {route.transport_mode} · {route.purpose === "AMBOS" ? "uso mixto" : inbound ? "entrada" : "salida"}</option>)}</select><small className="hint">La flecha indica exactamente desde dónde sale y a dónde llega el vehículo.</small></label>
        {selectedRoute && <div className="selected-route full"><div><small>SALE DE</small><strong>{selectedRoute.origin_name}</strong></div><span>→</span><div><small>LLEGA A</small><strong>{selectedRoute.destination_name}</strong></div></div>}
        {inbound ? <label className="field full"><span>Orden confirmada por proveedor *</span><select value={form.purchase_order_id} onChange={(event) => setForm({ ...form, purchase_order_id: event.target.value })} required><option value="">Seleccione orden y proveedor…</option>{eligibleOrders.map((order) => <option key={order.id} value={order.id}>{order.code} · {order.supplier} · {order.items.length} producto(s)</option>)}</select><small className="hint">Los productos y cantidades se copian de esta orden; no se escriben manualmente.</small></label> : <>
          <label className="field"><span>Almacén del que sale *</span><select value={form.origin_warehouse_id} onChange={(event) => setForm({ ...form, origin_warehouse_id: event.target.value })} required><option value="">Seleccione…</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
          <label className="field"><span>Producto a despachar *</span><select value={form.product_id} onChange={(event) => setForm({ ...form, product_id: event.target.value })} required><option value="">Seleccione…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label>
          <label className="field"><span>Cantidad *</span><input type="number" min="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })}/></label>
        </>}
        <label className="field"><span>{inbound ? "Almacén que recibe *" : "Destino en inventario (opcional)"}</span><select value={form.destination_warehouse_id} onChange={(event) => setForm({ ...form, destination_warehouse_id: event.target.value })} required={inbound}><option value="">{inbound ? "Seleccione almacén receptor…" : "Cliente final / no ingresa a almacén"}</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
        <label className="field"><span>Peso total (kg) *</span><input type="number" min="1" value={form.total_weight_kg} onChange={(event) => setForm({ ...form, total_weight_kg: Number(event.target.value) })}/></label>
        <label className="field"><span>Volumen total (m³) *</span><input type="number" min=".1" step=".1" value={form.total_volume_m3} onChange={(event) => setForm({ ...form, total_volume_m3: Number(event.target.value) })}/></label>
      </div>
      {!compatibleRoutes.length && <Alert type="warning">No existe una ruta compatible. Cree primero una ruta con el propósito adecuado.</Alert>}
      {inbound && !eligibleOrders.length && <Alert type="warning">No hay órdenes confirmadas disponibles. Compras debe aprobar una orden y el proveedor correspondiente debe confirmarla desde su portal.</Alert>}
      <div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary" disabled={!compatibleRoutes.length || (inbound && !eligibleOrders.length)}><ClipboardPlus size={14}/> Crear envío</button></div>
    </form>
  </Modal>;
}
