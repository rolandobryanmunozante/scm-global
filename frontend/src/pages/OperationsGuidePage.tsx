import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  BadgeCheck,
  BookOpenCheck,
  Boxes,
  ClipboardCheck,
  PackageCheck,
  ShieldCheck,
  Truck,
  UserRoundCheck,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/ui";
import { NavLink } from "../router";

interface RoleGuide {
  code: string;
  name: string;
  responsibility: string;
  actions: string[];
  boundary: string;
}

const roleGuides: RoleGuide[] = [
  { code: "ADMIN", name: "Administrador", responsibility: "Configura cuentas, roles y operación general.", actions: ["Gestiona usuarios", "Accede a todos los módulos", "Supervisa permisos y auditoría"], boundary: "No reemplaza la validación operativa de cada responsable." },
  { code: "PURCHASE_MANAGER", name: "Responsable de Compras", responsibility: "Gestiona la relación comercial y abastecimiento.", actions: ["Crea y aprueba órdenes", "Gestiona y califica proveedores", "Consulta inventario y reportes"], boundary: "No recibe stock ni conduce o asigna transportes." },
  { code: "INVENTORY_MANAGER", name: "Responsable de Inventario", responsibility: "Mantiene existencias físicas y sus movimientos.", actions: ["Gestiona productos y almacenes", "Recibe compras", "Ejecuta transferencias y movimientos"], boundary: "No aprueba compras ni administra rutas o flota." },
  { code: "LOGISTICS_MANAGER", name: "Responsable de Logística", responsibility: "Planifica el recorrido y ejecuta el transporte.", actions: ["Crea rutas", "Crea envíos de entrada o salida", "Asigna vehículo y conductor"], boundary: "No modifica órdenes ni ajusta stock manualmente." },
  { code: "DRIVER", name: "Transportista", responsibility: "Ejecuta únicamente los envíos que le fueron asignados.", actions: ["Acepta la carga asignada", "Reporta ubicación, aduana o incidencia", "Registra arribo o entrega final"], boundary: "No ve envíos ajenos, asigna vehículos ni ingresa stock." },
  { code: "MANAGER", name: "Gerencia", responsibility: "Toma decisiones con información consolidada.", actions: ["Consulta indicadores", "Exporta reportes", "Revisa auditoría y trazabilidad"], boundary: "Su perfil es de consulta; no altera la operación." },
  { code: "SUPPLIER", name: "Proveedor", responsibility: "Atiende las órdenes emitidas a su empresa.", actions: ["Ve solo sus órdenes", "Confirma fecha de entrega", "Adjunta documento comercial"], boundary: "No accede a inventario, otros proveedores ni transporte interno." },
  { code: "AUDITOR", name: "Auditor", responsibility: "Verifica trazabilidad, reportes y acciones registradas.", actions: ["Consulta trazabilidad", "Exporta evidencia", "Revisa bitácora de auditoría"], boundary: "No crea ni modifica datos operativos." },
  { code: "CLIENT", name: "Cliente", responsibility: "Consulta el avance de una entrega mediante su código.", actions: ["Usa rastreo público", "Revisa ubicación y eventos", "Consulta ETA"], boundary: "No accede a la operación interna ni a otros envíos." },
];

export function OperationsGuidePage() {
  const { user, can } = useAuth();
  const current = roleGuides.find((role) => role.code === user?.role);

  return (
    <>
      <PageHeader
        title="Guía operativa"
        subtitle="Qué hace cada perfil y cómo se relacionan compras, inventario y transporte"
      />
      {current && (
        <section className="card current-role-card">
          <div className="role-hero-icon"><UserRoundCheck size={24} /></div>
          <div>
            <span>SU PERFIL ACTUAL</span>
            <h2>{current.name}</h2>
            <p>{current.responsibility}</p>
          </div>
          <div className="role-actions">
            {can("purchases.read") && <NavLink to="/ordenes" className="button">Ir a órdenes</NavLink>}
            {can("inventory.read") && <NavLink to="/inventario" className="button">Ir a inventario</NavLink>}
            {can("shipments.read") && <NavLink to="/envios" className="button primary">Ir a transporte</NavLink>}
            {can("users.manage") && <NavLink to="/demo-presentacion" className="button">Iniciar demo operativa</NavLink>}
            {user?.role === "SUPPLIER" && can("supplier.portal") && <NavLink to="/portal-proveedor" className="button primary">Ir al portal</NavLink>}
            {can("tracking.read") && <NavLink to="/rastreo" className="button primary">Rastrear envío</NavLink>}
          </div>
        </section>
      )}

      <section className="guide-section">
        <div className="section-heading">
          <div><BookOpenCheck size={18} /><h2>Dos flujos que no deben confundirse</h2></div>
          <p>La flecha de una ruta siempre significa “sale del origen y llega al destino”.</p>
        </div>
        <div className="operational-flows">
          <article className="card inbound">
            <header><ArrowDownToLine size={22} /><div><span>ENTRADA</span><h3>Compra que llega a la empresa</h3></div></header>
            <ol>
              <li><ClipboardCheck size={17} /><div><strong>Compras</strong><span>Crea y aprueba la orden al proveedor.</span></div></li>
              <li><BadgeCheck size={17} /><div><strong>Proveedor</strong><span>Confirma fecha y documento desde su portal.</span></div></li>
              <li><Truck size={17} /><div><strong>Logística</strong><span>Elige la orden confirmada, la ruta y el almacén; luego asigna transporte.</span></div></li>
              <li><PackageCheck size={17} /><div><strong>Transportista</strong><span>Acepta la carga, mantiene el rastreo y registra el arribo.</span></div></li>
              <li><Boxes size={17} /><div><strong>Inventario</strong><span>Revisa físicamente y confirma la recepción; recién aquí aumenta el stock.</span></div></li>
            </ol>
            {can("shipments.assign") && <NavLink to="/envios" className="button primary">Crear entrada <ArrowRight size={14}/></NavLink>}
          </article>
          <article className="card outbound">
            <header><ArrowUpFromLine size={22} /><div><span>SALIDA</span><h3>Distribución que sale de la empresa</h3></div></header>
            <ol>
              <li><Boxes size={17} /><div><strong>Logística</strong><span>Elige almacén de salida, producto y cantidad disponible.</span></div></li>
              <li><ShieldCheck size={17} /><div><strong>Sistema</strong><span>Reserva stock al crear el envío y evita sobreasignarlo.</span></div></li>
              <li><Truck size={17} /><div><strong>Logística</strong><span>Asigna vehículo y conductor sin iniciar todavía el viaje.</span></div></li>
              <li><PackageCheck size={17} /><div><strong>Transportista</strong><span>Acepta la carga; en ese momento se descuenta el origen. Al llegar registra arribo.</span></div></li>
              <li><Boxes size={17} /><div><strong>Inventario</strong><span>Si llega a otro almacén, confirma la recepción y aumenta su stock.</span></div></li>
            </ol>
            {can("shipments.assign") && <NavLink to="/envios" className="button primary">Crear salida <ArrowRight size={14}/></NavLink>}
          </article>
        </div>
      </section>

      <section className="guide-section">
        <div className="section-heading">
          <div><ShieldCheck size={18} /><h2>Responsabilidad y límites por rol</h2></div>
          <p>El menú y la API aplican estos mismos permisos; ocultar una vista no sustituye el control del backend.</p>
        </div>
        <div className="role-guide-grid">
          {roleGuides.map((role) => (
            <article className={`card role-guide-card ${role.code === user?.role ? "current" : ""}`} key={role.code}>
              <header><strong>{role.name}</strong>{role.code === user?.role && <span>Su perfil</span>}</header>
              <p>{role.responsibility}</p>
              <ul>{role.actions.map((action) => <li key={action}><BadgeCheck size={13}/>{action}</li>)}</ul>
              <footer><strong>Límite:</strong> {role.boundary}</footer>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
