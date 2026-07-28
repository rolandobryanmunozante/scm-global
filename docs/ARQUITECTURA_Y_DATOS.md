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

Docker Compose agrega un servicio `migrate` de una sola ejecución. Este aplica en orden cualquier archivo nuevo de `database/migrations` y registra su nombre en `schema_migrations`. El backend solo inicia cuando la migración termina correctamente.

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
4. Inventario puede recibirla directamente, o Logística crear un envío ligado a la orden.
5. Al recibir/entregar, una transacción bloquea orden y stock, crea entradas por producto y marca la orden `RECIBIDA`.
6. Un segundo intento es rechazado para impedir duplicar existencias.

## Flujo de distribución

1. Logística selecciona ruta, almacén de origen, producto y cantidad.
2. La creación bloquea el stock y aumenta `reserved_quantity`.
3. La asignación valida vehículo, capacidad, conductor, licencia y conflictos.
4. En la misma transacción se reducen `current_quantity` y la reserva, y se crea un movimiento `SALIDA/DESPACHO`.
5. Los eventos recalculan ETA. Si el destino es otro almacén, la entrega crea `ENTRADA/TRASLADO_ENVIO`.

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

No se debe editar una migración ya aplicada en un entorno compartido. Los cambios futuros deben agregarse como `004_*.sql`, `005_*.sql`, etc.

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
