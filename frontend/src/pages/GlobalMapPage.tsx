import { ChevronRight, Search, Truck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { api, getErrorMessage } from "../api/client";
import { Alert, LoadingState, PageHeader, StatusBadge, formatDate } from "../components/ui";

interface MapShipment {
  id: number; tracking_code: string; origin: string; destination: string; status: string;
  current_latitude: number; current_longitude: number; eta_at: string; transport_mode: string; route: string; driver: string | null; plate: string | null;
}

export function GlobalMapPage() {
  const [shipments, setShipments] = useState<MapShipment[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MapShipment | null>(null);
  const load = useCallback(async () => { try { const { data } = await api.get<MapShipment[]>("/logistica/mapa-envios", { params: { search } }); setShipments(data); } catch (cause) { setError(getErrorMessage(cause)); } finally { setLoading(false); } }, [search]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [load]);
  const color = (status: string) => status === "RETRASADO" || status === "INCIDENCIA" ? "#EF4444" : status === "EN_ADUANA" ? "#F59E0B" : "#10B981";
  return <>
    <PageHeader title="Mapa global de envíos" subtitle="Visibilidad mundial de todas las operaciones activas" />
    {error && <Alert>{error}</Alert>}
    {loading ? <LoadingState/> : <section className="global-map-layout">
      <aside className="card map-shipment-list"><div className="map-list-head"><strong>{shipments.length} envíos activos</strong><div className="search-control"><Search size={14}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrar envíos…"/></div></div>
        <div className="map-list-scroll">{shipments.map((shipment) => <button key={shipment.id} className={selected?.id === shipment.id ? "selected" : ""} onClick={() => setSelected(shipment)}><span className="map-status-dot" style={{background: color(shipment.status)}}/><div><strong>{shipment.tracking_code}</strong><small>{shipment.origin} → {shipment.destination}</small><em>ETA {formatDate(shipment.eta_at, true)}</em></div><StatusBadge status={shipment.status}/><ChevronRight size={14}/></button>)}</div>
      </aside>
      <div className="map-panel global-map"><MapContainer center={[-18,-64]} zoom={3} scrollWheelZoom><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{shipments.filter((shipment) => shipment.current_latitude && shipment.current_longitude).map((shipment) => <CircleMarker key={shipment.id} center={[Number(shipment.current_latitude),Number(shipment.current_longitude)]} radius={selected?.id === shipment.id ? 11 : 8} pathOptions={{color:"#fff",fillColor:color(shipment.status),fillOpacity:1,weight:3}} eventHandlers={{click:()=>setSelected(shipment)}}><Popup><strong>{shipment.tracking_code}</strong><br/>{shipment.origin} → {shipment.destination}<br/>ETA {formatDate(shipment.eta_at,true)}</Popup></CircleMarker>)}</MapContainer>
        <div className="map-legend"><span><i style={{background:"#10B981"}}/> En curso</span><span><i style={{background:"#F59E0B"}}/> En aduana</span><span><i style={{background:"#EF4444"}}/> Retrasado / incidencia</span></div>
        {selected && <div className="selected-shipment-card"><div className="transport-symbol"><Truck size={18}/></div><div><span>{selected.tracking_code}</span><strong>{selected.origin} → {selected.destination}</strong><small>{selected.driver ?? "Sin transportista"} · {selected.plate ?? "Sin vehículo"}</small></div><a href={`/rastreo/${selected.tracking_code}`} className="button primary">Ver detalle</a></div>}
      </div>
    </section>}
  </>;
}
