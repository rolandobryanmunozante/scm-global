import { Bell, BellRing, Check, Mail, RefreshCw, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import { Alert, EmptyState, LoadingState, PageHeader, formatDate } from "../components/ui";

interface NotificationItem { id: number; title: string; message: string; channel: string; event_code: string; read_at: string | null; created_at: string }
const eventOptions = [
  { code: "AUTO_PURCHASE_ORDER", label: "Órdenes automáticas" },
  { code: "LATE_ORDER", label: "Incumplimientos" },
  { code: "SHIPMENT_ASSIGNED", label: "Envíos asignados" },
  { code: "SHIPMENT_DELAYED", label: "Retrasos de transporte" },
];

export function NotificationsPage() {
  const [items,setItems]=useState<NotificationItem[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [browserEnabled,setBrowserEnabled]=useState(Notification.permission==="granted");
  const load=useCallback(async()=>{try{const{data}=await api.get<NotificationItem[]>("/configuracion/notificaciones");setItems(data)}catch(cause){setError(getErrorMessage(cause))}finally{setLoading(false)}},[]);
  useEffect(()=>{void load()},[load]);
  const read=async(id:number)=>{try{await api.patch(`/configuracion/notificaciones/${id}/leer`);await load()}catch(cause){setError(getErrorMessage(cause))}};
  const enableBrowser=async()=>{const permission=await Notification.requestPermission();setBrowserEnabled(permission==="granted");if(permission==="granted")new Notification("SCM Global",{body:"Las notificaciones del navegador están activas."})};
  const savePreferences=async()=>{try{await api.put("/configuracion/preferencias",eventOptions.map((item)=>({event_code:item.code,app_enabled:true,email_enabled:true,push_enabled:browserEnabled})));setError("")}catch(cause){setError(getErrorMessage(cause))}};
  return <>
    <PageHeader title="Centro de notificaciones" subtitle="Eventos críticos, correo y alertas del navegador" actions={<button className="button" onClick={()=>void load()}><RefreshCw size={14}/> Actualizar</button>}/>
    {error&&<Alert>{error}</Alert>}
    <section className="notifications-layout"><article className="card notification-feed"><div className="card-header"><div><h2>Bandeja de actividad</h2><p>{items.filter((item)=>!item.read_at).length} sin leer</p></div><BellRing size={18} color="#2563EB"/></div>{loading?<LoadingState/>:items.length===0?<EmptyState title="No tiene notificaciones"/>:<div>{items.map((item)=><article key={item.id} className={`notification-item ${item.read_at?"":"unread"}`}><div className="notification-icon"><Bell size={16}/></div><div><div><strong>{item.title}</strong><span>{formatDate(item.created_at,true)}</span></div><p>{item.message}</p><small>{item.event_code}</small></div>{!item.read_at&&<button className="icon-button" title="Marcar como leída" onClick={()=>void read(item.id)}><Check size={14}/></button>}</article>)}</div>}</article>
      <aside className="card notification-settings"><div className="card-header"><div><h3>Preferencias</h3><p>Canales por evento</p></div></div><div className="card-body"><div className="channel-status"><Mail size={17}/><div><strong>Correo electrónico</strong><span>Plantillas con branding SCM</span></div><em>Activo</em></div><div className="channel-status"><Smartphone size={17}/><div><strong>Notificación del navegador</strong><span>Alertas mientras trabaja</span></div><button className={`toggle ${browserEnabled?"active":""}`} onClick={()=>void enableBrowser()}><span/></button></div><div className="preference-events">{eventOptions.map((item)=><label key={item.code}><span>{item.label}</span><input type="checkbox" defaultChecked/></label>)}</div><button className="button primary settings-save" onClick={()=>void savePreferences()}>Guardar preferencias</button></div></aside>
    </section>
  </>;
}
