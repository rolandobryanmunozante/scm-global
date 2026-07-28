import { Bell, BellRing, Check, Mail, RefreshCw, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import { Alert, EmptyState, LoadingState, PageHeader, formatDate } from "../components/ui";

interface NotificationItem { id: number; title: string; message: string; channel: string; event_code: string; read_at: string | null; created_at: string }
interface Preference { event_code: string; app_enabled: boolean; email_enabled: boolean; push_enabled: boolean }
const eventOptions = [
  { code: "AUTO_PURCHASE_ORDER", label: "Órdenes automáticas" },
  { code: "LATE_ORDER", label: "Incumplimientos" },
  { code: "SHIPMENT_ASSIGNED", label: "Envíos asignados" },
  { code: "SHIPMENT_DELAYED", label: "Retrasos de transporte" },
];

export function NotificationsPage() {
  const [items,setItems]=useState<NotificationItem[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [message,setMessage]=useState(""); const [browserEnabled,setBrowserEnabled]=useState(typeof Notification!=="undefined"&&Notification.permission==="granted");
  const [preferences,setPreferences]=useState<Preference[]>(()=>eventOptions.map((item)=>({event_code:item.code,app_enabled:true,email_enabled:true,push_enabled:false})));
  const load=useCallback(async()=>{try{const[notificationResponse,preferenceResponse]=await Promise.all([api.get<NotificationItem[]>("/configuracion/notificaciones"),api.get<Preference[]>("/configuracion/preferencias")]);setItems(notificationResponse.data);const stored=new Map(preferenceResponse.data.map((item)=>[item.event_code,item]));setPreferences(eventOptions.map((option)=>stored.get(option.code)??{event_code:option.code,app_enabled:true,email_enabled:true,push_enabled:false}))}catch(cause){setError(getErrorMessage(cause))}finally{setLoading(false)}},[]);
  useEffect(()=>{void load()},[load]);
  const read=async(id:number)=>{try{await api.patch(`/configuracion/notificaciones/${id}/leer`);await load()}catch(cause){setError(getErrorMessage(cause))}};
  const enableBrowser=async()=>{if(typeof Notification==="undefined"){setError("Este navegador no admite notificaciones.");return}const permission=await Notification.requestPermission();setBrowserEnabled(permission==="granted");if(permission==="granted")new Notification("SCM Global",{body:"Las notificaciones del navegador están activas."})};
  const updatePreference=(code:string,field:keyof Omit<Preference,"event_code">,value:boolean)=>setPreferences((current)=>current.map((item)=>item.event_code===code?{...item,[field]:value}:item));
  const savePreferences=async()=>{try{await api.put("/configuracion/preferencias",preferences.map((item)=>({...item,push_enabled:item.push_enabled&&browserEnabled})));setError("");setMessage("Preferencias guardadas correctamente.")}catch(cause){setError(getErrorMessage(cause))}};
  return <>
    <PageHeader title="Centro de notificaciones" subtitle="Eventos críticos, correo y alertas del navegador" actions={<button className="button" onClick={()=>void load()}><RefreshCw size={14}/> Actualizar</button>}/>
    {error&&<Alert>{error}</Alert>}{message&&<Alert type="success">{message}</Alert>}
    <section className="notifications-layout"><article className="card notification-feed"><div className="card-header"><div><h2>Bandeja de actividad</h2><p>{items.filter((item)=>!item.read_at).length} sin leer</p></div><BellRing size={18} color="#2563EB"/></div>{loading?<LoadingState/>:items.length===0?<EmptyState title="No tiene notificaciones"/>:<div>{items.map((item)=><article key={item.id} className={`notification-item ${item.read_at?"":"unread"}`}><div className="notification-icon"><Bell size={16}/></div><div><div><strong>{item.title}</strong><span>{formatDate(item.created_at,true)}</span></div><p>{item.message}</p><small>{item.event_code}</small></div>{!item.read_at&&<button className="icon-button" title="Marcar como leída" onClick={()=>void read(item.id)}><Check size={14}/></button>}</article>)}</div>}</article>
      <aside className="card notification-settings"><div className="card-header"><div><h3>Preferencias</h3><p>Canales por evento</p></div></div><div className="card-body"><div className="channel-status"><Mail size={17}/><div><strong>Correo electrónico</strong><span>Plantillas con branding SCM</span></div><em>Configurable</em></div><div className="channel-status"><Smartphone size={17}/><div><strong>Notificación del navegador</strong><span>Alertas mientras trabaja</span></div><button className={`toggle ${browserEnabled?"active":""}`} onClick={()=>void enableBrowser()}><span/></button></div><div className="preference-events"><div className="preference-heading"><span>Evento</span><small>App</small><small>Email</small><small>Push</small></div>{eventOptions.map((option)=>{const item=preferences.find((preference)=>preference.event_code===option.code)!;return <label key={option.code}><span>{option.label}</span><input aria-label={`${option.label} en aplicación`} type="checkbox" checked={item.app_enabled} onChange={(event)=>updatePreference(option.code,"app_enabled",event.target.checked)}/><input aria-label={`${option.label} por correo`} type="checkbox" checked={item.email_enabled} onChange={(event)=>updatePreference(option.code,"email_enabled",event.target.checked)}/><input aria-label={`${option.label} push`} type="checkbox" checked={item.push_enabled&&browserEnabled} disabled={!browserEnabled} onChange={(event)=>updatePreference(option.code,"push_enabled",event.target.checked)}/></label>})}</div><button className="button primary settings-save" onClick={()=>void savePreferences()}>Guardar preferencias</button></div></aside>
    </section>
  </>;
}
