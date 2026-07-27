# SCM Global

Sistema web integral de gestión de la cadena de suministro, implementado de acuerdo con el alcance MVP del documento **Proyecto final taller**.

La [guía completa de instalación, operación y despliegue](docs/GUIA_INSTALACION.md) incluye instrucciones para Windows, Linux, macOS y servidores con HTTPS.

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

En Linux, macOS o cualquier sistema con Docker Compose:

```bash
cp .env.example .env
docker compose up -d --build
```

La primera ejecución construye las imágenes, crea el esquema de PostgreSQL y carga los datos demostrativos. Las siguientes ejecuciones conservan la información en un volumen.

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

| Contenedor | Tecnología | Puerto |
|---|---|---|
| `scm-frontend` | React 19, Vite, Tailwind y Nginx | `8080` |
| `scm-backend` | Node.js, Express, Socket.IO | `4000` |
| `scm-postgres` | PostgreSQL 16 | `5435` |

Los tres servicios tienen comprobaciones de salud. El backend espera a PostgreSQL y el frontend espera al backend antes de iniciar.
La API y PostgreSQL se enlazan solamente a la interfaz local del servidor; el único punto que necesita publicación es el puerto `8080`, que redirige internamente tanto REST como Socket.IO.

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
- Productos, almacenes, stock, alertas de mínimos, movimientos, transferencias y trazabilidad por lote.
- Órdenes de compra con recepción y actualización automática del inventario.
- Planificación visual de rutas con Leaflet y OpenStreetMap.
- Creación de envíos, asignación compatible de vehículo/transportista y notificaciones.
- Seguimiento público con código único, ubicación, ETA, evidencia e historial en tiempo real.
- Mapa global de embarques.
- Dashboard con KPIs, filtros y gráficos.
- Reportes PDF y Excel.
- Auditoría de acciones, configuración de parámetros e idiomas español, inglés y portugués.
- Interfaz adaptable a escritorio, tableta y móvil.

El PDF identifica como fuera del MVP las integraciones aduaneras externas, aplicación móvil nativa, multimoneda, predicción por aprendizaje automático, simulaciones, integración con ERP y huella de carbono. Se respetó esa delimitación.

## Base de datos

Las migraciones se ejecutan automáticamente en una base nueva:

- `database/migrations/001_schema.sql`: extensiones, tipos, tablas, restricciones, índices y disparadores.
- `database/migrations/002_seed.sql`: roles, permisos, usuarios y datos demostrativos.

La información persiste en el volumen `scm_postgres_data`, administrado por Docker Compose y normalmente prefijado con el nombre de la carpeta del proyecto.

## Desarrollo y validación

Sin Docker se requiere Node.js 20 o posterior y pnpm:

```powershell
pnpm install
pnpm check
pnpm dev
```

`pnpm check` ejecuta verificación TypeScript, pruebas automatizadas y compilaciones de producción de backend y frontend.

Estructura:

```text
backend/                 API REST, WebSocket, seguridad y reportes
database/migrations/     esquema y datos iniciales
frontend/                aplicación React
docker-compose.yml       orquestación completa
iniciar-scm.ps1          arranque asistido para Windows
detener-scm.ps1          detención conservando datos
```
