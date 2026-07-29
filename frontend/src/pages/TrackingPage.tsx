import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  Globe2,
  LogOut,
  MapPin,
  Moon,
  PackageSearch,
  Radio,
  Sun,
  Truck,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import { io } from "socket.io-client";
import { api, getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Alert, LoadingState, StatusBadge, formatDate } from "../components/ui";
import { useNavigate, useParams } from "../router";
import { useTheme } from "../theme";

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
    latest_incident_type: string | null;
    latest_incident_description: string | null;
  };
  events: Array<{
    id: number;
    event_type: string;
    status: string;
    description: string;
    incident_type: string | null;
    latitude: number;
    longitude: number;
    evidence_url: string | null;
    created_at: string;
    user_name: string | null;
  }>;
  items: Array<{ sku: string; product: string; quantity: number }>;
}

interface TrackingSuggestion {
  tracking_code: string;
  origin: string;
  destination: string;
  status: string;
  eta_at: string | null;
}

const steps = [
  "PREPARANDO",
  "ASIGNADO",
  "EN_TRANSITO",
  "PENDIENTE_RECEPCION",
  "ENTREGADO",
];
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
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState(code ?? "");
  const [suggestions, setSuggestions] = useState<TrackingSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
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
    setSuggestions([]);
    setShowAllEvents(false);
    if (code) void load(code);
    else setData(null);
  }, [code, load]);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2 || clean === code) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setSuggestionsLoading(true);
      void api
        .get<TrackingSuggestion[]>("/transporte/rastreo", { params: { q: clean, limit: 6 } })
        .then(({ data: matches }) => {
          if (active) setSuggestions(matches);
        })
        .catch(() => {
          if (active) setSuggestions([]);
        })
        .finally(() => {
          if (active) setSuggestionsLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, code]);

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
    setSuggestions([]);
    navigate(`/rastreo/${trackingCode}`);
  };
  const activeStep = data
    ? Math.max(
        0,
        steps.indexOf(
          ["INCIDENCIA", "RETRASADO", "EN_ADUANA"].includes(data.shipment.status)
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
  const locationEvents = data?.events.filter((event) => event.event_type === "UBICACION") ?? [];
  const operationalEvents = data?.events.filter((event) => event.event_type !== "UBICACION") ?? [];
  const compactEvents = [
    ...operationalEvents,
    ...(locationEvents.length ? [locationEvents[locationEvents.length - 1]!] : []),
  ].sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
  const visibleEvents = showAllEvents ? data?.events ?? [] : compactEvents;
  const hiddenLocationEvents = Math.max(0, locationEvents.length - 1);

  return (
    <div className="tracking-page">
      <header className="tracking-header">
        <div className="tracking-header-left">
          <button
            className="tracking-back"
            onClick={() => (data ? navigate("/rastreo") : user ? navigate("/") : window.history.back())}
          >
            <ArrowLeft size={16} /> {data ? "Volver a buscar" : "Volver"}
          </button>
          <a href="/" className="tracking-brand">
            <div className="brand-mark"><Boxes size={20} /></div>
            <div><strong>SCM Global</strong><span>Rastreo público</span></div>
          </a>
        </div>
        <div className="public-secure">
          <button className="icon-button" title={theme === "dark" ? "Tema claro" : "Tema oscuro"} onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={14}/> : <Moon size={14}/>}
          </button>
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
          <div className="tracking-search-wrap">
            <form className="tracking-search" onSubmit={submit}>
              <PackageSearch size={20} />
              <input
                aria-label="Código de rastreo"
                value={query}
                onChange={(event) => setQuery(event.target.value.toUpperCase())}
                placeholder="Código, origen o destino…"
                autoComplete="off"
              />
              <button disabled={query.trim().length < 5}>
                Buscar <ArrowRight size={16} />
              </button>
            </form>
            {(suggestionsLoading || suggestions.length > 0) && (
              <div className="tracking-suggestions">
                {suggestionsLoading && <span>Buscando coincidencias…</span>}
                {!suggestionsLoading && suggestions.map((suggestion) => (
                  <button key={suggestion.tracking_code} type="button" onClick={() => chooseExample(suggestion.tracking_code)}>
                    <PackageSearch size={15}/>
                    <span><strong>{suggestion.tracking_code}</strong><small>{suggestion.origin} → {suggestion.destination}</small></span>
                    <StatusBadge status={suggestion.status}/>
                  </button>
                ))}
              </div>
            )}
          </div>
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
                      ? `${incidentLabel(data.shipment.latest_incident_type)} · ${data.shipment.latest_incident_description ?? `${data.shipment.incident_count} incidencia(s) registrada(s).`}`
                      : `Demora aproximada: ${formatDelay(data.shipment.delay_minutes)}. La ETA ya refleja la última posición.`}
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
                  <strong>{step === "PENDIENTE_RECEPCION" ? "RECEPCIÓN" : step.replaceAll("_", " ")}</strong>
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
                    {[...visibleEvents].reverse().map((event, index) => (
                      <article key={event.id} className={index === 0 ? "current" : ""}>
                        <i />
                        <div>
                          <span>{event.event_type.replaceAll("_", " ")}{event.incident_type ? ` · ${incidentLabel(event.incident_type)}` : ""}</span>
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
                  {hiddenLocationEvents > 0 && (
                    <button className="timeline-toggle" type="button" onClick={() => setShowAllEvents((current) => !current)}>
                      {showAllEvents
                        ? "Ocultar actualizaciones repetitivas"
                        : `Ver ${hiddenLocationEvents} actualizaciones de ubicación`}
                    </button>
                  )}
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

function incidentLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    MECANICA: "Falla mecánica",
    CLIMATICA: "Condición climática",
    ADUANA: "Control aduanero",
    TRAFICO: "Tráfico o bloqueo",
    SEGURIDAD: "Seguridad",
    DOCUMENTACION: "Documentación",
    OTRA: "Otra incidencia",
  };
  return value ? labels[value] ?? value.replaceAll("_", " ") : "Incidencia operativa";
}

function formatDelay(minutes: number) {
  if (minutes < 1) return "menos de 1 minuto";
  return `${minutes} minuto${minutes === 1 ? "" : "s"}`;
}
