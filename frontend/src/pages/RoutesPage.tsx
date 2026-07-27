import { AlertTriangle, MapPin, Navigation, Plus, Route as RouteIcon, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import { api, getErrorMessage } from "../api/client";
import { Alert, EmptyState, LoadingState, PageHeader, StatusBadge, formatDate } from "../components/ui";

interface RouteData {
  id: number; name: string; origin_name: string; origin_country: string; origin_latitude: number;
  origin_longitude: number; destination_name: string; destination_country: string;
  destination_latitude: number; destination_longitude: number; stops: Array<{ name: string; country: string; lat: number; lng: number }>;
  transport_mode: string; estimated_distance_km: number; estimated_duration_hours: number; customs_required: boolean; created_at: string;
}

const locations = [
  { name: "Centro La Paz", country: "Bolivia", lat: -16.5, lng: -68.15 },
  { name: "Centro Santa Cruz", country: "Bolivia", lat: -17.7833, lng: -63.1821 },
  { name: "Centro Lima", country: "Perú", lat: -12.0464, lng: -77.0428 },
  { name: "São Paulo", country: "Brasil", lat: -23.5505, lng: -46.6333 },
  { name: "Buenos Aires", country: "Argentina", lat: -34.6037, lng: -58.3816 },
  { name: "Puerto de Arica", country: "Chile", lat: -18.4783, lng: -70.3126 },
] as const;

export function RoutesPage() {
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "La Paz - Lima", origin: "Centro La Paz", destination: "Centro Lima", stop: "", transport_mode: "TERRESTRE" });

  const load = useCallback(async () => {
    try { const { data } = await api.get<RouteData[]>("/logistica/rutas"); setRoutes(data); }
    catch (cause) { setError(getErrorMessage(cause)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const origin = locations.find((location) => location.name === form.origin) ?? locations[0];
  const destination = locations.find((location) => location.name === form.destination) ?? locations[2];
  const stop = locations.find((location) => location.name === form.stop);
  const points = useMemo<[number, number][]>(() => [
    [origin.lat, origin.lng],
    ...(stop ? [[stop.lat, stop.lng] as [number, number]] : []),
    [destination.lat, destination.lng],
  ], [origin, stop, destination]);
  const straightDistance = Math.round(points.slice(1).reduce((total, point, index) => total + distanceKm(points[index]!, point), 0));
  const estimatedHours = Math.round(straightDistance / ({ TERRESTRE: 45, MARITIMO: 28, AEREO: 650 }[form.transport_mode] ?? 45) * 10) / 10;
  const customs = new Set([origin.country, stop?.country, destination.country].filter(Boolean)).size > 1;

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setMessage("");
    try {
      await api.post("/logistica/rutas", { name: form.name, origin, destination, stops: stop ? [stop] : [], transport_mode: form.transport_mode, is_template: true });
      setMessage("Ruta guardada como plantilla reutilizable."); await load();
    } catch (cause) { setError(getErrorMessage(cause)); }
  };

  return <>
    <PageHeader title="Planificación de rutas" subtitle="Rutas internacionales, escalas y alertas aduaneras" />
    {error && <Alert>{error}</Alert>}{message && <Alert type="success">{message}</Alert>}
    <section className="route-planner">
      <div className="map-panel">
        <MapContainer center={[-17, -67]} zoom={4} scrollWheelZoom>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Polyline positions={points} color="#2563EB" weight={4} dashArray="8 7" />
          {points.map((point, index) => <CircleMarker key={`${point[0]}-${point[1]}`} center={point} radius={index === 0 || index === points.length - 1 ? 8 : 6} pathOptions={{ color: "#fff", fillColor: index === 0 ? "#10B981" : index === points.length - 1 ? "#EF4444" : "#F59E0B", fillOpacity: 1, weight: 3 }}><Popup>{index === 0 ? origin.name : index === points.length - 1 ? destination.name : stop?.name}</Popup></CircleMarker>)}
        </MapContainer>
        <div className="map-overlay-card"><Navigation size={15}/><div><span>Distancia estimada</span><strong>{straightDistance.toLocaleString()} km</strong></div><div><span>Tiempo aproximado</span><strong>{estimatedHours} h</strong></div></div>
      </div>
      <form className="card route-form" onSubmit={submit}>
        <div className="card-header"><div><h2>Nueva ruta</h2><p>Configure el recorrido de distribución</p></div><RouteIcon size={18} color="#2563EB"/></div>
        <div className="card-body">
          <label className="field"><span>Nombre de la ruta *</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label className="field"><span>Origen *</span><select value={form.origin} onChange={(event) => setForm({ ...form, origin: event.target.value })}>{locations.map((location) => <option key={location.name}>{location.name}</option>)}</select></label>
          <label className="field"><span>Escala intermedia</span><select value={form.stop} onChange={(event) => setForm({ ...form, stop: event.target.value })}><option value="">Sin escala</option>{locations.filter((location) => location.name !== form.origin && location.name !== form.destination).map((location) => <option key={location.name}>{location.name}</option>)}</select></label>
          <label className="field"><span>Destino *</span><select value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })}>{locations.filter((location) => location.name !== form.origin).map((location) => <option key={location.name}>{location.name}</option>)}</select></label>
          <label className="field"><span>Modo de transporte *</span><select value={form.transport_mode} onChange={(event) => setForm({ ...form, transport_mode: event.target.value })}><option value="TERRESTRE">Terrestre</option><option value="MARITIMO">Marítimo</option><option value="AEREO">Aéreo</option></select></label>
          <div className="route-summary"><div><span>Distancia</span><strong>{straightDistance} km</strong></div><div><span>ETA</span><strong>{estimatedHours} h</strong></div></div>
          {customs && <div className="customs-alert"><AlertTriangle size={16}/><div><strong>Trámite aduanero requerido</strong><span>La ruta cruza una o más fronteras internacionales.</span></div></div>}
          <button className="button primary route-save"><Save size={15}/> Guardar ruta</button>
        </div>
      </form>
    </section>
    <section className="card routes-catalog">
      <div className="card-header"><div><h2>Plantillas de ruta</h2><p>{routes.length} rutas disponibles para nuevos envíos</p></div><Plus size={16} color="#94a3b8"/></div>
      {loading ? <LoadingState /> : routes.length === 0 ? <EmptyState /> : <div className="route-cards">{routes.map((route) => <article key={route.id}><div className="route-line"><span/><i/><span/></div><div><strong>{route.origin_name} → {route.destination_name}</strong><small>{route.origin_country} · {route.destination_country}</small></div><StatusBadge status={route.transport_mode}/><div><strong>{Number(route.estimated_distance_km).toLocaleString()} km</strong><small>{Number(route.estimated_duration_hours).toFixed(1)} h</small></div>{route.customs_required && <span className="customs-mini">Aduana</span>}<small>{formatDate(route.created_at)}</small></article>)}</div>}
    </section>
  </>;
}

function distanceKm(a: [number, number], b: [number, number]) {
  const radius = 6371; const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b[0] - a[0]); const dLng = toRad(b[1] - a[1]);
  const value = Math.sin(dLat/2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng/2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}
