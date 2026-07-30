import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Circle,
  Clock3,
  FileCheck2,
  Gauge,
  Globe2,
  Maximize2,
  PackageCheck,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Truck,
  UserRoundCheck,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, getErrorMessage } from "../api/client";
import { Alert, LoadingState, PageHeader } from "../components/ui";

type DemoRole =
  | "ADMIN"
  | "PURCHASE_MANAGER"
  | "SUPPLIER"
  | "LOGISTICS_MANAGER"
  | "DRIVER"
  | "INVENTORY_MANAGER"
  | "MANAGER"
  | "AUDITOR"
  | "CLIENT";
type StepState = "pending" | "running" | "done" | "error";
type RunState = "idle" | "running" | "paused" | "completed" | "stopped" | "error";

interface DemoEnvironment {
  enabled: boolean;
  isolated: boolean;
  mode: string;
  message: string;
}

interface DemoUser {
  id: number;
  email: string;
  fullName: string;
  role: DemoRole;
}

interface DemoSession {
  token: string;
  user: DemoUser;
}

interface DemoSessionResponse {
  isolated: boolean;
  issuedAt: string;
  sessions: Record<DemoRole, DemoSession>;
}

interface DemoStepDefinition {
  id: string;
  role: DemoRole;
  module: string;
  title: string;
}

interface DemoStepView extends DemoStepDefinition {
  state: StepState;
  detail?: string;
  completedAt?: string;
}

interface DemoArtifacts {
  users?: number;
  supplier?: string;
  product?: string;
  orderId?: number;
  orderCode?: string;
  orderStatus?: string;
  routeId?: number;
  routeName?: string;
  shipmentId?: number;
  trackingCode?: string;
  shipmentStatus?: string;
  vehicle?: string;
  driver?: string;
  latitude?: number;
  longitude?: number;
  stockBefore?: number;
  stockAfter?: number;
  reportPdfBytes?: number;
  reportXlsxBytes?: number;
  auditEvents?: number;
  trackingEvents?: number;
}

interface DemoLog {
  id: string;
  role: DemoRole;
  title: string;
  detail: string;
  time: string;
}

interface DemoRuntime {
  sessions: Record<DemoRole, DemoSession>;
  artifacts: DemoArtifacts;
  supplier?: Supplier;
  product?: CatalogProduct;
  order?: PurchaseOrder;
  route?: RouteRecord;
  shipment?: ShipmentRecord;
}

interface Supplier {
  id: number;
  code: string;
  commercial_name: string;
}

interface CatalogProduct {
  id: number;
  sku: string;
  name: string;
}

interface PurchaseOrder {
  id: number;
  code: string;
  status: string;
}

interface RouteRecord {
  id: number;
  name: string;
  origin_name: string;
  origin_country: string;
  origin_latitude: number | string;
  origin_longitude: number | string;
  destination_name: string;
  destination_country: string;
  destination_latitude: number | string;
  destination_longitude: number | string;
  destination_warehouse_id: number;
  transport_mode: "TERRESTRE" | "MARITIMO" | "AEREO";
  purpose: "ENTRADA_COMPRA" | "SALIDA_DISTRIBUCION" | "AMBOS";
}

interface ShipmentRecord {
  id: number;
  tracking_code: string;
  status: string;
}

interface StockRow {
  product_id: number;
  warehouses?: Array<{
    warehouse_id: number;
    current: number;
    reserved: number;
    available: number;
  }>;
}

const roleLabels: Record<DemoRole, string> = {
  ADMIN: "Administrador",
  PURCHASE_MANAGER: "Responsable de Compras",
  SUPPLIER: "Proveedor",
  LOGISTICS_MANAGER: "Responsable de Logística",
  DRIVER: "Transportista",
  INVENTORY_MANAGER: "Responsable de Inventario",
  MANAGER: "Gerencia",
  AUDITOR: "Auditoría",
  CLIENT: "Cliente",
};

const stepDefinitions: DemoStepDefinition[] = [
  { id: "users", role: "ADMIN", module: "Seguridad", title: "Validar cuentas, roles y permisos" },
  { id: "catalog", role: "PURCHASE_MANAGER", module: "Abastecimiento", title: "Consultar proveedor y catálogo permitido" },
  { id: "order", role: "PURCHASE_MANAGER", module: "Órdenes", title: "Crear una orden de compra real" },
  { id: "approve", role: "PURCHASE_MANAGER", module: "Órdenes", title: "Aprobar la orden y notificar al proveedor" },
  { id: "supplier", role: "SUPPLIER", module: "Portal del proveedor", title: "Confirmar fecha y documento comercial" },
  { id: "route", role: "LOGISTICS_MANAGER", module: "Rutas", title: "Crear una ruta correlacionada" },
  { id: "shipment", role: "LOGISTICS_MANAGER", module: "Envíos", title: "Preparar el transporte de entrada" },
  { id: "assignment", role: "LOGISTICS_MANAGER", module: "Flota", title: "Asignar vehículo y transportista compatibles" },
  { id: "accept", role: "DRIVER", module: "Transporte", title: "Aceptar la carga e iniciar el viaje" },
  { id: "position", role: "DRIVER", module: "Rastreo", title: "Transmitir una posición en vivo" },
  { id: "delay", role: "DRIVER", module: "Rastreo", title: "Registrar un retraso operativo" },
  { id: "incident", role: "DRIVER", module: "Incidencias", title: "Reportar una incidencia de tráfico" },
  { id: "resolution", role: "DRIVER", module: "Incidencias", title: "Resolver la incidencia y continuar" },
  { id: "arrival", role: "DRIVER", module: "Transporte", title: "Registrar el arribo al almacén" },
  { id: "reception", role: "INVENTORY_MANAGER", module: "Inventario", title: "Confirmar recepción y aumentar existencias" },
  { id: "management", role: "MANAGER", module: "Reportes", title: "Consultar indicadores y generar PDF/Excel" },
  { id: "audit", role: "AUDITOR", module: "Auditoría", title: "Comprobar la trazabilidad de responsables" },
  { id: "client", role: "CLIENT", module: "Rastreo público", title: "Consultar la entrega por código" },
];

export function PresentationDemoPage() {
  const [environment, setEnvironment] = useState<DemoEnvironment | null>(null);
  const [environmentError, setEnvironmentError] = useState("");
  const [steps, setSteps] = useState<DemoStepView[]>(initialSteps);
  const [runState, setRunState] = useState<RunState>("idle");
  const [currentStep, setCurrentStep] = useState(-1);
  const [artifacts, setArtifacts] = useState<DemoArtifacts>({});
  const [logs, setLogs] = useState<DemoLog[]>([]);
  const [error, setError] = useState("");
  const [speed, setSpeed] = useState(1200);
  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    void api
      .get<DemoEnvironment>("/demo/estado")
      .then(({ data }) => setEnvironment(data))
      .catch((requestError) => setEnvironmentError(getErrorMessage(requestError)));
    return () => abortRef.current?.abort();
  }, []);

  const completedSteps = useMemo(
    () => steps.filter((step) => step.state === "done").length,
    [steps],
  );
  const active = currentStep >= 0 ? steps[currentStep] : undefined;

  const start = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    pausedRef.current = false;
    setRunState("running");
    setSteps(initialSteps());
    setCurrentStep(-1);
    setArtifacts({});
    setLogs([]);
    setError("");

    let activeIndex = -1;
    try {
      const { data } = await api.post<DemoSessionResponse>(
        "/demo/sesiones",
        {},
        { signal: controller.signal },
      );
      const runtime: DemoRuntime = { sessions: data.sessions, artifacts: {} };
      const actions = buildActions(runtime, controller.signal);

      for (let index = 0; index < actions.length; index += 1) {
        await waitWhilePaused(controller.signal, () => pausedRef.current);
        activeIndex = index;
        setCurrentStep(index);
        updateStep(index, { state: "running" });
        const detail = await actions[index]!();
        const completedAt = new Date().toISOString();
        updateStep(index, { state: "done", detail, completedAt });
        setArtifacts({ ...runtime.artifacts });
        setLogs((current) => [
          {
            id: `${stepDefinitions[index]!.id}-${completedAt}`,
            role: stepDefinitions[index]!.role,
            title: stepDefinitions[index]!.title,
            detail,
            time: completedAt,
          },
          ...current,
        ]);
        await abortableDelay(speed, controller.signal);
      }

      setCurrentStep(stepDefinitions.length - 1);
      setRunState("completed");
    } catch (runError) {
      if (isAbortError(runError)) {
        setRunState("stopped");
        return;
      }
      setRunState("error");
      setError(getErrorMessage(runError));
      if (activeIndex >= 0) updateStep(activeIndex, { state: "error" });
    }
  };

  const togglePause = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setRunState(next ? "paused" : "running");
  };

  const stop = () => {
    abortRef.current?.abort();
    pausedRef.current = false;
    setRunState("stopped");
  };

  const updateStep = (index: number, patch: Partial<DemoStepView>) => {
    setSteps((current) =>
      current.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step)),
    );
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // El navegador puede bloquear pantalla completa si no existe una interacción válida.
    }
  };

  if (environmentError) return <Alert>{environmentError}</Alert>;
  if (!environment) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="Demo operativa en vivo"
        subtitle="Un flujo real ejecutado automáticamente por los nueve roles"
        actions={
          <button className="button" onClick={() => void toggleFullscreen()}>
            <Maximize2 size={15} /> Pantalla completa
          </button>
        }
      />

      {!environment.enabled ? (
        <section className="live-demo-disabled">
          <div className="live-demo-disabled-icon"><ShieldCheck size={32} /></div>
          <div>
            <span>AUTOMATIZACIÓN BLOQUEADA AQUÍ</span>
            <h2>La base operativa está protegida</h2>
            <p>
              La demo con escritura no se ejecuta sobre los datos normales. Inicie el entorno
              aislado y abra <strong>http://localhost:8081</strong>.
            </p>
            <code>powershell -ExecutionPolicy Bypass -File .\iniciar-demo-en-vivo.ps1 -Reiniciar</code>
          </div>
        </section>
      ) : (
        <>
          <section className="live-demo-safety">
            <div><ShieldCheck size={20} /><strong>Entorno aislado confirmado</strong></div>
            <span>Base demo independiente · operaciones reales · reiniciable</span>
          </section>

          <section className="live-demo-toolbar">
            <div>
              {runState === "idle" || ["completed", "stopped", "error"].includes(runState) ? (
                <button className="button primary" onClick={() => void start()}>
                  {runState === "idle" ? <Play size={16} /> : <RotateCcw size={16} />}
                  {runState === "idle" ? "Iniciar flujo completo" : "Ejecutar otro recorrido"}
                </button>
              ) : (
                <>
                  <button className="button primary" onClick={togglePause}>
                    {runState === "paused" ? <Play size={16} /> : <Pause size={16} />}
                    {runState === "paused" ? "Continuar" : "Pausar"}
                  </button>
                  <button className="button" onClick={stop}><Square size={14} /> Detener</button>
                </>
              )}
            </div>
            <label>
              Ritmo
              <select
                value={speed}
                disabled={runState === "running" || runState === "paused"}
                onChange={(event) => setSpeed(Number(event.target.value))}
              >
                <option value={650}>Rápido</option>
                <option value={1200}>Presentación</option>
                <option value={2200}>Detallado</option>
              </select>
            </label>
            <div className={`live-demo-state state-${runState}`}>
              <Activity size={15} />
              {runStateLabel(runState)}
            </div>
          </section>

          {error && <div className="alert error"><AlertTriangle size={18} />{error}</div>}

          <section className="live-demo-progress">
            <div>
              <strong>{completedSteps} de {steps.length} operaciones completadas</strong>
              <span>{Math.round((completedSteps / steps.length) * 100)}%</span>
            </div>
            <div className="live-demo-progress-bar">
              <span style={{ width: `${(completedSteps / steps.length) * 100}%` }} />
            </div>
          </section>

          <div className="live-demo-grid">
            <section className="live-demo-steps">
              <header><Zap size={17} /><strong>Flujo automático real</strong></header>
              <div>
                {steps.map((step, index) => (
                  <article
                    key={step.id}
                    className={`live-demo-step ${step.state} ${index === currentStep ? "active" : ""}`}
                  >
                    <StepIcon state={step.state} />
                    <div>
                      <span>{roleLabels[step.role]} · {step.module}</span>
                      <strong>{step.title}</strong>
                      {step.detail && <small>{step.detail}</small>}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <aside className="live-demo-monitor">
              <section className="live-demo-actor">
                <span>ROL ACTIVO</span>
                <div><UserRoundCheck size={24} /></div>
                <h3>{active ? roleLabels[active.role] : "Esperando inicio"}</h3>
                <p>{active?.title ?? "Presione “Iniciar flujo completo” para comenzar."}</p>
              </section>

              <section className="live-demo-artifacts">
                <h3>Objetos creados</h3>
                <Artifact icon={<PackageCheck size={17} />} label="Orden" value={artifacts.orderCode} status={artifacts.orderStatus} />
                <Artifact icon={<Truck size={17} />} label="Envío" value={artifacts.trackingCode} status={artifacts.shipmentStatus} />
                <Artifact icon={<Globe2 size={17} />} label="Ruta" value={artifacts.routeName} />
                <Artifact icon={<Gauge size={17} />} label="Recurso" value={artifacts.vehicle} status={artifacts.driver} />
              </section>

              <section className="live-demo-stock">
                <div><Boxes size={19} /><strong>Inventario destino</strong></div>
                <div>
                  <span><small>Antes</small><strong>{artifacts.stockBefore ?? "—"}</strong></span>
                  <span>→</span>
                  <span><small>Después</small><strong>{artifacts.stockAfter ?? "—"}</strong></span>
                </div>
              </section>

              {artifacts.latitude != null && artifacts.longitude != null && (
                <section className="live-demo-position">
                  <span className="pulse-dot" />
                  <div><small>POSICIÓN TRANSMITIDA</small><strong>{artifacts.latitude.toFixed(4)}, {artifacts.longitude.toFixed(4)}</strong></div>
                </section>
              )}
            </aside>
          </div>

          <section className="live-demo-log">
            <header>
              <div><FileCheck2 size={18} /><strong>Bitácora de la ejecución</strong></div>
              <span>{logs.length} acciones verificadas</span>
            </header>
            {logs.length ? (
              <div>
                {logs.map((entry) => (
                  <article key={entry.id}>
                    <CheckCircle2 size={17} />
                    <div><span>{roleLabels[entry.role]} · {formatTime(entry.time)}</span><strong>{entry.title}</strong><small>{entry.detail}</small></div>
                  </article>
                ))}
              </div>
            ) : (
              <p>Aquí aparecerá cada respuesta confirmada por el backend.</p>
            )}
          </section>

          {runState === "completed" && artifacts.trackingCode && (
            <section className="live-demo-complete">
              <CheckCircle2 size={28} />
              <div>
                <span>FLUJO COMPLETADO SIN SALTAR ETAPAS</span>
                <h2>La compra ya ingresó al inventario y conserva trazabilidad pública</h2>
              </div>
              <a className="button primary" href={`/rastreo/${artifacts.trackingCode}`}>
                Abrir rastreo real
              </a>
              <a className="button" href="/ordenes">Ver orden creada</a>
            </section>
          )}
        </>
      )}
    </>
  );
}

function initialSteps(): DemoStepView[] {
  return stepDefinitions.map((step) => ({ ...step, state: "pending" }));
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") return <CheckCircle2 className="step-done" size={20} />;
  if (state === "running") return <Clock3 className="step-running" size={20} />;
  if (state === "error") return <XCircle className="step-error" size={20} />;
  return <Circle className="step-pending" size={20} />;
}

function Artifact({
  icon,
  label,
  value,
  status,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  status?: string;
}) {
  return (
    <div>
      {icon}
      <span><small>{label}</small><strong>{value ?? "Pendiente"}</strong>{status && <em>{status}</em>}</span>
    </div>
  );
}

function buildActions(runtime: DemoRuntime, signal: AbortSignal): Array<() => Promise<string>> {
  const session = (role: DemoRole) => runtime.sessions[role];
  const publish = (patch: Partial<DemoArtifacts>) => Object.assign(runtime.artifacts, patch);
  const today = new Date().toISOString().slice(0, 10);
  const delivery = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  return [
    async () => {
      const users = await demoRequest<Array<{ role: string }>>(
        "/seguridad/usuarios",
        session("ADMIN").token,
        { signal },
      );
      publish({ users: users.length });
      return `${users.length} cuentas activas revisadas; los nueve roles están disponibles.`;
    },
    async () => {
      const suppliers = await demoRequest<Supplier[]>(
        "/proveedores?active=true",
        session("PURCHASE_MANAGER").token,
        { signal },
      );
      const supplier = suppliers.find((item) => item.code === "PRV-0001");
      if (!supplier) throw new Error("No se encontró el proveedor PRV-0001");
      const catalog = await demoRequest<{ products: CatalogProduct[] }>(
        `/proveedores/${supplier.id}/catalogo`,
        session("PURCHASE_MANAGER").token,
        { signal },
      );
      const product = catalog.products[0];
      if (!product) throw new Error("El proveedor no tiene productos activos en su catálogo");
      runtime.supplier = supplier;
      runtime.product = product;
      publish({ supplier: supplier.commercial_name, product: `${product.sku} · ${product.name}` });
      return `${supplier.commercial_name}: ${catalog.products.length} productos permitidos; se eligió ${product.sku}.`;
    },
    async () => {
      const order = await demoRequest<PurchaseOrder>(
        "/inventarios/ordenes-compra",
        session("PURCHASE_MANAGER").token,
        {
          method: "POST",
          signal,
          body: {
            supplier_id: runtime.supplier!.id,
            expected_delivery_date: delivery,
            notes: `Demo operativa en vivo ${Date.now().toString(36).toUpperCase()}`,
            items: [{ product_id: runtime.product!.id, quantity: 5 }],
          },
        },
      );
      runtime.order = order;
      publish({ orderId: order.id, orderCode: order.code, orderStatus: order.status });
      return `${order.code} creada en BORRADOR con 5 unidades de ${runtime.product!.sku}.`;
    },
    async () => {
      const order = await demoRequest<PurchaseOrder>(
        `/inventarios/ordenes-compra/${runtime.order!.id}/aprobar`,
        session("PURCHASE_MANAGER").token,
        { method: "POST", signal },
      );
      runtime.order = order;
      publish({ orderStatus: order.status });
      return `${order.code} pasó a APROBADA; el proveedor recibió su notificación.`;
    },
    async () => {
      const portalOrders = await demoRequest<PurchaseOrder[]>(
        "/proveedores/portal/ordenes",
        session("SUPPLIER").token,
        { signal },
      );
      if (!portalOrders.some((order) => Number(order.id) === Number(runtime.order!.id))) {
        throw new Error("La orden no apareció en el portal del proveedor correcto");
      }
      const order = await demoRequest<PurchaseOrder>(
        `/proveedores/portal/ordenes/${runtime.order!.id}`,
        session("SUPPLIER").token,
        {
          method: "PATCH",
          signal,
          body: {
            expected_delivery_date: delivery,
            document_url: "https://example.com/demo/factura-proveedor.pdf",
          },
        },
      );
      runtime.order = order;
      publish({ orderStatus: order.status });
      return `${order.code} confirmada por ${runtime.supplier!.commercial_name} con documento comercial.`;
    },
    async () => {
      const routes = await demoRequest<RouteRecord[]>(
        "/logistica/rutas",
        session("LOGISTICS_MANAGER").token,
        { signal },
      );
      const supplierName = runtime.supplier!.commercial_name.toLocaleLowerCase();
      const candidates = routes.filter(
        (route) =>
          route.destination_warehouse_id &&
          route.transport_mode === "TERRESTRE" &&
          ["ENTRADA_COMPRA", "AMBOS"].includes(route.purpose),
      );
      const template =
        candidates.find((route) =>
          supplierName
            .split(/\s+/)
            .slice(0, 2)
            .every((word) => route.origin_name.toLocaleLowerCase().includes(word)),
        ) ?? candidates[0];
      if (!template) throw new Error("No existe una ruta terrestre de entrada correlacionada");
      const route = await demoRequest<RouteRecord>(
        "/logistica/rutas",
        session("LOGISTICS_MANAGER").token,
        {
          method: "POST",
          signal,
          body: {
            name: `Ruta demo ${runtime.order!.code}`,
            origin: {
              name: template.origin_name,
              country: template.origin_country,
              lat: Number(template.origin_latitude),
              lng: Number(template.origin_longitude),
            },
            destination: {
              name: template.destination_name,
              country: template.destination_country,
              lat: Number(template.destination_latitude),
              lng: Number(template.destination_longitude),
            },
            stops: [],
            transport_mode: template.transport_mode,
            purpose: "ENTRADA_COMPRA",
            is_template: false,
          },
        },
      );
      runtime.route = route;
      const beforeRows = await demoRequest<StockRow[]>(
        `/inventarios/stock?warehouseId=${route.destination_warehouse_id}`,
        session("INVENTORY_MANAGER").token,
        { signal },
      );
      publish({
        routeId: route.id,
        routeName: route.name,
        stockBefore: stockFor(beforeRows, runtime.product!.id, route.destination_warehouse_id),
      });
      return `${route.name} creada: ${route.origin_name} → ${route.destination_name} (${route.transport_mode}).`;
    },
    async () => {
      const shipment = await demoRequest<ShipmentRecord>(
        "/logistica/envios",
        session("LOGISTICS_MANAGER").token,
        {
          method: "POST",
          signal,
          body: {
            route_id: runtime.route!.id,
            purchase_order_id: runtime.order!.id,
            destination_warehouse_id: runtime.route!.destination_warehouse_id,
            total_weight_kg: 240,
            total_volume_m3: 2.4,
            items: [],
          },
        },
      );
      runtime.shipment = shipment;
      publish({
        shipmentId: shipment.id,
        trackingCode: shipment.tracking_code,
        shipmentStatus: shipment.status,
      });
      return `${shipment.tracking_code} creado en PREPARANDO y vinculado a ${runtime.order!.code}.`;
    },
    async () => {
      const [vehicles, drivers] = await Promise.all([
        demoRequest<Array<{
          id: number;
          plate: string;
          available: boolean;
          active: boolean;
          transport_mode: string;
          capacity_kg: number;
          capacity_m3: number;
        }>>("/transporte/vehiculos", session("LOGISTICS_MANAGER").token, { signal }),
        demoRequest<Array<{
          id: number;
          full_name: string;
          available: boolean;
          license_valid: boolean;
        }>>("/transporte/transportistas", session("LOGISTICS_MANAGER").token, { signal }),
      ]);
      const vehicle = vehicles.find(
        (item) =>
          item.available &&
          item.active &&
          item.transport_mode === runtime.route!.transport_mode &&
          Number(item.capacity_kg) >= 240 &&
          Number(item.capacity_m3) >= 2.4,
      );
      const driver = drivers.find(
        (item) =>
          Number(item.id) === Number(session("DRIVER").user.id) &&
          item.available &&
          item.license_valid,
      );
      if (!vehicle || !driver) throw new Error("No existe un vehículo o transportista compatible y libre");
      const shipment = await demoRequest<ShipmentRecord>(
        `/transporte/envios/${runtime.shipment!.id}/asignar`,
        session("LOGISTICS_MANAGER").token,
        {
          method: "PATCH",
          signal,
          body: { vehicle_id: vehicle.id, driver_id: driver.id },
        },
      );
      runtime.shipment = shipment;
      publish({ vehicle: vehicle.plate, driver: driver.full_name, shipmentStatus: shipment.status });
      return `${vehicle.plate} y ${driver.full_name} asignados; la carga sigue esperando aceptación.`;
    },
    async () => {
      const shipment = await demoRequest<ShipmentRecord>(
        `/transporte/envios/${runtime.shipment!.id}/aceptar`,
        session("DRIVER").token,
        { method: "POST", signal },
      );
      runtime.shipment = shipment;
      publish({ shipmentStatus: shipment.status, orderStatus: "ENVIADA" });
      return `${session("DRIVER").user.fullName} aceptó la carga; el envío pasó a EN_TRANSITO.`;
    },
    async () => {
      const latitude =
        (Number(runtime.route!.origin_latitude) + Number(runtime.route!.destination_latitude)) / 2;
      const longitude =
        (Number(runtime.route!.origin_longitude) + Number(runtime.route!.destination_longitude)) / 2;
      const result = await demoRequest<{ shipment: ShipmentRecord }>(
        `/transporte/envios/${runtime.shipment!.id}/eventos`,
        session("DRIVER").token,
        {
          method: "POST",
          signal,
          body: {
            event_type: "UBICACION",
            description: "Posición GPS transmitida durante la demostración operativa",
            latitude,
            longitude,
          },
        },
      );
      runtime.shipment = result.shipment;
      publish({ latitude, longitude, shipmentStatus: result.shipment.status });
      return `GPS actualizado en ${latitude.toFixed(4)}, ${longitude.toFixed(4)}; visible en el mapa global.`;
    },
    async () => {
      const result = await demoRequest<{ shipment: ShipmentRecord }>(
        `/transporte/envios/${runtime.shipment!.id}/eventos`,
        session("DRIVER").token,
        {
          method: "POST",
          signal,
          body: {
            event_type: "RETRASO",
            description: "Demora preventiva por congestión en el corredor internacional",
            delay_minutes: 25,
            latitude: runtime.artifacts.latitude,
            longitude: runtime.artifacts.longitude,
          },
        },
      );
      runtime.shipment = result.shipment;
      publish({ shipmentStatus: result.shipment.status });
      return "Retraso de 25 minutos registrado; ETA y alertas fueron recalculadas.";
    },
    async () => {
      const result = await demoRequest<{ shipment: ShipmentRecord }>(
        `/transporte/envios/${runtime.shipment!.id}/eventos`,
        session("DRIVER").token,
        {
          method: "POST",
          signal,
          body: {
            event_type: "INCIDENCIA",
            incident_type: "TRAFICO",
            description: "Bloqueo parcial de vía reportado con la carga protegida",
            latitude: runtime.artifacts.latitude,
            longitude: runtime.artifacts.longitude,
            evidence_url: "https://example.com/demo/evidencia-incidencia.jpg",
          },
        },
      );
      runtime.shipment = result.shipment;
      publish({ shipmentStatus: result.shipment.status });
      return "Incidencia TRAFICO registrada con descripción, evidencia y posición.";
    },
    async () => {
      const result = await demoRequest<{ shipment: ShipmentRecord }>(
        `/transporte/envios/${runtime.shipment!.id}/eventos`,
        session("DRIVER").token,
        {
          method: "POST",
          signal,
          body: {
            event_type: "RESOLUCION",
            description: "Vía liberada; el vehículo retoma el recorrido normal",
            latitude: runtime.artifacts.latitude,
            longitude: runtime.artifacts.longitude,
          },
        },
      );
      runtime.shipment = result.shipment;
      publish({ shipmentStatus: result.shipment.status });
      return "Incidencia resuelta; el transporte volvió a EN_TRANSITO.";
    },
    async () => {
      const result = await demoRequest<{ shipment: ShipmentRecord }>(
        `/transporte/envios/${runtime.shipment!.id}/eventos`,
        session("DRIVER").token,
        {
          method: "POST",
          signal,
          body: {
            event_type: "ARRIBO",
            description: "Carga arribó al almacén y espera revisión física",
            latitude: Number(runtime.route!.destination_latitude),
            longitude: Number(runtime.route!.destination_longitude),
            evidence_url: "https://example.com/demo/arribo-almacen.jpg",
          },
        },
      );
      runtime.shipment = result.shipment;
      publish({
        shipmentStatus: result.shipment.status,
        latitude: Number(runtime.route!.destination_latitude),
        longitude: Number(runtime.route!.destination_longitude),
      });
      return "Arribo confirmado; la carga quedó PENDIENTE_RECEPCION sin aumentar stock todavía.";
    },
    async () => {
      await demoRequest(
        `/inventarios/ordenes-compra/${runtime.order!.id}/recibir`,
        session("INVENTORY_MANAGER").token,
        {
          method: "POST",
          signal,
          body: { warehouse_id: runtime.route!.destination_warehouse_id },
        },
      );
      const rows = await demoRequest<StockRow[]>(
        `/inventarios/stock?warehouseId=${runtime.route!.destination_warehouse_id}`,
        session("INVENTORY_MANAGER").token,
        { signal },
      );
      const after = stockFor(rows, runtime.product!.id, runtime.route!.destination_warehouse_id);
      publish({ stockAfter: after, orderStatus: "RECIBIDA", shipmentStatus: "ENTREGADO" });
      return `Recepción física confirmada: stock ${runtime.artifacts.stockBefore} → ${after}; orden RECIBIDA.`;
    },
    async () => {
      const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const query = `from=${from}&to=${today}`;
      const [dashboard, pdfBytes, xlsxBytes] = await Promise.all([
        demoRequest<{ kpis: { pendingOrders: number; activeShipments: number } }>(
          `/reportes/dashboard?${query}`,
          session("MANAGER").token,
          { signal },
        ),
        demoFile(`/reportes/exportar?format=pdf&${query}`, session("MANAGER").token, signal),
        demoFile(`/reportes/exportar?format=xlsx&${query}`, session("MANAGER").token, signal),
      ]);
      publish({ reportPdfBytes: pdfBytes, reportXlsxBytes: xlsxBytes });
      return `Dashboard consultado; PDF (${formatBytes(pdfBytes)}) y Excel (${formatBytes(xlsxBytes)}) generados correctamente.`;
    },
    async () => {
      const events = await demoRequest<Array<{ entity_type: string; entity_id: number }>>(
        "/reportes/auditoria?limit=100",
        session("AUDITOR").token,
        { signal },
      );
      const related = events.filter(
        (event) =>
          (event.entity_type === "purchase_order" &&
            Number(event.entity_id) === Number(runtime.order!.id)) ||
          (event.entity_type === "shipment" &&
            Number(event.entity_id) === Number(runtime.shipment!.id)),
      );
      if (!related.length) throw new Error("La auditoría no encontró las acciones del escenario");
      publish({ auditEvents: related.length });
      return `${related.length} acciones correlacionadas identificadas con usuario, entidad y fecha.`;
    },
    async () => {
      const tracking = await demoRequest<{
        shipment: ShipmentRecord;
        events: Array<{ event_type: string }>;
      }>(
        `/transporte/rastreo/${encodeURIComponent(runtime.shipment!.tracking_code)}`,
        undefined,
        { signal },
      );
      if (tracking.shipment.status !== "ENTREGADO") {
        throw new Error(`El rastreo público terminó en ${tracking.shipment.status}`);
      }
      publish({ trackingEvents: tracking.events.length, shipmentStatus: tracking.shipment.status });
      return `El cliente consultó ${tracking.events.length} eventos; estado público final ENTREGADO.`;
    },
  ];
}

async function demoRequest<T = unknown>(
  path: string,
  token?: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    method: options.method ?? "GET",
    signal: options.signal,
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T & { message?: string }) : ({} as T);
  if (!response.ok) {
    throw new Error((body as { message?: string }).message ?? `${response.status} ${response.statusText}`);
  }
  return body;
}

async function demoFile(path: string, token: string, signal: AbortSignal): Promise<number> {
  const response = await fetch(`${apiBase()}${path}`, {
    signal,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? `No se pudo generar ${path}`);
  }
  return (await response.arrayBuffer()).byteLength;
}

function apiBase(): string {
  return String(api.defaults.baseURL ?? "/api").replace(/\/$/, "");
}

function stockFor(rows: StockRow[], productId: number, warehouseId: number): number {
  const product = rows.find((row) => Number(row.product_id) === Number(productId));
  const warehouse = product?.warehouses?.find(
    (item) => Number(item.warehouse_id) === Number(warehouseId),
  );
  return Number(warehouse?.current ?? 0);
}

async function waitWhilePaused(
  signal: AbortSignal,
  isPaused: () => boolean,
): Promise<void> {
  while (isPaused()) {
    await abortableDelay(150, signal);
  }
}

async function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Demo detenida", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function runStateLabel(state: RunState): string {
  const labels: Record<RunState, string> = {
    idle: "Lista para iniciar",
    running: "Ejecutando operaciones",
    paused: "Ejecución en pausa",
    completed: "Flujo completado",
    stopped: "Recorrido detenido",
    error: "Error controlado",
  };
  return labels[state];
}

function formatBytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
