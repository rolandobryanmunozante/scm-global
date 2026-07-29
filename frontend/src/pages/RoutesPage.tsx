import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Edit3,
  Plus,
  RotateCcw,
  Route as RouteIcon,
  Save,
  Ship,
  Trash2,
  Truck,
  Plane,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import { api, getErrorMessage } from "../api/client";
import { Alert, EmptyState, LoadingState, PageHeader, StatusBadge, formatDate } from "../components/ui";

type RoutePurpose = "ENTRADA_COMPRA" | "SALIDA_DISTRIBUCION" | "AMBOS";

interface Location {
  name: string;
  country: string;
  lat: number;
  lng: number;
  warehouseId?: number;
  code?: string;
}

interface Warehouse {
  id: number;
  code: string;
  name: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
}

interface RouteData {
  id: number;
  name: string;
  origin_name: string;
  origin_country: string;
  origin_latitude: number;
  origin_longitude: number;
  destination_name: string;
  destination_country: string;
  destination_latitude: number;
  destination_longitude: number;
  stops: Location[];
  transport_mode: string;
  purpose: RoutePurpose;
  estimated_distance_km: number;
  estimated_duration_hours: number;
  customs_required: boolean;
  origin_warehouse_id: number | null;
  destination_warehouse_id: number | null;
  inbound_shipments: number;
  outbound_shipments: number;
  active: boolean;
  created_at: string;
}

const externalLocations: Location[] = [
  { name: "Desaguadero", country: "Bolivia", lat: -16.5656, lng: -69.0417 },
  { name: "São Paulo", country: "Brasil", lat: -23.5505, lng: -46.6333 },
  { name: "Buenos Aires", country: "Argentina", lat: -34.6037, lng: -58.3816 },
  { name: "Puerto de Arica", country: "Chile", lat: -18.4783, lng: -70.3126 },
];

const purposeCopy: Record<RoutePurpose, { title: string; description: string }> = {
  ENTRADA_COMPRA: {
    title: "Llegada de compra",
    description: "El camión recoge al proveedor y llega a nuestro almacén; no descuenta stock de origen.",
  },
  SALIDA_DISTRIBUCION: {
    title: "Salida de distribución",
    description: "El camión sale de nuestro almacén; reserva y descuenta stock al despacharse.",
  },
  AMBOS: {
    title: "Uso mixto",
    description: "La ruta puede utilizarse en ambos sentidos operativos según el tipo de envío.",
  },
};

const transportModes = {
  TERRESTRE: {
    label: "Terrestre",
    description: "Corredor vial · velocidad referencial 45 km/h",
    color: "#0A4174",
    dashArray: undefined,
    icon: Truck,
  },
  MARITIMO: {
    label: "Marítimo",
    description: "Tramo portuario · velocidad referencial 28 km/h",
    color: "#4E8EA2",
    dashArray: "14 9",
    icon: Ship,
  },
  AEREO: {
    label: "Aéreo",
    description: "Trayectoria aérea · velocidad referencial 650 km/h",
    color: "#7BBDE8",
    dashArray: "4 10",
    icon: Plane,
  },
} as const;

type TransportMode = keyof typeof transportModes;

export function RoutesPage() {
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "La Paz - Lima",
    origin: "Centro La Paz",
    destination: "Centro Lima",
    stop: "",
    transport_mode: "TERRESTRE",
    purpose: "AMBOS" as RoutePurpose,
  });

  const load = useCallback(async () => {
    try {
      const [routeResponse, warehouseResponse] = await Promise.all([
        api.get<RouteData[]>("/logistica/rutas", { params: { active: "all" } }),
        api.get<Warehouse[]>("/inventarios/almacenes"),
      ]);
      setRoutes(routeResponse.data);
      setWarehouses(warehouseResponse.data);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const locations = useMemo(() => {
    const items = new Map<string, Location>();
    for (const warehouse of warehouses) {
      if (warehouse.latitude == null || warehouse.longitude == null) continue;
      items.set(warehouse.name, {
        name: warehouse.name,
        country: warehouse.country,
        lat: Number(warehouse.latitude),
        lng: Number(warehouse.longitude),
        warehouseId: warehouse.id,
        code: warehouse.code,
      });
    }
    for (const location of externalLocations) items.set(location.name, location);
    for (const route of routes) {
      items.set(route.origin_name, {
        name: route.origin_name,
        country: route.origin_country,
        lat: Number(route.origin_latitude),
        lng: Number(route.origin_longitude),
        warehouseId: route.origin_warehouse_id ?? undefined,
      });
      items.set(route.destination_name, {
        name: route.destination_name,
        country: route.destination_country,
        lat: Number(route.destination_latitude),
        lng: Number(route.destination_longitude),
        warehouseId: route.destination_warehouse_id ?? undefined,
      });
      for (const stop of route.stops ?? []) items.set(stop.name, stop);
    }
    return [...items.values()];
  }, [routes, warehouses]);

  const origin = locations.find((location) => location.name === form.origin) ?? locations[0];
  const destination =
    locations.find((location) => location.name === form.destination) ?? locations[1] ?? locations[0];
  const stop = locations.find((location) => location.name === form.stop);
  const points = useMemo<[number, number][]>(
    () =>
      origin && destination
        ? [
            [origin.lat, origin.lng],
            ...(stop ? ([[stop.lat, stop.lng]] as [number, number][]) : []),
            [destination.lat, destination.lng],
          ]
        : [],
    [origin, stop, destination],
  );
  const straightDistance = Math.round(
    points.slice(1).reduce((total, point, index) => total + distanceKm(points[index]!, point), 0),
  );
  const estimatedHours =
    Math.round(
      (straightDistance /
        ({ TERRESTRE: 45, MARITIMO: 28, AEREO: 650 }[form.transport_mode] ?? 45)) *
        10,
    ) / 10;
  const selectedMode =
    transportModes[form.transport_mode as TransportMode] ?? transportModes.TERRESTRE;
  const SelectedModeIcon = selectedMode.icon;
  const customs =
    origin && destination
      ? new Set([origin.country, stop?.country, destination.country].filter(Boolean)).size > 1
      : false;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!origin || !destination) {
      setError("Debe existir al menos un origen y un destino con coordenadas.");
      return;
    }
    try {
      const payload = {
        name: form.name,
        origin,
        destination,
        stops: stop ? [stop] : [],
        transport_mode: form.transport_mode,
        purpose: form.purpose,
        is_template: true,
      };
      if (editingId) await api.put(`/logistica/rutas/${editingId}`, payload);
      else await api.post("/logistica/rutas", payload);
      setMessage(editingId ? "Ruta actualizada correctamente." : "Ruta guardada y lista para usarse.");
      setEditingId(null);
      await load();
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  const edit = (route: RouteData) => {
    setEditingId(route.id);
    setForm({
      name: route.name,
      origin: route.origin_name,
      destination: route.destination_name,
      stop: route.stops?.[0]?.name ?? "",
      transport_mode: route.transport_mode,
      purpose: route.purpose ?? "AMBOS",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggle = async (route: RouteData) => {
    try {
      await api.patch(`/logistica/rutas/${route.id}/estado`, { active: !route.active });
      await load();
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  const selectedPurpose = purposeCopy[form.purpose];

  return (
    <>
      <PageHeader
        title="Planificación de rutas"
        subtitle="Cada ruta es direccional: el vehículo sale del origen y llega al destino"
      />
      {error && <Alert>{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}
      <section className="flow-explainer">
        <article>
          <ArrowDownToLine size={20} />
          <div>
            <strong>Entrada de compra</strong>
            <span>Proveedor o punto de recogida → almacén receptor. El stock aumenta al entregar.</span>
          </div>
        </article>
        <article>
          <ArrowUpFromLine size={20} />
          <div>
            <strong>Salida de distribución</strong>
            <span>Almacén de origen → otro almacén o cliente. El stock se reserva y despacha.</span>
          </div>
        </article>
      </section>
      <section className="route-planner">
        <div className="map-panel">
          <MapContainer
            className={`route-map mode-${form.transport_mode.toLowerCase()}`}
            center={[-17, -67]}
            zoom={4}
            scrollWheelZoom
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {points.length > 1 && (
              <Polyline
                key={form.transport_mode}
                positions={points}
                color={selectedMode.color}
                weight={form.transport_mode === "AEREO" ? 5 : 4}
                opacity={0.92}
                dashArray={selectedMode.dashArray}
              />
            )}
            {points.map((point, index) => (
              <CircleMarker
                key={`${point[0]}-${point[1]}-${index}`}
                center={point}
                radius={index === 0 || index === points.length - 1 ? 8 : 6}
                pathOptions={{
                  color: "#fff",
                  fillColor:
                    index === 0 ? "#10B981" : index === points.length - 1 ? "#EF4444" : "#F59E0B",
                  fillOpacity: 1,
                  weight: 3,
                }}
              >
                <Popup>
                  {index === 0 ? `Sale: ${origin?.name}` : index === points.length - 1 ? `Llega: ${destination?.name}` : `Escala: ${stop?.name}`}
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
          <div className={`map-overlay-card mode-${form.transport_mode.toLowerCase()}`}>
            <SelectedModeIcon size={17} />
            <div className="map-mode-copy">
              <span>Modo seleccionado</span>
              <strong>{selectedMode.label}</strong>
            </div>
            <div>
              <span>Distancia estimada</span>
              <strong>{straightDistance.toLocaleString()} km</strong>
            </div>
            <div>
              <span>Tiempo aproximado</span>
              <strong>{estimatedHours} h</strong>
            </div>
          </div>
        </div>
        <form className="card route-form" onSubmit={submit}>
          <div className="card-header">
            <div>
              <h2>{editingId ? "Editar ruta" : "Nueva ruta"}</h2>
              <p>Defina primero para qué operación se utilizará</p>
            </div>
            {editingId ? (
              <button
                type="button"
                className="icon-button"
                title="Cancelar edición"
                onClick={() => setEditingId(null)}
              >
                <X size={16} />
              </button>
            ) : (
              <RouteIcon size={18} color="#2563EB" />
            )}
          </div>
          <div className="card-body">
            <label className="field">
              <span>Propósito de la ruta *</span>
              <select
                value={form.purpose}
                onChange={(event) =>
                  setForm({ ...form, purpose: event.target.value as RoutePurpose })
                }
              >
                <option value="ENTRADA_COMPRA">Llegada de compra</option>
                <option value="SALIDA_DISTRIBUCION">Salida de distribución</option>
                <option value="AMBOS">Uso mixto</option>
              </select>
              <small className="hint">{selectedPurpose.description}</small>
            </label>
            <label className="field">
              <span>Nombre de la ruta *</span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Origen: el vehículo sale de *</span>
              <select
                value={form.origin}
                onChange={(event) => setForm({ ...form, origin: event.target.value })}
              >
                {locations.map((location) => (
                  <option key={location.name} value={location.name}>
                    {location.code ? `${location.code} · ` : ""}
                    {location.name} · {location.country}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Escala intermedia</span>
              <select
                value={form.stop}
                onChange={(event) => setForm({ ...form, stop: event.target.value })}
              >
                <option value="">Sin escala</option>
                {locations
                  .filter(
                    (location) =>
                      location.name !== form.origin && location.name !== form.destination,
                  )
                  .map((location) => (
                    <option key={location.name} value={location.name}>
                      {location.name} · {location.country}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Destino: el vehículo llega a *</span>
              <select
                value={form.destination}
                onChange={(event) => setForm({ ...form, destination: event.target.value })}
              >
                {locations
                  .filter((location) => location.name !== form.origin)
                  .map((location) => (
                    <option key={location.name} value={location.name}>
                      {location.code ? `${location.code} · ` : ""}
                      {location.name} · {location.country}
                    </option>
                  ))}
              </select>
            </label>
            <fieldset className="transport-mode-field">
              <legend>Modo de transporte *</legend>
              <div className="transport-mode-picker">
                {(Object.entries(transportModes) as Array<
                  [TransportMode, (typeof transportModes)[TransportMode]]
                >).map(([value, mode]) => {
                  const ModeIcon = mode.icon;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={form.transport_mode === value ? "active" : ""}
                      aria-pressed={form.transport_mode === value}
                      onClick={() => setForm({ ...form, transport_mode: value })}
                    >
                      <ModeIcon size={18} />
                      <span>{mode.label}</span>
                    </button>
                  );
                })}
              </div>
              <small>{selectedMode.description}. El ETA cambia automáticamente.</small>
            </fieldset>
            <div className="route-summary">
              <div>
                <span>Distancia</span>
                <strong>{straightDistance} km</strong>
              </div>
              <div>
                <span>ETA</span>
                <strong>{estimatedHours} h</strong>
              </div>
            </div>
            {customs && (
              <div className="customs-alert">
                <AlertTriangle size={16} />
                <div>
                  <strong>Trámite aduanero requerido</strong>
                  <span>La ruta cruza una o más fronteras internacionales.</span>
                </div>
              </div>
            )}
            <button className="button primary route-save" disabled={!origin || !destination}>
              <Save size={15} /> {editingId ? "Actualizar ruta" : "Guardar ruta"}
            </button>
          </div>
        </form>
      </section>
      <section className="card routes-catalog">
        <div className="card-header">
          <div>
            <h2>Plantillas de ruta</h2>
            <p>{routes.length} rutas disponibles para nuevos envíos</p>
          </div>
          <Plus size={16} color="#94a3b8" />
        </div>
        {loading ? (
          <LoadingState />
        ) : routes.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="route-cards">
            {routes.map((route) => (
              <article key={route.id}>
                <div className={`route-line mode-${route.transport_mode.toLowerCase()}`}>
                  <span />
                  <i />
                  <span />
                </div>
                <div>
                  <strong>
                    {route.origin_name} → {route.destination_name}
                  </strong>
                  <small>
                    Sale de {route.origin_country} · llega a {route.destination_country}
                  </small>
                </div>
                <div className={`route-purpose ${route.purpose.toLowerCase()}`}>
                  <strong>{purposeCopy[route.purpose].title}</strong>
                  <small>
                    {route.inbound_shipments} entradas · {route.outbound_shipments} salidas
                  </small>
                </div>
                <StatusBadge status={route.active ? route.transport_mode : "INACTIVA"} />
                <div>
                  <strong>{Number(route.estimated_distance_km).toLocaleString()} km</strong>
                  <small>{Number(route.estimated_duration_hours).toFixed(1)} h</small>
                </div>
                {route.customs_required ? (
                  <span className="customs-mini">Aduana</span>
                ) : (
                  <span />
                )}
                <div className="row-actions">
                  <button className="icon-button" title="Editar" onClick={() => edit(route)}>
                    <Edit3 size={13} />
                  </button>
                  <button
                    className="icon-button"
                    title={route.active ? "Desactivar" : "Reactivar"}
                    onClick={() => void toggle(route)}
                  >
                    {route.active ? <Trash2 size={13} /> : <RotateCcw size={13} />}
                  </button>
                  <small>{formatDate(route.created_at)}</small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function distanceKm(a: [number, number], b: [number, number]) {
  const radius = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}
