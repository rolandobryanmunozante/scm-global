# Despliegue de SCM Global en Render

Esta guía publica el sistema completo con una única URL HTTPS. El código sigue
alojado en GitHub y Render actualiza la aplicación desde la rama `main` después
de que las verificaciones automáticas hayan pasado.

## Arquitectura publicada

- Un servicio web Docker ejecuta React, Express, Socket.IO y la telemetría.
- PostgreSQL se administra como una base de datos separada de Render.
- `render.yaml` conecta los servicios sin exponer credenciales.
- `Dockerfile.render` compila frontend y backend en una sola imagen.
- `scripts/render-entrypoint.sh` aplica migraciones idempotentes antes de
  iniciar el servidor.
- El frontend consume `/api` y `/socket.io` desde el mismo origen HTTPS.

## Crear el Blueprint

1. Inicie sesión en <https://dashboard.render.com> con la cuenta de GitHub que
   tiene acceso a `rolandobryanmunozante/scm-global`.
2. Seleccione **New > Blueprint**.
3. Elija el repositorio `scm-global`.
4. Confirme la rama `main` y la ruta predeterminada `render.yaml`.
5. Revise que se creen `scm-global-umsa` y `scm-global-db`.
6. Confirme la creación y espere a que el despliegue indique **Live**.

Render genera `JWT_SECRET` y la contraseña de PostgreSQL. Ninguno de esos
valores debe copiarse al repositorio.

## Verificación posterior

Reemplace `<URL_RENDER>` por la URL mostrada en el panel:

```powershell
Invoke-RestMethod <URL_RENDER>/api/health
```

La respuesta correcta contiene:

```json
{
  "status": "ok",
  "database": true
}
```

Después compruebe:

1. Acceso con `admin@scm.local` y `SCM2026!`.
2. Dashboard, proveedores, inventario, compras, rutas y transporte.
3. Mapa global con posiciones **EN VIVO**.
4. Rastreo público `SCM-BR-2026-003`.
5. Exportación PDF y Excel con fechas seleccionadas.
6. Demo operativa y participación de los nueve roles.

Para ejecutar las verificaciones de API contra Render:

```powershell
$env:SCM_API_URL="<URL_RENDER>/api"
pnpm verify:system
pnpm verify:workflows
pnpm verify:demo
```

Estas verificaciones crean datos demostrativos correlacionados. Ejecútelas
solamente contra una base destinada a demostración.

## Actualizaciones

El servicio usa `autoDeployTrigger: checksPass`. Un cambio nuevo en `main` se
publica únicamente después de que GitHub Actions complete correctamente las
pruebas del repositorio.

Las migraciones se ejecutan antes de cada arranque y se registran en
`schema_migrations`, por lo que una migración aplicada no vuelve a ejecutarse.

## Plan gratuito

La configuración inicial usa los planes gratuitos para evitar cargos
automáticos. El servicio web puede suspenderse cuando no recibe visitas y el
primer acceso posterior puede tardar aproximadamente un minuto. La base
PostgreSQL gratuita de Render caduca después de 30 días; para conservar el
sistema y sus datos debe actualizarse a un plan persistente antes de esa fecha.

Esta publicación contiene exclusivamente datos académicos de demostración. No
se deben registrar datos personales, documentos reales ni credenciales
corporativas mientras el acceso administrativo de demostración sea público.
