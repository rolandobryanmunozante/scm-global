# Guía de actualización para el equipo

Esta guía permite que cada integrante use exactamente el código de `main`, las
imágenes publicadas y las migraciones pendientes sin perder los datos guardados en
su volumen local.

## Actualización normal

Abra Docker Desktop y, desde la terminal de Visual Studio Code o PowerShell:

```powershell
cd "ruta\del\repositorio\scm-global"
git switch main
git pull --ff-only origin main
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
powershell -ExecutionPolicy Bypass -File .\iniciar-scm.ps1
```

El iniciador descarga `backend:latest` y `frontend:latest`, ejecuta las migraciones
SQL que todavía no estén registradas en `schema_migrations` y espera hasta que los
servicios estén saludables. No elimina el volumen ni los registros existentes.

Verifique el resultado:

```powershell
docker compose ps
pnpm.cmd verify:system
```

La aplicación queda en <http://localhost:8080> y la salud de la API en
<http://localhost:4000/api/health>.

## Desarrollo desde el código local

Para probar una modificación local antes de que exista una nueva imagen publicada:

```powershell
pnpm.cmd install
pnpm.cmd check
powershell -ExecutionPolicy Bypass -File .\iniciar-scm.ps1 -Build
```

También puede trabajar sin contenedores para frontend/backend:

```powershell
docker compose up -d postgres migrate
pnpm.cmd dev
```

En ese modo, Vite y la API se ejecutan desde la terminal; PostgreSQL sigue en Docker.

## Demostración de ubicación en tiempo real

Con el sistema levantado, abra una segunda terminal:

```powershell
pnpm.cmd demo:telemetry
```

El comando publica 12 ciclos de ubicación correlacionados con los transportistas y
envíos activos. Para mantener la simulación hasta presionar `Ctrl+C`:

```powershell
pnpm.cmd demo:telemetry -- --continuous
```

Abra simultáneamente **Mapa global**, **Transporte** o el rastreo público
`SCM-BO-2026-007`; los cambios llegan por WebSocket y no requieren recargar.
Las ubicaciones son telemetría demostrativa. En producción, el mismo endpoint puede
recibir posiciones de un GPS o proveedor telemático autenticado.

## Recuperación y cuidado de datos

- `docker compose down` detiene el sistema y conserva la base.
- `docker compose pull` sólo descarga imágenes; no borra información.
- No use `docker compose down -v` salvo que quiera eliminar definitivamente la base
  local y recrear todos los datos demostrativos.
- Si Git informa cambios locales, no los descarte: guárdelos en un commit o consulte
  al responsable antes de actualizar.
