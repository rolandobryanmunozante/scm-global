import { Edit3, Filter, Plus, RotateCcw, Search, Star, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Alert, EmptyState, LoadingState, Modal, PageHeader, Stars, StatusBadge, formatDate } from "../components/ui";

interface Supplier {
  id: number;
  code: string;
  commercial_name: string;
  tax_id: string;
  country: string;
  category_id: number;
  category: string;
  email: string;
  phone: string;
  address: string | null;
  notes: string | null;
  active: boolean;
  score: number;
  rating_count: number;
}

interface Category { id: number; name: string }

const emptyForm = {
  commercial_name: "",
  tax_id: "",
  country: "Bolivia",
  category_id: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

export function SuppliersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Supplier | null | "new">(null);
  const [rating, setRating] = useState<Supplier | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [{ data }, categoryResponse] = await Promise.all([
        api.get<Supplier[]>("/proveedores", { params: { search, country: country || undefined, categoryId: categoryId || undefined, active: "all", sort: "score" } }),
        api.get<Category[]>("/proveedores/categorias"),
      ]);
      setSuppliers(data);
      setCategories(categoryResponse.data);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [search, country, categoryId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const deactivate = async (supplier: Supplier) => {
    if (!window.confirm(`¿Dar de baja a ${supplier.commercial_name}?`)) return;
    try {
      await api.delete(`/proveedores/${supplier.id}`);
      await load();
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };
  const reactivate = async (supplier: Supplier) => {
    try {
      await api.patch(`/proveedores/${supplier.id}/estado`, { active: true });
      await load();
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  return (
    <>
      <PageHeader title={t("pages.suppliers")} subtitle={t("pages.suppliersSubtitle")} actions={
        can("suppliers.write") ? <button className="button primary" onClick={() => setEditing("new")}><Plus size={15} /> Nuevo proveedor</button> : undefined
      } />
      {error && <Alert>{error}</Alert>}
      <div className="toolbar">
        <div className="search-control"><Search size={15} /><input placeholder="Buscar por código, nombre o NIT…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <Filter size={15} color="#94a3b8" />
        <select value={country} onChange={(event) => setCountry(event.target.value)}>
          <option value="">Todos los países</option>
          {[...new Set(suppliers.map((supplier) => supplier.country))].map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>
      {loading ? <LoadingState /> : suppliers.length === 0 ? <EmptyState title="No se encontraron proveedores" description="Pruebe con otros filtros o registre un nuevo proveedor." /> : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Código</th><th>Nombre comercial</th><th>País</th><th>Categoría</th><th>Calificación</th><th>Estado</th><th>Contacto</th><th>Acciones</th></tr></thead>
            <tbody>{suppliers.map((supplier) => (
              <tr key={supplier.id}>
                <td><strong>{supplier.code}</strong><small>{supplier.tax_id}</small></td>
                <td><strong>{supplier.commercial_name}</strong><small>{supplier.address ?? "Sin dirección"}</small></td>
                <td>{supplier.country}</td><td>{supplier.category}</td>
                <td><Stars value={Number(supplier.score)} /></td>
                <td><StatusBadge status={supplier.active} /></td>
                <td><strong>{supplier.email}</strong><small>{supplier.phone}</small></td>
                <td><div className="row-actions">
                  {can("suppliers.write") && <button className="icon-button" title="Editar" onClick={() => setEditing(supplier)}><Edit3 size={14} /></button>}
                  {can("suppliers.rate") && <button className="icon-button" title="Calificar" onClick={() => setRating(supplier)}><Star size={14} /></button>}
                  {can("suppliers.write") && supplier.active && <button className="icon-button" title="Dar de baja" onClick={() => void deactivate(supplier)}><Trash2 size={14} /></button>}
                  {can("suppliers.write") && !supplier.active && <button className="icon-button" title="Reactivar" onClick={() => void reactivate(supplier)}><RotateCcw size={14} /></button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <SupplierForm supplier={editing === "new" ? null : editing} categories={categories} open={editing !== null} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />
      <RatingForm supplier={rating} open={Boolean(rating)} onClose={() => setRating(null)} onSaved={async () => { setRating(null); await load(); }} />
    </>
  );
}

function SupplierForm({ supplier, categories, open, onClose, onSaved }: { supplier: Supplier | null; categories: Category[]; open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(supplier ? {
      commercial_name: supplier.commercial_name, tax_id: supplier.tax_id, country: supplier.country,
      category_id: String(supplier.category_id), email: supplier.email, phone: supplier.phone,
      address: supplier.address ?? "", notes: supplier.notes ?? "",
    } : emptyForm);
    setError("");
  }, [supplier, open]);

  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      const payload = { ...form, category_id: Number(form.category_id), address: form.address || null, notes: form.notes || null };
      if (supplier) await api.put(`/proveedores/${supplier.id}`, payload); else await api.post("/proveedores", payload);
      await onSaved();
    } catch (cause) { setError(getErrorMessage(cause)); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} title={supplier ? "Editar proveedor" : "Registrar proveedor"} onClose={onClose}>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Nombre comercial *" value={form.commercial_name} onChange={(value) => update("commercial_name", value)} />
          <Field label="NIT / RUC *" value={form.tax_id} onChange={(value) => update("tax_id", value)} />
          <label className="field"><span>País *</span><select value={form.country} onChange={(event) => update("country", event.target.value)} required><option>Bolivia</option><option>Perú</option><option>Brasil</option><option>Argentina</option><option>Chile</option></select></label>
          <label className="field"><span>Categoría *</span><select value={form.category_id} onChange={(event) => update("category_id", event.target.value)} required><option value="">Seleccione…</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <Field label="Correo *" type="email" value={form.email} onChange={(value) => update("email", value)} />
          <Field label="Teléfono *" value={form.phone} onChange={(value) => update("phone", value)} />
          <Field label="Dirección" value={form.address} onChange={(value) => update("address", value)} full />
          <label className="field full"><span>Notas</span><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
        </div>
        <div className="form-actions"><button className="button" type="button" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Guardando…" : "Guardar proveedor"}</button></div>
      </form>
    </Modal>
  );
}

function RatingForm({ supplier, open, onClose, onSaved }: { supplier: Supplier | null; open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [scores, setScores] = useState({ punctuality: 5, quality: 5, price: 5, comments: "" });
  const [history, setHistory] = useState<Array<{ id: number; punctuality: number; quality: number; price: number; weighted_score: number; comments: string | null; period_start: string; evaluator: string }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!supplier || !open) return;
    setLoadingHistory(true);
    void api.get<typeof history>(`/proveedores/${supplier.id}/calificaciones`)
      .then(({ data }) => setHistory(data))
      .catch((cause) => setError(getErrorMessage(cause)))
      .finally(() => setLoadingHistory(false));
  }, [supplier, open]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!supplier) return;
    try {
      await api.post(`/proveedores/${supplier.id}/calificaciones`, { ...scores, period_start: new Date().toISOString().slice(0, 10) });
      await onSaved();
    } catch (cause) { setError(getErrorMessage(cause)); }
  };
  return (
    <Modal open={open} title={`Calificar · ${supplier?.commercial_name ?? ""}`} onClose={onClose} width="520px">
      {error && <Alert>{error}</Alert>}
      <div className="rating-history">
        <strong>Historial de desempeño</strong>
        {loadingHistory ? <LoadingState label="Cargando evaluaciones…"/> : history.length === 0 ? <p className="modal-intro">Aún no existen evaluaciones.</p> : history.slice(0,5).map((item) => <article key={item.id}><Stars value={Number(item.weighted_score)}/><div><strong>{Number(item.weighted_score).toFixed(1)} · {item.evaluator}</strong><small>{formatDate(item.period_start)} · Puntualidad {item.punctuality} · Calidad {item.quality} · Precio {item.price}</small>{item.comments && <span>{item.comments}</span>}</div></article>)}
      </div>
      <form onSubmit={submit}>
        {(["punctuality", "quality", "price"] as const).map((field) => <label className="rating-row" key={field}><span>{{ punctuality: "Puntualidad", quality: "Calidad", price: "Precio" }[field]}</span><div>{[1,2,3,4,5].map((star) => <button type="button" key={star} className={scores[field] >= star ? "selected" : ""} onClick={() => setScores((current) => ({ ...current, [field]: star }))}>★</button>)}</div></label>)}
        <label className="field"><span>Comentarios</span><textarea value={scores.comments} onChange={(event) => setScores((current) => ({ ...current, comments: event.target.value }))} /></label>
        <div className="rating-average">Promedio ponderado <strong>{(scores.punctuality * .4 + scores.quality * .4 + scores.price * .2).toFixed(1)}</strong></div>
        <div className="form-actions"><button className="button" type="button" onClick={onClose}>Cancelar</button><button className="button primary">Guardar calificación</button></div>
      </form>
    </Modal>
  );
}

function Field({ label, value, onChange, type = "text", full = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; full?: boolean }) {
  return <label className={`field ${full ? "full" : ""}`}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={label.includes("*")} /></label>;
}
