# Arquitectura, datos y flujos

El [diagrama entidad-relación completo](DIAGRAMA_BASE_DATOS.md) se mantiene como
código Mermaid y GitHub lo representa automáticamente.

## Componentes

```text
Navegador
  └─ Nginx / React
       ├─ REST /api ───────────────┐
       └─ Socket.IO /socket.io ────┤
                                   ▼
                         Express + Socket.IO
                          ├─ seguridad/RBAC
                          ├─ proveedores
                          ├─ inventarios/compras
                          ├─ logística/rutas
                          ├─ transporte/rastreo
                          └─ reportes/auditoría
                                   │
                                   ▼
                              PostgreSQL 16
```

Docker Compose agrega un servicio `migrate` de una sola ejecución. Este aplica en orden cualquier archivo nuevo de `database/migrations` y registra su nombre en `schema_migrations`. El backend solo inicia cuando la migración termina correctamente. En Windows, `iniciar-scm.ps1` ejecuta después `database/verify.sql`; `probar-instalacion-limpia.ps1` repite todo el proceso en un volumen aislado.

## Relaciones operativas principales

```text
roles ──< role_permissions >── permissions
  │
  └──< users >── suppliers

suppliers ──< purchase_orders ──< purchase_order_items >── products
                         │
                         └── shipments ──< shipment_items >── products
                                  │
                                  ├── routes
                                  ├── vehicles
                                  ├── users (driver)
                                  └──< shipment_events

products ──< stocks >── warehouses
    │           │
    └──< inventory_movements

warehouses ──< stock_transfers >── warehouses
```

## Flujo de compra

1. Compras crea una orden manual o el sistema genera una por stock bajo.
2. Un usuario con `purchases.approve` la aprueba.
3. El proveedor vinculado confirma fecha y documento desde su portal.
4. Logística crea un envío ligado a la orden y lo deja `PREPARANDO`.
5. Logística asigna un vehículo del mismo modo de la ruta y un conductor disponible;
   el envío queda `ASIGNADO`.
6. El conductor acepta; el envío pasa a `EN_TRANSITO` y la orden a `ENVIADA`.
7. El conductor registra el arribo; queda `PENDIENTE_RECEPCION` sin cambiar stock.
8. Inventario revisa y confirma. Una transacción crea entradas, marca el envío
   `ENTREGADO` y la orden `RECIBIDA`.
9. Un segundo intento es rechazado para impedir duplicar existencias.

El envío se identifica como `flow_type=ENTRADA_COMPRA`: no tiene almacén de
origen porque la mercadería proviene del proveedor y exige almacén receptor.
La ruta debe tener propósito `ENTRADA_COMPRA` o `AMBOS`.

## Flujo de distribución

1. Logística selecciona ruta, almacén de origen, producto y cantidad.
2. La creación bloquea el stock y aumenta `reserved_quantity`.
3. La asignación valida modo de ruta, vehículo, capacidad, conductor, licencia y
   conflictos, pero conserva la reserva.
4. Cuando el conductor acepta se reducen `current_quantity` y la reserva, y se crea
   el movimiento `SALIDA/DESPACHO`.
5. Los eventos recalculan ETA. El arribo a almacén queda pendiente de Inventario.
6. La confirmación física crea `ENTRADA/TRASLADO_ENVIO` en el destino.

El envío se identifica como `flow_type=SALIDA_DISTRIBUCION`, exige almacén de
origen y no puede vincular una orden de compra. La ruta debe tener propósito
`SALIDA_DISTRIBUCION` o `AMBOS`.

## Seguridad

- Contraseñas bcrypt con factor 12.
- Bloqueo temporal después de cinco intentos fallidos.
- JWT de 30 minutos, renovado solamente mientras existe actividad.
- Cierre por 30 minutos de inactividad.
- `auth_version` invalida tokens después de cambios de cuenta o contraseña.
- Usuario activo, rol y permisos se consultan en cada petición autenticada.
- El último administrador activo y la autodesactivación están protegidos.
- Proveedores se aíslan mediante `supplier_id`; conductores mediante `driver_id`.
- API, PostgreSQL y frontend se publican en `127.0.0.1` en la configuración local.

## Migraciones

| Archivo | Contenido |
|---|---|
| `001_schema.sql` | Tipos, tablas, restricciones, índices, funciones, disparadores y vistas base. |
| `002_seed.sql` | Nueve roles, permisos, usuarios y datos demostrativos. |
| `003_integrity_workflows.sql` | Revocación de sesiones, recepción, almacenes de ruta/envío, permisos granulares e integridad adicional. |
| `004_logistics_flow_semantics.sql` | Propósito de rutas, tipo de flujo de envíos y restricciones que separan compras entrantes de distribución saliente. |
| `005_inbound_state_consistency.sql` | Sincronización diferida entre orden recibida y entrega del envío; reparación segura de estados históricos. |
| `006_transport_observability.sql` | Coordenadas, frescura de telemetría, incidentes y retrasos. |
| `007_operational_demo_data.sql` | Datos correlacionados en diferentes etapas y recursos demostrativos. |
| `008_shipment_delay_minutes.sql` | Minutos de retraso persistentes. |
| `009_supplier_catalogs_and_reservation_consistency.sql` | Catálogos de proveedor, reservas y clasificación de incidencias. |
| `010_operational_workflow_enums.sql` | Estados y eventos de asignación, aceptación y arribo. |
| `011_operational_handoffs_and_route_countries.sql` | Relevos estrictos, cuentas proveedor y países de escalas. |
| `012_repair_historical_direct_receipts.sql` | Reconstrucción auditable de una recepción histórica. |
| `013_route_purpose_endpoint_consistency.sql` | Restricción entre propósito y almacenes extremos. |
| `014_demo_accounts_and_available_fleet.sql` | Cuentas alternas y flota disponible por modo. |

No se debe editar una migración ya aplicada en un entorno compartido. Los cambios
futuros deben agregarse con un prefijo mayor que `014`.

## Verificación

```bash
pnpm check
pnpm audit --prod
pnpm verify:system
pnpm verify:workflows
docker compose exec -T postgres \
  psql -U scm_user -d scm_global -v ON_ERROR_STOP=1 -f /database/verify.sql
```

`verify:system` es de solo lectura. `verify:workflows` crea datos de prueba y debe ejecutarse en una base descartable o de CI.

La [guía de roles y flujos](GUIA_FLUJOS_OPERATIVOS.md) contiene ejemplos
reproducibles y los cambios de datos esperados en cada etapa.

## Presentación automática

`PresentationDemoPage` es una vista React de sólo lectura. No cambia autenticación,
roles ni datos: representa los nueve participantes y los relevos mediante 14
diapositivas temporizadas. La demostración funcional real continúa usando las mismas
rutas REST y WebSocket que la aplicación.
