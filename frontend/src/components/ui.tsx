import { X } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  width = "760px",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-panel"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>
        <div className="modal-content">{children}</div>
      </section>
    </div>
  );
}

export function LoadingState({ label = "Cargando información…" }: { label?: string }) {
  return (
    <div className="loading-state">
      <span className="spinner" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({
  title = "No hay datos para mostrar",
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">◇</div>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string | boolean }) {
  const raw = typeof status === "boolean" ? (status ? "ACTIVO" : "INACTIVO") : status;
  const normalized = raw.toUpperCase().replaceAll(" ", "_");
  const positive = ["ACTIVO", "ENTREGADO", "RECIBIDA", "APROBADA", "CONFIRMADA"].includes(normalized);
  const warning = ["BORRADOR", "PREPARANDO", "ASIGNADO", "EN_ADUANA", "EN_TRANSITO", "EN_TRÁNSITO", "PENDIENTE_RECEPCION"].includes(
    normalized,
  );
  const danger = ["RETRASADO", "INCIDENCIA", "CANCELADA", "INACTIVO"].includes(normalized);
  return (
    <span
      className={`status-badge ${positive ? "success" : warning ? "warning" : danger ? "danger" : "neutral"}`}
    >
      <span />
      {raw.replaceAll("_", " ")}
    </span>
  );
}

export function Alert({
  type = "error",
  children,
}: {
  type?: "error" | "success" | "warning";
  children: ReactNode;
}) {
  return <div className={`alert ${type}`}>{children}</div>;
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="stars" aria-label={`${value.toFixed(1)} de 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={value >= star - 0.3 ? "filled" : ""}>
          ★
        </span>
      ))}
      <small>{value.toFixed(1)}</small>
    </span>
  );
}

export function formatDate(value?: string | null, withTime = false): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
  }).format(new Date(value));
}

export function formatMoney(value: number | string): string {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    maximumFractionDigits: 0,
  }).format(Number(value));
}
