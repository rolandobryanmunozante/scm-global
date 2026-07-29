import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  PackageCheck,
  Plane,
  Radio,
  Search,
  Ship,
  Truck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { io } from "socket.io-client";
import { api, getErrorMessage } from "../api/client";
import { Alert, LoadingState, PageHeader, StatusBadge, formatDate } from "../components/ui";

interface MapShipment {
  id: number;
  tracking_code: string;
  origin: string;
  destination: string;
  status: string;
  current_latitude: number;
  current_longitude: number;
  eta_at: string;
  transport_mode: string;
  route: string;
  driver: string | null;
  plate: string | null;
  vehicle: string | null;
  last_position_at: string | null;
  position_state: "EN_VIVO" | "RECIENTE" | "SIN_ACTUALIZAR";
  is_delayed: boolean;
  delay_minutes: number;
  incident_count: number;
  item_count: number;
  cargo_units: number;
  latest_event: string | null;
}

export function GlobalMapPage() {
  const [shipments, setShipments] = useState<MapShipment[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MapShipment | null>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const { data } = await api.get<MapShipment[]>("/logistica/mapa-envios", {
        params: { search },
      });
      setShipments(data);
      setSelected((current) =>
        current ? data.find((shipment) => shipment.id === current.id) ?? null : null,
      );
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
      auth: { rooms: ["shipments"] },
    });
    const refresh = () => void load();
    socket.on("shipment:created", refresh);
    socket.on("shipment:updated", refresh);
    socket.on("shipment:event", refresh);
    return () => {
      socket.disconnect();
    };
  }, [load]);

  const metrics = useMemo(
    () => ({
      active: shipments.length,
      live: shipments.filter((shipment) => shipment.position_state === "EN_VIVO").length,
      positioned: shipments.filter(hasPosition).length,
      delayed: shipments.filter((shipment) => shipment.is_delayed).length,
      incidents: shipments.filter((shipment) => shipment.status === "INCIDENCIA").length,
    }),
    [shipments],
  );
  const color = (status: string) =>
    status === "RETRASADO" || status === "INCIDENCIA"
      ? "#EF4444"
      : status === "EN_ADUANA"
        ? "#F59E0B"
        : status === "PREPARANDO" || status === "ASIGNADO"
          ? "#64748B"
          : status === "PENDIENTE_RECEPCION"
            ? "#2563EB"
          : "#10B981";

  return (
    <>
      <PageHeader
        title="Centro de monitoreo global"
        subtitle="Ubicación, carga, demoras e incidencias de todas las operaciones activas"
      />
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <section className="global-ops-stats">
            <article className="card">
              <Truck size={18} />
              <div>
                <small>Operaciones activas</small>
                <strong>{metrics.active}</strong>
              </div>
            </article>
            <article className="card live">
              <Radio size={18} />
              <div>
                <small>Ubicación disponible</small>
                <strong>{metrics.positioned}</strong>
                <span>{metrics.live} con señal en vivo</span>
              </div>
            </article>
            <article className="card delay">
              <Clock3 size={18} />
              <div>
                <small>Con retraso</small>
                <strong>{metrics.delayed}</strong>
              </div>
            </article>
            <article className="card incident">
              <AlertTriangle size={18} />
              <div>
                <small>Con incidencia</small>
                <strong>{metrics.incidents}</strong>
              </div>
            </article>
          </section>
          <section className="global-map-layout">
            <aside className="card map-shipment-list">
              <div className="map-list-head">
                <strong>{shipments.length} envíos visibles</strong>
                <div className="search-control">
                  <Search size={14} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Código, origen o destino…"
                  />
                </div>
              </div>
              <div className="map-list-scroll">
                {shipments.map((shipment) => (
                  <button
                    key={shipment.id}
                    className={selected?.id === shipment.id ? "selected" : ""}
                    onClick={() => setSelected(shipment)}
                  >
                    <span
                      className="map-status-dot"
                      style={{ background: color(shipment.status) }}
                    />
                    <div>
                      <strong>{shipment.tracking_code}</strong>
                      <small>
                        {shipment.origin} → {shipment.destination}
                      </small>
                      <em>
                        ETA {formatDate(shipment.eta_at, true)} · {shipment.cargo_units} unidades
                      </em>
                      <span className={`position-state ${shipment.position_state.toLowerCase()}`}>
                        {shipment.position_state.replaceAll("_", " ")}
                      </span>
                    </div>
                    <StatusBadge status={shipment.status} />
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
            </aside>
            <div className="map-panel global-map">
              <MapContainer center={[-18, -64]} zoom={3} scrollWheelZoom>
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapSelectionFocus shipment={selected} />
                {shipments
                  .filter(hasPosition)
                  .map((shipment) => (
                    <CircleMarker
                      key={shipment.id}
                      center={[
                        Number(shipment.current_latitude),
                        Number(shipment.current_longitude),
                      ]}
                      radius={selected?.id === shipment.id ? 11 : 8}
                      pathOptions={{
                        color: "#fff",
                        fillColor: color(shipment.status),
                        fillOpacity: 1,
                        weight: 3,
                      }}
                      eventHandlers={{ click: () => setSelected(shipment) }}
                    >
                      <Popup>
                        <strong>{shipment.tracking_code}</strong>
                        <br />
                        {shipment.origin} → {shipment.destination}
                        <br />
                        ETA {formatDate(shipment.eta_at, true)}
                      </Popup>
                    </CircleMarker>
                  ))}
              </MapContainer>
              <div className="map-legend">
                <span>
                  <i style={{ background: "#10B981" }} /> En curso
                </span>
                <span>
                  <i style={{ background: "#F59E0B" }} /> En aduana
                </span>
                <span>
                  <i style={{ background: "#EF4444" }} /> Retraso / incidencia
                </span>
              </div>
              {selected && (
                <div className="selected-shipment-card">
                  <div className="transport-symbol">
                    {selected.transport_mode === "AEREO" ? (
                      <Plane size={18} />
                    ) : selected.transport_mode === "MARITIMO" ? (
                      <Ship size={18} />
                    ) : (
                      <Truck size={18} />
                    )}
                  </div>
                  <div>
                    <span>{selected.tracking_code}</span>
                    <strong>
                      {selected.origin} → {selected.destination}
                    </strong>
                    <small>
                      {selected.driver ?? "Sin transportista"} ·{" "}
                      {selected.plate ?? "Sin vehículo"}
                    </small>
                    <small>
                      <PackageCheck size={12} /> {selected.item_count} productos ·{" "}
                      {selected.cargo_units} unidades
                      {selected.latest_event ? ` · ${selected.latest_event}` : ""}
                    </small>
                  </div>
                  <a href={`/rastreo/${selected.tracking_code}`} className="button primary">
                    Ver detalle
                  </a>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function hasPosition(shipment: MapShipment) {
  return (
    Number.isFinite(Number(shipment.current_latitude)) &&
    Number.isFinite(Number(shipment.current_longitude))
  );
}

function MapSelectionFocus({ shipment }: { shipment: MapShipment | null }) {
  const map = useMap();

  useEffect(() => {
    if (!shipment || !hasPosition(shipment)) return;
    map.flyTo(
      [Number(shipment.current_latitude), Number(shipment.current_longitude)],
      Math.max(map.getZoom(), 8),
      { animate: true, duration: 1.15 },
    );
  }, [map, shipment]);

  return null;
}
