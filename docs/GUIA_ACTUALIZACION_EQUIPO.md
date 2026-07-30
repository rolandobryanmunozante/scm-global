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
SQL que todavía no estén registradas en `schema_migrations`, inicia la telemetría
demostrativa, espera hasta que los servicios estén saludables y ejecuta la
verificación de integridad. No elimina el volumen ni los registros existentes.

Verifique el resultado:

```powershell
docker compose ps
pnpm.cmd verify:system
```

La migración `014_demo_accounts_and_available_fleet.sql` añade cuentas de respaldo,
ocho conductores libres y vehículos terrestres, marítimos y aéreos sin cambiar los
flujos históricos.

La aplicación queda en <http://localhost:8080> y la salud de la API en
<http://localhost:4000/api/health>.

## Comprobar una instalación nueva sin tocar la actual

```powershell
powershell -ExecutionPolicy Bypass -File .\probar-instalacion-limpia.ps1
```

Para probar cambios locales todavía no publicados:

```powershell
powershell -ExecutionPolicy Bypass -File .\probar-instalacion-limpia.ps1 -Build
```

El entorno aislado se elimina automáticamente después de validar base, login y
recursos disponibles.

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

La instalación Docker mantiene automáticamente las ubicaciones demostrativas
actualizadas cada 15 segundos. Por eso **Mapa global** muestra por separado los
envíos con ubicación disponible y las señales realmente recibidas en vivo.

Cuando trabaje sin Docker puede iniciar 12 ciclos manuales en una segunda terminal:

```powershell
pnpm.cmd demo:telemetry
```

Para mantener la simulación hasta presionar `Ctrl+C`:

```powershell
pnpm.cmd demo:telemetry -- --continuous
```

Abra simultáneamente **Mapa global**, **Transporte** o el rastreo público
`SCM-BO-2026-007`; los cambios llegan por WebSocket y no requieren recargar.
Las ubicaciones son telemetría demostrativa. En producción, el mismo endpoint puede
recibir posiciones de un GPS o proveedor telemático autenticado.

Para ver el proceso automático de Docker:

```powershell
docker compose logs -f telemetry-demo
```

## Demo operativa

Inicie el entorno aislado y reproducible:

```powershell
powershell -ExecutionPolicy Bypass -File .\iniciar-demo-en-vivo.ps1 -Reiniciar
```

Abra <http://localhost:8081>, ingrese como Administrador y seleccione
**Demo operativa**. Ejecuta 18 operaciones reales con los nueve roles sin modificar
la base normal. Puede pausarse, detenerse y utilizarse a pantalla completa. El guion
completo está en `docs/GUIA_PRESENTACION_DEMO.md`.

## Recuperación y cuidado de datos

- `docker compose down` detiene el sistema y conserva la base.
- `docker compose pull` sólo descarga imágenes; no borra información.
- No use `docker compose down -v` salvo que quiera eliminar definitivamente la base
  local y recrear todos los datos demostrativos.
- Si Git informa cambios locales, no los descarte: guárdelos en un commit o consulte
  al responsable antes de actualizar.
