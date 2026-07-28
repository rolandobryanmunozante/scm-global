# SCM Global

Sistema web integral de gestión de la cadena de suministro, implementado y auditado contra el documento **Sistema Global de Gestión de la Cadena de Suministro**.

La [guía completa de instalación, operación y despliegue](docs/GUIA_INSTALACION.md) incluye instrucciones para Windows, Linux, macOS y servidores con HTTPS.
La [matriz de cumplimiento](docs/CUMPLIMIENTO_REQUISITOS.md) relaciona las 25 historias con su evidencia y límites, y la [arquitectura de datos](docs/ARQUITECTURA_Y_DATOS.md) describe los flujos transaccionales.

## Arranque rápido con Docker

Requisitos:

- Docker Desktop con Docker Compose.
- Puertos libres `8080`, `4000` y `5435`.

Clone el repositorio:

```bash
git clone https://github.com/rolandobryanmunozante/scm-global.git
cd scm-global
```

Desde PowerShell:

```powershell
Copy-Item .env.example .env
.\iniciar-scm.ps1
```

Para construir deliberadamente desde cambios locales use
`.\iniciar-scm.ps1 -Build`.

En Linux, macOS o cualquier sistema con Docker Compose:

```bash
cp .env.example .env
docker compose pull
docker compose up -d --no-build --wait
```

Los contenedores de aplicación se descargan desde GitHub Container Registry:

```text
ghcr.io/rolandobryanmunozante/scm-global-backend:latest
ghcr.io/rolandobryanmunozante/scm-global-frontend:latest
```

También se pueden construir desde el código fuente mediante
`docker compose up -d --build --wait`. La primera ejecución crea el esquema de
PostgreSQL y carga los datos demostrativos. En cada arranque, el servicio `migrate`
aplica únicamente migraciones pendientes; las siguientes ejecuciones conservan la
información.

Accesos:

- Aplicación: <http://localhost:8080>
- API: <http://localhost:4000/api>
- Salud de la API: <http://localhost:4000/api/health>
- PostgreSQL: `localhost:5435`
- Rastreo público de ejemplo: <http://localhost:8080/rastreo/SCM-BO-2026-001>

Credencial administrativa:

```text
Usuario: admin@scm.local
Contraseña: SCM2026!
```

Todos los usuarios demostrativos utilizan la contraseña `SCM2026!`:

| Rol | Usuario |
|---|---|
| Administrador | `admin@scm.local` |
| Compras | `compras@scm.local` |
| Inventarios | `inventario@scm.local` |
| Logística | `logistica@scm.local` |
| Transportista | `transportista@scm.local` |
| Gerencia | `gerente@scm.local` |
| Cliente | `cliente@scm.local` |
| Auditoría | `auditor@scm.local` |
| Proveedor | `proveedor@scm.local` |

Cambie `JWT_SECRET` y las contraseñas de `.env` antes de un despliegue público.

## Servicios Docker

| Servicio | Tecnología | Puerto |
|---|---|---|
| `frontend` | React 19, Vite, Tailwind y Nginx | `8080` |
| `backend` | Node.js, Express, Socket.IO | `4000` |
| `migrate` | Ejecutor incremental de SQL | Sin puerto |
| `postgres` | PostgreSQL 16 | `5435` |

Los tres servicios permanentes tienen comprobaciones de salud. El backend espera la migración y el frontend espera al backend.
En la configuración local, frontend, API y PostgreSQL se enlazan solamente a `127.0.0.1`. Para publicar el sistema se coloca un proxy HTTPS delante del puerto web.

Comandos operativos:

```powershell
# Ver estado
docker compose ps

# Ver registros
docker compose logs -f

# Detener conservando los datos
.\detener-scm.ps1

# Detener directamente
docker compose down
```

Para reinicializar completamente los datos demostrativos:

```powershell
docker compose down -v
docker compose up -d --build
```

El primer comando elimina de forma permanente el volumen de la base de datos.

### Publicación en un servidor

Configure en `.env` el origen web público, por ejemplo:

```text
WEB_ORIGIN=https://scm.midominio.com
```

Luego apunte el proxy HTTPS del servidor al puerto `8080`. El frontend usa rutas relativas y Nginx se comunica con el backend por la red interna de Docker, por lo que no se necesita publicar el puerto `4000` ni el `5435` hacia Internet.

## Alcance implementado

- Autenticación JWT, recuperación de contraseña, sesiones, permisos y nueve perfiles de acceso.
- Gestión, evaluación y portal de proveedores.
- CRUD lógico de productos, almacenes, rutas, vehículos y proveedores.
- Stock, reservas, alertas de mínimos, movimientos, transferencias y trazabilidad por producto.
- Órdenes manuales/automáticas, aprobación, confirmación del proveedor, recepción y actualización transaccional del inventario.
- Planificación visual de rutas con Leaflet y OpenStreetMap.
- Creación de envíos, asignación compatible de vehículo/transportista y notificaciones.
- Seguimiento público con código único, ubicación, ETA, evidencia e historial en tiempo real.
- Mapa global de embarques.
- Dashboard con KPIs, filtros y gráficos.
- Reportes PDF y Excel.
- Auditoría de acciones, preferencias de notificación e infraestructura parcial de idiomas español, inglés y portugués.
- Interfaz adaptable a escritorio, tableta y móvil.

El PDF identifica como fuera del MVP las integraciones aduaneras externas, aplicación móvil nativa, multimoneda, predicción por aprendizaje automático, simulaciones, integración con ERP y huella de carbono. Se respetó esa delimitación.

## Base de datos

El [diagrama entidad-relación en Mermaid](docs/DIAGRAMA_BASE_DATOS.md) puede
consultarse directamente en GitHub y se mantiene sincronizado con las migraciones.

Las migraciones se ejecutan automáticamente en una base nueva:

- `database/migrations/001_schema.sql`: extensiones, tipos, tablas, restricciones, índices y disparadores.
- `database/migrations/002_seed.sql`: roles, permisos, usuarios y datos demostrativos.
- `database/migrations/003_integrity_workflows.sql`: recepción, revocación, relaciones de almacenes y permisos granulares.

`database/migrate.sh` registra cada archivo aplicado en `schema_migrations`. La información persiste en el volumen `scm_postgres_data`, normalmente prefijado con el nombre del proyecto Compose.

## Desarrollo y validación

Sin Docker se requiere Node.js 20 o posterior y pnpm:

```powershell
pnpm install
pnpm check
pnpm dev
```

`pnpm check` ejecuta verificación TypeScript, pruebas automatizadas y compilaciones de producción de backend y frontend.

En una instalación Docker descartable:

```powershell
pnpm verify:system
pnpm verify:workflows
docker compose exec -T postgres psql -U scm_user -d scm_global -v ON_ERROR_STOP=1 -f /database/verify.sql
```

`verify:workflows` crea registros de prueba; no se recomienda ejecutarlo sobre producción.

Estructura:

```text
backend/                 API REST, WebSocket, seguridad y reportes
database/migrations/     esquema y datos iniciales
frontend/                aplicación React
docker-compose.yml       orquestación completa
iniciar-scm.ps1          arranque asistido para Windows
detener-scm.ps1          detención conservando datos
```
