import { ClipboardPlus, LocateFixed, MapPin, Plus, Send, Truck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Alert, EmptyState, LoadingState, Modal, PageHeader, StatusBadge, formatDate } from "../components/ui";

interface Shipment {
  id: number; tracking_code: string; origin: string; destination: string; status: string;
  total_weight_kg: number; total_volume_m3: number; current_latitude: number; current_longitude: number;
  eta_at: string | null; route: string; transport_mode: string; plate: string | null; vehicle: string | null; driver: string | null;
  items: Array<{ product_id: number; sku: string; product: string; quantity: number }>;
}
interface Vehicle { id: number; plate: string; type: string; capacity_kg: number; capacity_m3: number; current_location: string; available: boolean }
interface Driver { id: number; full_name: string; email: string; license_number: string; license_expiry: string; license_valid: boolean; available: boolean }
interface RouteData { id: number; name: string; origin_name: string; destination_name: string; transport_mode: string }
interface Product { id: number; sku: string; name: string }

export function ShipmentsPage() {
  const { can, user } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [assigning, setAssigning] = useState<Shipment | null>(null);
  const [updating, setUpdating] = useState<Shipment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const requests = [
        api.get<Shipment[]>("/transporte/envios"),
        can("shipments.assign") ? api.get<Vehicle[]>("/transporte/vehiculos") : Promise.resolve({ data: [] }),
        can("shipments.assign") ? api.get<Driver[]>("/transporte/transportistas") : Promise.resolve({ data: [] }),
        can("shipments.assign") ? api.get<RouteData[]>("/logistica/rutas") : Promise.resolve({ data: [] }),
        can("shipments.assign") ? api.get<Product[]>("/inventarios/productos") : Promise.resolve({ data: [] }),
      ] as const;
      const [shipmentResponse, vehicleResponse, driverResponse, routeResponse, productResponse] = await Promise.all(requests);
      setShipments(shipmentResponse.data); setVehicles(vehicleResponse.data); setDrivers(driverResponse.data); setRoutes(routeResponse.data); setProducts(productResponse.data);
    } catch (cause) { setError(getErrorMessage(cause)); } finally { setLoading(false); }
  }, [can]);

  useEffect(() => { void load(); }, [load]);

  return <>
    <PageHeader title="Asignación y seguimiento" subtitle={user?.role === "DRIVER" ? "Envíos asignados a su operación" : "Vehículos, transportistas y estado de los envíos"} actions={
      can("shipments.assign") ? <button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={15}/> Nuevo envío</button> : undefined
    } />
    {error && <Alert>{error}</Alert>}{message && <Alert type="success">{message}</Alert>}
    {loading ? <LoadingState /> : shipments.length === 0 ? <EmptyState title="No hay envíos disponibles" /> : <div className="shipments-board">{shipments.map((shipment) => <article className="card shipment-card" key={shipment.id}>
      <div className="shipment-card-top"><div className={`transport-symbol ${shipment.transport_mode.toLowerCase()}`}><Truck size={19}/></div><div><span>{shipment.tracking_code}</span><strong>{shipment.origin} → {shipment.destination}</strong></div><StatusBadge status={shipment.status}/></div>
      <div className="shipment-progress"><span className="complete"/><i className={shipment.status !== "PREPARANDO" ? "complete" : ""}/><i className={["EN_ADUANA","ENTREGADO"].includes(shipment.status) ? "complete" : ""}/><span className={shipment.status === "ENTREGADO" ? "complete" : ""}/></div>
      <div className="shipment-stages"><span>Preparando</span><span>En tránsito</span><span>Aduana</span><span>Entregado</span></div>
      <div className="shipment-details"><div><small>Vehículo</small><strong>{shipment.plate ?? "Sin asignar"}</strong></div><div><small>Transportista</small><strong>{shipment.driver ?? "Sin asignar"}</strong></div><div><small>ETA</small><strong>{formatDate(shipment.eta_at, true)}</strong></div><div><small>Carga</small><strong>{shipment.total_weight_kg} kg</strong></div></div>
      <div className="shipment-items">{shipment.items?.map((item) => <span key={item.product_id}>{item.sku} · {item.quantity}</span>)}</div>
      <footer><a className="button" href={`/rastreo/${shipment.tracking_code}`}><LocateFixed size={14}/> Ver rastreo</a>
        {shipment.status === "PREPARANDO" && can("shipments.assign") && <button className="button primary" onClick={() => setAssigning(shipment)}><Truck size={14}/> Asignar transporte</button>}
        {can("shipments.update") && shipment.status !== "ENTREGADO" && <button className="button primary" onClick={() => setUpdating(shipment)}><Send size={14}/> Actualizar estado</button>}
      </footer>
    </article>)}</div>}
    <AssignModal shipment={assigning} open={Boolean(assigning)} vehicles={vehicles} drivers={drivers} onClose={() => setAssigning(null)} onSaved={async () => { setAssigning(null); setMessage("Transporte asignado y notificación enviada."); await load(); }} />
    <EventModal shipment={updating} open={Boolean(updating)} onClose={() => setUpdating(null)} onSaved={async () => { setUpdating(null); setMessage("Estado actualizado en tiempo real."); await load(); }} />
    <CreateShipmentModal open={createOpen} routes={routes} products={products} onClose={() => setCreateOpen(false)} onSaved={async () => { setCreateOpen(false); setMessage("Envío creado y listo para asignación."); await load(); }} />
  </>;
}

function AssignModal({ shipment, open, vehicles, drivers, onClose, onSaved }: { shipment: Shipment | null; open: boolean; vehicles: Vehicle[]; drivers: Driver[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const compatible = vehicles.filter((vehicle) => vehicle.available && Number(vehicle.capacity_kg) >= Number(shipment?.total_weight_kg ?? 0) && Number(vehicle.capacity_m3) >= Number(shipment?.total_volume_m3 ?? 0));
  const availableDrivers = drivers.filter((driver) => driver.available && driver.license_valid);
  const [vehicleId, setVehicleId] = useState(""); const [driverId, setDriverId] = useState(""); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!shipment) return; try { await api.patch(`/transporte/envios/${shipment.id}/asignar`, { vehicle_id: Number(vehicleId), driver_id: Number(driverId) }); await onSaved(); } catch (cause) { setError(getErrorMessage(cause)); } };
  return <Modal open={open} onClose={onClose} title={`Asignar transporte · ${shipment?.tracking_code ?? ""}`} width="620px">{error && <Alert>{error}</Alert>}<div className="assignment-summary"><div><small>Peso</small><strong>{shipment?.total_weight_kg} kg</strong></div><div><small>Volumen</small><strong>{shipment?.total_volume_m3} m³</strong></div><div><small>Ruta</small><strong>{shipment?.origin} → {shipment?.destination}</strong></div></div><form onSubmit={submit}><div className="form-grid"><label className="field"><span>Vehículo compatible *</span><select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} required><option value="">Seleccione…</option>{compatible.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.type} · {vehicle.capacity_kg} kg</option>)}</select></label><label className="field"><span>Transportista disponible *</span><select value={driverId} onChange={(event) => setDriverId(event.target.value)} required><option value="">Seleccione…</option>{availableDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name} · Lic. {driver.license_number}</option>)}</select></label></div>{(!compatible.length || !availableDrivers.length) && <Alert type="warning">No existen suficientes recursos compatibles y disponibles.</Alert>}<div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary" disabled={!compatible.length || !availableDrivers.length}>Asignar y notificar</button></div></form></Modal>;
}

function EventModal({ shipment, open, onClose, onSaved }: { shipment: Shipment | null; open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ event_type: "UBICACION", description: "Actualización de ubicación", latitude: shipment?.current_latitude ?? -16.5, longitude: shipment?.current_longitude ?? -68.15, evidence_url: "" });
  const [error, setError] = useState("");
  useEffect(() => { if (shipment) setForm((current) => ({ ...current, latitude: Number(shipment.current_latitude), longitude: Number(shipment.current_longitude) })); }, [shipment]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!shipment) return; try { await api.post(`/transporte/envios/${shipment.id}/eventos`, { ...form, latitude: Number(form.latitude), longitude: Number(form.longitude), evidence_url: form.evidence_url || null }); await onSaved(); } catch (cause) { setError(getErrorMessage(cause)); } };
  return <Modal open={open} onClose={onClose} title={`Actualizar · ${shipment?.tracking_code ?? ""}`} width="620px">{error && <Alert>{error}</Alert>}<form onSubmit={submit}><div className="form-grid"><label className="field full"><span>Evento *</span><select value={form.event_type} onChange={(event) => setForm({ ...form, event_type: event.target.value })}><option value="UBICACION">Ubicación</option><option value="ESCALA">Escala</option><option value="ADUANA">Aduana</option><option value="INCIDENCIA">Incidencia</option><option value="ENTREGA">Entrega</option></select></label><label className="field"><span>Latitud *</span><input type="number" step="any" value={form.latitude} onChange={(event) => setForm({ ...form, latitude: Number(event.target.value) })}/></label><label className="field"><span>Longitud *</span><input type="number" step="any" value={form.longitude} onChange={(event) => setForm({ ...form, longitude: Number(event.target.value) })}/></label><label className="field full"><span>Descripción *</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required/></label><label className="field full"><span>URL de evidencia</span><input type="url" value={form.evidence_url} onChange={(event) => setForm({ ...form, evidence_url: event.target.value })}/></label></div><div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary">Publicar actualización</button></div></form></Modal>;
}

function CreateShipmentModal({ open, routes, products, onClose, onSaved }: { open: boolean; routes: RouteData[]; products: Product[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ route_id: "", product_id: "", quantity: 1, total_weight_kg: 1000, total_volume_m3: 5 }); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); try { await api.post("/logistica/envios", { route_id: Number(form.route_id), total_weight_kg: Number(form.total_weight_kg), total_volume_m3: Number(form.total_volume_m3), items: [{ product_id: Number(form.product_id), quantity: Number(form.quantity) }] }); await onSaved(); } catch (cause) { setError(getErrorMessage(cause)); } };
  return <Modal open={open} onClose={onClose} title="Crear envío" width="620px">{error && <Alert>{error}</Alert>}<form onSubmit={submit}><div className="form-grid"><label className="field full"><span>Ruta *</span><select value={form.route_id} onChange={(event) => setForm({ ...form, route_id: event.target.value })} required><option value="">Seleccione…</option>{routes.map((route) => <option key={route.id} value={route.id}>{route.name} · {route.transport_mode}</option>)}</select></label><label className="field full"><span>Producto *</span><select value={form.product_id} onChange={(event) => setForm({ ...form, product_id: event.target.value })} required><option value="">Seleccione…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label><label className="field"><span>Cantidad *</span><input type="number" min="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })}/></label><label className="field"><span>Peso total (kg) *</span><input type="number" min="1" value={form.total_weight_kg} onChange={(event) => setForm({ ...form, total_weight_kg: Number(event.target.value) })}/></label><label className="field"><span>Volumen total (m³) *</span><input type="number" min=".1" step=".1" value={form.total_volume_m3} onChange={(event) => setForm({ ...form, total_volume_m3: Number(event.target.value) })}/></label></div><div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary"><ClipboardPlus size={14}/> Crear envío</button></div></form></Modal>;
}
