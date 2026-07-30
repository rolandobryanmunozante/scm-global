import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Globe2,
  Maximize2,
  PackageCheck,
  Pause,
  Play,
  Presentation,
  RotateCcw,
  ShieldCheck,
  Truck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../components/ui";

interface DemoSlide {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  module: string;
  actor: string;
  actions: string[];
  handoff: string;
  tone: string;
}

const slides: DemoSlide[] = [
  {
    eyebrow: "RECORRIDO AUTOMÁTICO",
    title: "SCM Global conecta toda la cadena de suministro",
    description: "Esta presentación recorre los nueve perfiles, sus límites y los dos flujos operativos completos sin modificar ningún dato.",
    icon: Presentation,
    module: "Vista integral del sistema",
    actor: "Todos los participantes",
    actions: ["Abastecimiento y proveedores", "Inventario multi-almacén", "Logística, transporte y rastreo", "Reportes, seguridad y auditoría"],
    handoff: "La demostración utiliza únicamente contenido explicativo. Puede pausarse para abrir los módulos reales.",
    tone: "navy",
  },
  {
    eyebrow: "ROL 1 DE 9",
    title: "Administrador",
    description: "Configura la plataforma, administra cuentas y conserva la supervisión completa sin sustituir las decisiones de cada responsable.",
    icon: UserCog,
    module: "Usuarios y configuración",
    actor: "admin@scm.local",
    actions: ["Crea y desactiva usuarios", "Asigna roles y revisa permisos", "Consulta auditoría y todos los módulos", "Protege el último administrador activo"],
    handoff: "Entrega una plataforma configurada a Compras, Inventario y Logística.",
    tone: "blue",
  },
  {
    eyebrow: "ROL 2 DE 9",
    title: "Responsable de Compras",
    description: "Gestiona proveedores, catálogos y órdenes; decide qué se solicita y aprueba el abastecimiento.",
    icon: ClipboardCheck,
    module: "Proveedores y órdenes",
    actor: "compras@scm.local",
    actions: ["Filtra productos por catálogo del proveedor", "Crea y aprueba órdenes", "Califica cumplimiento, calidad y precio", "Consulta el estado logístico relacionado"],
    handoff: "Una orden APROBADA pasa al proveedor correspondiente para su confirmación.",
    tone: "cyan",
  },
  {
    eyebrow: "ROL 3 DE 9",
    title: "Proveedor externo",
    description: "Cada cuenta de proveedor está aislada y sólo puede atender las órdenes de su propia empresa.",
    icon: Building2,
    module: "Portal del proveedor",
    actor: "proveedor@scm.local",
    actions: ["Ve únicamente sus órdenes", "Confirma fecha comprometida", "Registra documento comercial", "Entrega la orden CONFIRMADA a Logística"],
    handoff: "La confirmación habilita a Logística para preparar el transporte entrante.",
    tone: "teal",
  },
  {
    eyebrow: "ROL 4 DE 9",
    title: "Responsable de Logística",
    description: "Planifica rutas y cargas, comprueba capacidad y asigna recursos disponibles sin iniciar el viaje por cuenta del conductor.",
    icon: Globe2,
    module: "Rutas, flota y envíos",
    actor: "logistica@scm.local",
    actions: ["Crea rutas terrestres, marítimas y aéreas", "Prepara entradas y salidas", "Valida peso, volumen y disponibilidad", "Asigna vehículo y transportista"],
    handoff: "El envío ASIGNADO queda esperando la aceptación del transportista.",
    tone: "blue",
  },
  {
    eyebrow: "ROL 5 DE 9",
    title: "Transportista",
    description: "Opera solamente cargas asignadas a su cuenta y mantiene la trazabilidad del recorrido.",
    icon: Truck,
    module: "Transporte y telemetría",
    actor: "transportista.libre01@scm.local",
    actions: ["Acepta la carga asignada", "Inicia el tránsito y reporta ubicación", "Registra aduana, retraso o incidencia", "Confirma arribo o entrega final"],
    handoff: "Al llegar a un almacén deja la carga PENDIENTE_RECEPCION para Inventario.",
    tone: "cyan",
  },
  {
    eyebrow: "ROL 6 DE 9",
    title: "Responsable de Inventario",
    description: "Controla la existencia física, las reservas y los movimientos inmutables de cada producto y almacén.",
    icon: Boxes,
    module: "Inventario y recepción",
    actor: "inventario@scm.local",
    actions: ["Consulta stock actual, reservado y disponible", "Gestiona productos y almacenes", "Confirma recepciones físicas", "Ejecuta movimientos y transferencias"],
    handoff: "Sólo su confirmación final aumenta el destino y cierra la compra o traslado.",
    tone: "teal",
  },
  {
    eyebrow: "ROL 7 DE 9",
    title: "Gerencia",
    description: "Analiza el desempeño consolidado sin alterar la operación transaccional.",
    icon: BarChart3,
    module: "Dashboard y reportes",
    actor: "gerente@scm.local",
    actions: ["Revisa indicadores y alertas", "Filtra períodos obligatorios", "Exporta PDF y Excel", "Consulta tendencias y proveedores"],
    handoff: "Convierte la trazabilidad operativa en decisiones de gestión.",
    tone: "navy",
  },
  {
    eyebrow: "ROL 8 DE 9",
    title: "Auditor",
    description: "Comprueba quién hizo cada acción y verifica que las evidencias y movimientos no hayan sido alterados.",
    icon: FileSearch,
    module: "Reportes y auditoría",
    actor: "auditor@scm.local",
    actions: ["Consulta la bitácora", "Revisa usuario, entidad y fecha", "Exporta evidencia", "No puede modificar datos operativos"],
    handoff: "Aporta control independiente y respaldo para la evaluación del proceso.",
    tone: "blue",
  },
  {
    eyebrow: "ROL 9 DE 9",
    title: "Cliente",
    description: "Consulta una entrega por código sin entrar a los módulos internos ni ver información de otros envíos.",
    icon: Users,
    module: "Rastreo público",
    actor: "cliente@scm.local",
    actions: ["Busca coincidencias mientras escribe", "Consulta ETA y ubicación", "Revisa eventos en una línea de tiempo", "Visualiza incidencias y estado final"],
    handoff: "Recibe visibilidad verificable sin acceso a la operación interna.",
    tone: "teal",
  },
  {
    eyebrow: "FLUJO CORRELACIONADO 1",
    title: "Compra entrante de principio a fin",
    description: "Cada cambio tiene un responsable diferente y el inventario sólo aumenta después de la recepción física.",
    icon: PackageCheck,
    module: "Orden → proveedor → transporte → almacén",
    actor: "Compras · Proveedor · Logística · Transportista · Inventario",
    actions: ["BORRADOR → APROBADA", "Proveedor: CONFIRMADA", "Envío: PREPARANDO → ASIGNADO", "Conductor: EN_TRANSITO → PENDIENTE_RECEPCION", "Inventario: RECIBIDA y ENTREGADO"],
    handoff: "La base de datos impide saltar etapas o recibir dos veces la misma orden.",
    tone: "cyan",
  },
  {
    eyebrow: "FLUJO CORRELACIONADO 2",
    title: "Distribución entre almacenes",
    description: "La reserva evita vender dos veces la misma existencia; el despacho y la recepción ocurren en momentos distintos.",
    icon: Truck,
    module: "Reserva → despacho → recepción",
    actor: "Logística · Transportista · Inventario",
    actions: ["PREPARANDO reserva stock", "ASIGNADO conserva la reserva", "Aceptar carga descuenta el origen", "ARRIBO espera revisión física", "Confirmar recepción aumenta el destino"],
    handoff: "Todos los movimientos quedan relacionados con el envío y son inmutables.",
    tone: "teal",
  },
  {
    eyebrow: "VISIBILIDAD GLOBAL",
    title: "Rastreo, mapa y reportes usan la misma información",
    description: "El sistema evita cifras aisladas: estado, ubicación, incidencias, ETA, inventario y auditoría provienen del mismo flujo.",
    icon: Globe2,
    module: "Mapa global, rastreo y exportaciones",
    actor: "Operación · Gerencia · Auditoría · Cliente",
    actions: ["Telemetría demostrativa cada 15 segundos", "Mapa enfoca el envío seleccionado", "Incidencias y retrasos visibles", "PDF y Excel con filtros y período"],
    handoff: "Una sola fuente de datos mantiene coherencia entre pantallas y documentos.",
    tone: "blue",
  },
  {
    eyebrow: "CIERRE",
    title: "Demostración lista para preguntas",
    description: "Pause aquí para entrar a cualquier módulo real, iniciar el guion manual o repetir automáticamente el recorrido.",
    icon: CheckCircle2,
    module: "Presentación segura y repetible",
    actor: "Expositor",
    actions: ["No crea ni elimina registros", "Funciona en tema claro y oscuro", "Puede usarse a pantalla completa", "Incluye controles y navegación por teclado"],
    handoff: "Use las flechas del teclado, los controles inferiores o el botón Reiniciar.",
    tone: "navy",
  },
];

const intervalMilliseconds = 9000;

export function PresentationDemoPage() {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const slide = slides[current]!;

  const move = useCallback((direction: number) => {
    setCurrent((value) => (value + direction + slides.length) % slides.length);
  }, []);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => move(1), intervalMilliseconds);
    return () => window.clearInterval(timer);
  }, [move, playing]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [move]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Algunos navegadores bloquean pantalla completa sin interacción permitida.
    }
  };

  const Icon = slide.icon;
  return (
    <>
      <PageHeader
        title="Demo automática"
        subtitle="Recorrido seguro por todos los roles, funciones y relevos operativos"
        actions={
          <>
            <button className="button" onClick={() => void toggleFullscreen()}>
              <Maximize2 size={15} /> Pantalla completa
            </button>
            <button className="button primary" onClick={() => setPlaying((value) => !value)}>
              {playing ? <Pause size={15} /> : <Play size={15} />}
              {playing ? "Pausar" : "Continuar"}
            </button>
          </>
        }
      />

      <section className={`presentation-stage tone-${slide.tone}`} aria-live="polite">
        <div className="presentation-safe">
          <ShieldCheck size={15} />
          Sólo lectura · no modifica datos
        </div>
        <div className="presentation-copy">
          <span>{slide.eyebrow}</span>
          <div className="presentation-icon"><Icon size={34} /></div>
          <h2>{slide.title}</h2>
          <p>{slide.description}</p>
          <div className="presentation-meta">
            <div><small>Módulo</small><strong>{slide.module}</strong></div>
            <div><small>Participante</small><strong>{slide.actor}</strong></div>
          </div>
        </div>

        <div className="presentation-detail">
          <span>FUNCIONES DEMOSTRADAS</span>
          <ul>
            {slide.actions.map((action) => (
              <li key={action}><CheckCircle2 size={18} /><span>{action}</span></li>
            ))}
          </ul>
          <div className="presentation-handoff">
            <ArrowRight size={21} />
            <div><small>Relevo y control</small><strong>{slide.handoff}</strong></div>
          </div>
        </div>
      </section>

      <div className="presentation-controls">
        <button className="icon-button" onClick={() => move(-1)} aria-label="Diapositiva anterior">
          <ArrowLeft size={18} />
        </button>
        <div className="presentation-progress">
          <div>
            {slides.map((item, index) => (
              <button
                key={item.title}
                className={index === current ? "active" : ""}
                onClick={() => setCurrent(index)}
                aria-label={`Ir a diapositiva ${index + 1}`}
              />
            ))}
          </div>
          <span>{current + 1} / {slides.length} · {playing ? "avance automático cada 9 segundos" : "en pausa"}</span>
        </div>
        <button className="icon-button" onClick={() => move(1)} aria-label="Siguiente diapositiva">
          <ArrowRight size={18} />
        </button>
        <button className="button" onClick={() => { setCurrent(0); setPlaying(true); }}>
          <RotateCcw size={14} /> Reiniciar
        </button>
      </div>
    </>
  );
}
