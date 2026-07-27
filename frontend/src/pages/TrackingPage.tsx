import { ArrowRight, Boxes, CalendarClock, CheckCircle2, CircleDot, Globe2, MapPin, PackageSearch, Truck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { api, getErrorMessage } from "../api/client";
import { Alert, LoadingState, StatusBadge, formatDate } from "../components/ui";

interface TrackingData {
  shipment: {
    id: number; tracking_code: string; origin: string; destination: string; status: string;
    current_latitude: number; current_longitude: number; departure_at: string | null; eta_at: string | null;
    delivered_at: string | null; transport_mode: string; estimated_distance_km: number; customs_required: boolean;
    plate: string | null; vehicle: string | null; driver: string | null;
  };
  events: Array<{ id: number; event_type: string; status: string; description: string; latitude: number; longitude: number; evidence_url: string | null; created_at: string; user_name: string | null }>;
}

const steps = ["PREPARANDO", "EN_TRANSITO", "EN_ADUANA", "ENTREGADO"];

export function TrackingPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(code ?? "SCM-BO-2026-001");
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(Boolean(code));
  const [error, setError] = useState("");

  const load = async (trackingCode: string) => {
    setLoading(true); setError("");
    try { const response = await api.get<TrackingData>(`/transporte/rastreo/${trackingCode}`); setData(response.data); }
    catch (cause) { setError(getErrorMessage(cause)); setData(null); } finally { setLoading(false); }
  };
  useEffect(() => { if (code) void load(code); }, [code]);
  useEffect(() => {
    if (!data) return;
    const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, { auth: { rooms: [`shipment:${data.shipment.id}`] } });
    socket.on("shipment:event", () => void load(data.shipment.tracking_code));
    return () => { socket.disconnect(); };
  }, [data?.shipment.id]);

  const submit = (event: FormEvent) => { event.preventDefault(); const clean = query.trim(); if (clean) navigate(`/rastreo/${encodeURIComponent(clean)}`); };
  const activeStep = data ? Math.max(0, steps.indexOf(data.shipment.status === "INCIDENCIA" || data.shipment.status === "RETRASADO" ? "EN_TRANSITO" : data.shipment.status)) : 0;

  return <div className="tracking-page">
    <header className="tracking-header"><a href="/" className="tracking-brand"><div className="brand-mark"><Boxes size={20}/></div><div><strong>SCM Global</strong><span>Rastreo público</span></div></a><div className="public-secure"><Globe2 size={15}/> Consulta segura · Sin inicio de sesión</div></header>
    <main className="tracking-main">
      <section className="tracking-hero"><span>VISIBILIDAD DE EXTREMO A EXTREMO</span><h1>¿Dónde está su envío?</h1><p>Ingrese el código único para consultar ubicación, ETA e historial de eventos en tiempo real.</p>
        <form className="tracking-search" onSubmit={submit}><PackageSearch size={20}/><input value={query} onChange={(event) => setQuery(event.target.value.toUpperCase())} placeholder="Ej. SCM-BO-2026-001"/><button>Rastrear <ArrowRight size={16}/></button></form>
        {error && <Alert>{error}</Alert>}
      </section>
      {loading && <LoadingState label="Localizando el envío…" />}
      {data && <section className="tracking-result">
        <div className="tracking-summary card">
          <div><span>Código de tracking</span><strong>{data.shipment.tracking_code}</strong></div>
          <div><span>Estado actual</span><StatusBadge status={data.shipment.status}/></div>
          <div><span>Origen</span><strong>{data.shipment.origin}</strong></div><ArrowRight size={18}/>
          <div><span>Destino</span><strong>{data.shipment.destination}</strong></div>
          <div><span>ETA estimada</span><strong>{formatDate(data.shipment.eta_at, true)}</strong></div>
        </div>
        <div className="tracking-progress card">{steps.map((step, index) => <div key={step} className={index <= activeStep ? "complete" : ""}><span>{index < activeStep ? <CheckCircle2 size={18}/> : index === activeStep ? <Truck size={18}/> : <CircleDot size={18}/>}</span><strong>{step.replaceAll("_"," ")}</strong><small>{eventDate(data.events, step)}</small></div>)}</div>
        <div className="tracking-grid">
          <div className="map-panel tracking-map"><MapContainer center={[Number(data.shipment.current_latitude), Number(data.shipment.current_longitude)]} zoom={6} scrollWheelZoom><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><CircleMarker center={[Number(data.shipment.current_latitude), Number(data.shipment.current_longitude)]} radius={10} pathOptions={{ color: "#fff", fillColor: "#2563EB", fillOpacity: 1, weight: 4 }}><Popup>{data.shipment.tracking_code}<br/>{data.shipment.status}</Popup></CircleMarker></MapContainer>
            <div className="tracking-location"><MapPin size={15}/><div><span>Última ubicación registrada</span><strong>{Number(data.shipment.current_latitude).toFixed(4)}, {Number(data.shipment.current_longitude).toFixed(4)}</strong></div></div>
          </div>
          <aside className="card timeline-card"><div className="card-header"><div><h2>Historial del envío</h2><p>{data.events.length} eventos registrados</p></div><CalendarClock size={17}/></div><div className="timeline">{[...data.events].reverse().map((event, index) => <article key={event.id} className={index === 0 ? "current" : ""}><i/><div><span>{event.event_type.replaceAll("_"," ")}</span><strong>{event.description}</strong><small>{formatDate(event.created_at, true)} · {event.user_name ?? "Sistema"}</small>{event.evidence_url && <a href={event.evidence_url} target="_blank" rel="noreferrer">Ver evidencia</a>}</div></article>)}</div></aside>
        </div>
      </section>}
    </main>
    <footer className="tracking-footer">SCM Global · Información actualizada en tiempo real</footer>
  </div>;
}

function eventDate(events: TrackingData["events"], status: string) {
  const event = [...events].reverse().find((item) => item.status === status);
  return event ? formatDate(event.created_at, true) : "Pendiente";
}
