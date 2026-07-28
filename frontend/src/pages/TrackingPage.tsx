import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  Globe2,
  LogOut,
  MapPin,
  PackageSearch,
  Radio,
  Truck,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import { io } from "socket.io-client";
import { api, getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Alert, LoadingState, StatusBadge, formatDate } from "../components/ui";
import { useNavigate, useParams } from "../router";

interface TrackingData {
  shipment: {
    id: number;
    tracking_code: string;
    origin: string;
    destination: string;
    status: string;
    current_latitude: number;
    current_longitude: number;
    origin_latitude: number;
    origin_longitude: number;
    destination_latitude: number;
    destination_longitude: number;
    departure_at: string | null;
    eta_at: string | null;
    delivered_at: string | null;
    transport_mode: string;
    estimated_distance_km: number;
    customs_required: boolean;
    plate: string | null;
    vehicle: string | null;
    driver: string | null;
    last_position_at: string | null;
    position_state: "EN_VIVO" | "RECIENTE" | "SIN_ACTUALIZAR";
    is_delayed: boolean;
    delay_minutes: number;
    incident_count: number;
  };
  events: Array<{
    id: number;
    event_type: string;
    status: string;
    description: string;
    latitude: number;
    longitude: number;
    evidence_url: string | null;
    created_at: string;
    user_name: string | null;
  }>;
  items: Array<{ sku: string; product: string; quantity: number }>;
}

const steps = ["PREPARANDO", "EN_TRANSITO", "EN_ADUANA", "ENTREGADO"];
const examples = [
  ["SCM-BR-2026-003", "Incidencia"],
  ["SCM-AR-2026-004", "Retrasado"],
  ["SCM-BO-2026-007", "En tránsito"],
  ["SCM-BO-2026-008", "Entregado"],
] as const;

export function TrackingPage() {
  const { user, logout } = useAuth();
  const { code } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(code ?? "");
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(Boolean(code));
  const [error, setError] = useState("");

  const load = useCallback(async (trackingCode: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get<TrackingData>(
        `/transporte/rastreo/${encodeURIComponent(trackingCode)}`,
      );
      setData(response.data);
    } catch (cause) {
      setError(getErrorMessage(cause));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setQuery(code ?? "");
    if (code) void load(code);
    else setData(null);
  }, [code, load]);

  useEffect(() => {
    if (!data) return;
    const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
      auth: { rooms: [`shipment:${data.shipment.id}`] },
    });
    const refresh = () => void load(data.shipment.tracking_code);
    socket.on("shipment:event", refresh);
    socket.on("shipment:updated", refresh);
    return () => {
      socket.disconnect();
    };
  }, [data?.shipment.id, data?.shipment.tracking_code, load]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = query.trim().toUpperCase();
    if (clean.length >= 5) navigate(`/rastreo/${encodeURIComponent(clean)}`);
  };
  const chooseExample = (trackingCode: string) => {
    setQuery(trackingCode);
    navigate(`/rastreo/${trackingCode}`);
  };
  const activeStep = data
    ? Math.max(
        0,
        steps.indexOf(
          data.shipment.status === "INCIDENCIA" || data.shipment.status === "RETRASADO"
            ? "EN_TRANSITO"
            : data.shipment.status,
        ),
      )
    : 0;
  const routePath = data
    ? [
        [Number(data.shipment.origin_latitude), Number(data.shipment.origin_longitude)],
        ...data.events
          .filter((event) => event.latitude != null && event.longitude != null)
          .map((event) => [Number(event.latitude), Number(event.longitude)]),
        [
          Number(data.shipment.destination_latitude),
          Number(data.shipment.destination_longitude),
        ],
      ]
    : [];

  return (
    <div className="tracking-page">
      <header className="tracking-header">
        <a href="/" className="tracking-brand">
          <div className="brand-mark">
            <Boxes size={20} />
          </div>
          <div>
            <strong>SCM Global</strong>
            <span>Rastreo público</span>
          </div>
        </a>
        <div className="public-secure">
          <Globe2 size={15} />{" "}
          {user ? `Sesión: ${user.fullName}` : "Consulta segura · Sin inicio de sesión"}
          {user && (
            <button className="icon-button" title="Cerrar sesión" onClick={logout}>
              <LogOut size={14} />
            </button>
          )}
        </div>
      </header>
      <main className="tracking-main">
        <section className="tracking-hero">
          <span>VISIBILIDAD DE EXTREMO A EXTREMO</span>
          <h1>¿Dónde está su envío?</h1>
          <p>
            Busque por el código único para consultar ubicación, carga, ETA e historial en
            tiempo real.
          </p>
          <form className="tracking-search" onSubmit={submit}>
            <PackageSearch size={20} />
            <input
              aria-label="Código de rastreo"
              value={query}
              onChange={(event) => setQuery(event.target.value.toUpperCase())}
              placeholder="Escriba un código, por ejemplo SCM-BO-2026-007"
              autoComplete="off"
            />
            <button disabled={query.trim().length < 5}>
              Buscar <ArrowRight size={16} />
            </button>
          </form>
          <div className="tracking-examples">
            <small>Pruebe un flujo demostrativo:</small>
            {examples.map(([trackingCode, label]) => (
              <button key={trackingCode} type="button" onClick={() => chooseExample(trackingCode)}>
                <strong>{label}</strong>
                <span>{trackingCode}</span>
              </button>
            ))}
          </div>
          {error && <Alert>{error}</Alert>}
        </section>
        {loading && <LoadingState label="Localizando el envío…" />}
        {data && (
          <section className="tracking-result">
            {(data.shipment.status === "INCIDENCIA" || data.shipment.is_delayed) && (
              <div
                className={`tracking-operational-alert ${
                  data.shipment.status === "INCIDENCIA" ? "incident" : "delay"
                }`}
              >
                <AlertTriangle size={20} />
                <div>
                  <strong>
                    {data.shipment.status === "INCIDENCIA"
                      ? "Incidencia activa en la operación"
                      : "Envío con retraso"}
                  </strong>
                  <span>
                    {data.shipment.status === "INCIDENCIA"
                      ? `${data.shipment.incident_count} incidencia(s) registrada(s). El estado se conservará hasta publicar una resolución.`
                      : `Demora aproximada: ${data.shipment.delay_minutes} minutos. La ETA ya refleja la última posición.`}
                  </span>
                </div>
              </div>
            )}
            <div className="tracking-summary card">
              <div>
                <span>Código de tracking</span>
                <strong>{data.shipment.tracking_code}</strong>
              </div>
              <div>
                <span>Estado actual</span>
                <StatusBadge status={data.shipment.status} />
              </div>
              <div>
                <span>Origen</span>
                <strong>{data.shipment.origin}</strong>
              </div>
              <ArrowRight size={18} />
              <div>
                <span>Destino</span>
                <strong>{data.shipment.destination}</strong>
              </div>
              <div>
                <span>ETA estimada</span>
                <strong>{formatDate(data.shipment.eta_at, true)}</strong>
              </div>
            </div>
            <div className="tracking-progress card">
              {steps.map((step, index) => (
                <div key={step} className={index <= activeStep ? "complete" : ""}>
                  <span>
                    {index < activeStep ? (
                      <CheckCircle2 size={18} />
                    ) : index === activeStep ? (
                      <Truck size={18} />
                    ) : (
                      <CircleDot size={18} />
                    )}
                  </span>
                  <strong>{step.replaceAll("_", " ")}</strong>
                  <small>{eventDate(data.events, step)}</small>
                </div>
              ))}
            </div>
            <div className="tracking-grid">
              <div className="map-panel tracking-map">
                <MapContainer
                  center={[
                    Number(data.shipment.current_latitude),
                    Number(data.shipment.current_longitude),
                  ]}
                  zoom={5}
                  scrollWheelZoom
                >
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Polyline
                    positions={routePath as [number, number][]}
                    pathOptions={{ color: "#2563EB", weight: 3, opacity: 0.65, dashArray: "8 7" }}
                  />
                  <CircleMarker
                    center={[
                      Number(data.shipment.current_latitude),
                      Number(data.shipment.current_longitude),
                    ]}
                    radius={10}
                    pathOptions={{
                      color: "#fff",
                      fillColor:
                        data.shipment.status === "INCIDENCIA" ||
                        data.shipment.status === "RETRASADO"
                          ? "#DC2626"
                          : "#2563EB",
                      fillOpacity: 1,
                      weight: 4,
                    }}
                  >
                    <Popup>
                      {data.shipment.tracking_code}
                      <br />
                      {data.shipment.status}
                    </Popup>
                  </CircleMarker>
                </MapContainer>
                <div className="tracking-location">
                  <MapPin size={15} />
                  <div>
                    <span>Última ubicación registrada</span>
                    <strong>
                      {Number(data.shipment.current_latitude).toFixed(4)},{" "}
                      {Number(data.shipment.current_longitude).toFixed(4)}
                    </strong>
                  </div>
                  <div className={`position-state ${data.shipment.position_state.toLowerCase()}`}>
                    {data.shipment.position_state === "EN_VIVO" ? (
                      <Radio size={13} />
                    ) : (
                      <Clock3 size={13} />
                    )}
                    {data.shipment.position_state.replaceAll("_", " ")}
                  </div>
                </div>
              </div>
              <aside className="tracking-side">
                <div className="card tracking-cargo">
                  <div className="card-header">
                    <div>
                      <h2>Carga y transporte</h2>
                      <p>{data.items.length} productos vinculados</p>
                    </div>
                    <Truck size={17} />
                  </div>
                  <div className="tracking-transport-data">
                    <span>
                      <small>Vehículo</small>
                      <strong>{data.shipment.plate ?? "Pendiente de asignación"}</strong>
                    </span>
                    <span>
                      <small>Transportista</small>
                      <strong>{data.shipment.driver ?? "Pendiente de asignación"}</strong>
                    </span>
                  </div>
                  <div className="tracking-cargo-list">
                    {data.items.map((item) => (
                      <div key={item.sku}>
                        <span>
                          <strong>{item.sku}</strong>
                          <small>{item.product}</small>
                        </span>
                        <b>{item.quantity} u.</b>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card timeline-card">
                  <div className="card-header">
                    <div>
                      <h2>Historial del envío</h2>
                      <p>{data.events.length} eventos registrados</p>
                    </div>
                    <CalendarClock size={17} />
                  </div>
                  <div className="timeline">
                    {[...data.events].reverse().map((event, index) => (
                      <article key={event.id} className={index === 0 ? "current" : ""}>
                        <i />
                        <div>
                          <span>{event.event_type.replaceAll("_", " ")}</span>
                          <strong>{event.description}</strong>
                          <small>
                            {formatDate(event.created_at, true)} · {event.user_name ?? "Sistema"}
                          </small>
                          {event.evidence_url && (
                            <a href={event.evidence_url} target="_blank" rel="noreferrer">
                              Ver evidencia
                            </a>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </section>
        )}
      </main>
      <footer className="tracking-footer">
        SCM Global · Información actualizada en tiempo real
      </footer>
    </div>
  );
}

function eventDate(events: TrackingData["events"], status: string) {
  const event = [...events].reverse().find((item) => item.status === status);
  return event ? formatDate(event.created_at, true) : "Pendiente";
}
