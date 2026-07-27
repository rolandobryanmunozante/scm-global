import { Plus, Search, Shield, UserCheck, UserX } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, getErrorMessage } from "../api/client";
import { Alert, LoadingState, Modal, PageHeader, StatusBadge, formatDate } from "../components/ui";

interface UserRow { id: number; full_name: string; email: string; active: boolean; language: string; last_access: string | null; role_id: number; role: string; role_name: string; supplier: string | null }
interface Role { id: number; code: string; name: string; description: string }

export function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    try { const [userResponse, roleResponse] = await Promise.all([api.get<UserRow[]>("/seguridad/usuarios"), api.get<Role[]>("/seguridad/roles")]); setUsers(userResponse.data); setRoles(roleResponse.data); }
    catch (cause) { setError(getErrorMessage(cause)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (user: UserRow) => { try { await api.patch(`/seguridad/usuarios/${user.id}`, { active: !user.active }); await load(); } catch (cause) { setError(getErrorMessage(cause)); } };
  const visible = users.filter((user) => `${user.full_name} ${user.email} ${user.role_name}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <PageHeader title="Usuarios y control de acceso" subtitle="Roles, permisos y estado de las cuentas" actions={<button className="button primary" onClick={() => setOpen(true)}><Plus size={15}/> Nuevo usuario</button>}/>
    {error && <Alert>{error}</Alert>}
    <div className="toolbar"><div className="search-control"><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuario, correo o rol…"/></div><div className="role-summary"><Shield size={14}/><span>{roles.length} roles configurados</span></div></div>
    {loading ? <LoadingState/> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Usuario</th><th>Rol</th><th>Idioma</th><th>Último acceso</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{visible.map((user) => <tr key={user.id}><td><div className="user-cell"><span>{initials(user.full_name)}</span><div><strong>{user.full_name}</strong><small>{user.email}</small></div></div></td><td><strong>{user.role_name}</strong><small>{user.role}</small></td><td>{user.language.toUpperCase()}</td><td>{formatDate(user.last_access,true)}</td><td><StatusBadge status={user.active}/></td><td><button className={`button ${user.active ? "danger" : "success"}`} onClick={() => void toggle(user)}>{user.active ? <UserX size={14}/> : <UserCheck size={14}/>} {user.active ? "Desactivar" : "Activar"}</button></td></tr>)}</tbody></table></div>}
    <UserForm open={open} roles={roles} onClose={() => setOpen(false)} onSaved={async () => { setOpen(false); await load(); }}/>
  </>;
}

function UserForm({ open, roles, onClose, onSaved }: { open: boolean; roles: Role[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ full_name: "", email: "", password: "SCM2026!", role_id: "", language: "es", license_number: "", license_expiry: "" }); const [error,setError]=useState("");
  const role = roles.find((item) => Number(item.id) === Number(form.role_id));
  const submit = async (event: FormEvent) => { event.preventDefault(); try { await api.post("/seguridad/usuarios", { ...form, role_id: Number(form.role_id), license_number: form.license_number || null, license_expiry: form.license_expiry || null }); await onSaved(); } catch (cause) { setError(getErrorMessage(cause)); } };
  return <Modal open={open} onClose={onClose} title="Crear usuario" width="650px">{error&&<Alert>{error}</Alert>}<form onSubmit={submit}><div className="form-grid"><label className="field"><span>Nombre completo *</span><input value={form.full_name} onChange={(event)=>setForm({...form,full_name:event.target.value})} required/></label><label className="field"><span>Correo *</span><input type="email" value={form.email} onChange={(event)=>setForm({...form,email:event.target.value})} required/></label><label className="field"><span>Contraseña temporal *</span><input type="text" minLength={10} value={form.password} onChange={(event)=>setForm({...form,password:event.target.value})} required/></label><label className="field"><span>Rol *</span><select value={form.role_id} onChange={(event)=>setForm({...form,role_id:event.target.value})} required><option value="">Seleccione…</option>{roles.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>Idioma</span><select value={form.language} onChange={(event)=>setForm({...form,language:event.target.value})}><option value="es">Español</option><option value="en">English</option><option value="pt">Português</option></select></label>{role?.code==="DRIVER"&&<><label className="field"><span>Número de licencia *</span><input value={form.license_number} onChange={(event)=>setForm({...form,license_number:event.target.value})} required/></label><label className="field"><span>Vigencia de licencia *</span><input type="date" value={form.license_expiry} onChange={(event)=>setForm({...form,license_expiry:event.target.value})} required/></label></>}</div><Alert type="warning">La contraseña se almacena con bcrypt (12 rondas). Solicite al usuario cambiarla al primer acceso.</Alert><div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary">Crear usuario</button></div></form></Modal>;
}

function initials(name:string){return name.split(" ").slice(0,2).map((word)=>word[0]).join("").toUpperCase()}
