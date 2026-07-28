# Guía completa de instalación de SCM Global

Esta guía cubre instalación local, operación diaria, desarrollo, actualización, copias de seguridad y publicación en un servidor.

## 1. Requisitos

La forma recomendada es Docker:

- Docker Desktop en Windows o macOS, o Docker Engine en Linux.
- Docker Compose v2, disponible mediante `docker compose`.
- Git.
- Al menos 2 GB de RAM libre y 2 GB de espacio en disco.
- Puertos locales libres: `8080`, `4000` y `5435`.

Verifique la instalación:

```bash
docker --version
docker compose version
git --version
```

Para desarrollo sin Docker también se requiere Node.js 20 o posterior y pnpm 9 o posterior.

## 2. Descargar el proyecto

```bash
git clone https://github.com/rolandobryanmunozante/scm-global.git
cd scm-global
```

La solución es un monorepositorio: frontend, backend, base de datos y orquestación Docker se versionan juntos para garantizar que una misma revisión sea compatible de extremo a extremo.

## 3. Configurar las variables de entorno

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux o macOS:

```bash
cp .env.example .env
```

Para una prueba local, los valores incluidos funcionan directamente. Antes de publicar el sistema cambie como mínimo:

```text
POSTGRES_PASSWORD=una-clave-larga-y-unica
JWT_SECRET=un-secreto-aleatorio-de-alta-entropia
WEB_ORIGIN=https://scm.midominio.com
```

Variables disponibles:

| Variable | Uso | Valor local |
|---|---|---|
| `POSTGRES_DB` | Nombre de la base de datos | `scm_global` |
| `POSTGRES_USER` | Usuario de PostgreSQL | `scm_user` |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL | `scm_password` |
| `POSTGRES_PORT` | Puerto local de PostgreSQL | `5435` |
| `BACKEND_PORT` | Puerto local directo de la API | `4000` |
| `WEB_PORT` | Puerto local de la aplicación | `8080` |
| `BACKEND_IMAGE` | Imagen publicada del backend | `ghcr.io/rolandobryanmunozante/scm-global-backend:latest` |
| `FRONTEND_IMAGE` | Imagen publicada del frontend | `ghcr.io/rolandobryanmunozante/scm-global-frontend:latest` |
| `JWT_SECRET` | Firma de los tokens de acceso | Debe cambiarse en producción |
| `WEB_ORIGIN` | Orígenes permitidos para CORS y Socket.IO | Frontend local |
| `SMTP_HOST` | Servidor de correo opcional | Vacío |
| `SMTP_PORT` | Puerto SMTP | `587` |
| `SMTP_USER` | Usuario SMTP opcional | Vacío |
| `SMTP_PASS` | Contraseña SMTP opcional | Vacío |
| `SMTP_FROM` | Remitente de notificaciones | `SCM Global <no-reply@scm.local>` |

El archivo `.env` está excluido de Git y no debe subirse al repositorio.

## 4. Iniciar el sistema

### Windows

Con Docker Desktop abierto:

```powershell
.\iniciar-scm.ps1
```

El script descarga las imágenes publicadas. Para construir una modificación desde
el código local use `.\iniciar-scm.ps1 -Build`.

Si PowerShell bloquea scripts locales:

```powershell
powershell -ExecutionPolicy Bypass -File .\iniciar-scm.ps1
```

### Linux y macOS

```bash
docker compose pull
docker compose up -d --no-build --wait
```

En Windows, `iniciar-scm.ps1` ejecuta estos mismos comandos:

```powershell
docker compose pull
docker compose up -d --no-build --wait
```

Las imágenes de backend y frontend se publican automáticamente en GitHub Container
Registry después de cada cambio aceptado en `main`. La primera ejecución crea
PostgreSQL 16, ejecuta las migraciones y carga datos de demostración.

Para desarrollar o comprobar una modificación local, reconstruya desde el código:

```bash
docker compose up -d --build --wait
```

Compruebe el estado:

```bash
docker compose ps
```

Los servicios `postgres`, `backend` y `frontend` deben indicar `healthy`. `migrate` debe aparecer como terminado correctamente (`Exited (0)`).

## 5. Acceder

- Aplicación: <http://localhost:8080>
- Salud del sistema mediante Nginx: <http://localhost:8080/api/health>
- API local directa: <http://localhost:4000/api>
- Rastreo de prueba: <http://localhost:8080/rastreo/SCM-BO-2026-001>
- PostgreSQL local: `localhost:5435`

Acceso administrativo inicial:

```text
Usuario: admin@scm.local
Contraseña: SCM2026!
```

Los demás usuarios de prueba están documentados en el README. Cambie estas credenciales antes de utilizar datos reales.

## 6. Operación diaria

Ver el estado:

```bash
docker compose ps
```

Ver registros de todos los servicios:

```bash
docker compose logs -f
```

Ver solamente un servicio:

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

Reiniciar:

```bash
docker compose restart
```

Detener conservando los datos:

```bash
docker compose down
```

En Windows también puede usar:

```powershell
.\detener-scm.ps1
```

## 7. Persistencia y reinicialización

PostgreSQL guarda los datos en un volumen administrado por Docker. `docker compose down` no elimina la información.

Para borrar toda la base y volver a cargar los datos demostrativos:

```bash
docker compose down -v
docker compose up -d --build
```

Advertencia: `down -v` elimina permanentemente la base de datos del proyecto.

## 8. Copias de seguridad

Crear una copia SQL:

```bash
docker compose exec -T postgres pg_dump -U scm_user -d scm_global > scm_global_backup.sql
```

Restaurar una copia en una base ya creada:

```bash
docker compose exec -T postgres psql -U scm_user -d scm_global < scm_global_backup.sql
```

Antes de restaurar, conserve una copia del estado actual y confirme que el archivo corresponde a la versión del esquema utilizada.

## 9. Actualizar desde GitHub

```bash
git pull
docker compose pull
docker compose up -d --no-build --wait
docker compose ps
```

Docker descarga únicamente las capas nuevas de las imágenes publicadas. Para probar
código local todavía no publicado use `docker compose up -d --build --wait`. No use
`down -v` durante una actualización normal.

## 10. Publicación con dominio y HTTPS

En el servidor:

1. Instale Docker Engine y el complemento Docker Compose.
2. Clone el repositorio y copie `.env.example` como `.env`.
3. Configure contraseñas fuertes y `WEB_ORIGIN` con el dominio HTTPS exacto.
4. Ejecute `docker compose pull` y `docker compose up -d --no-build --wait`.
5. Configure Nginx, Caddy, Traefik o el balanceador de la plataforma para enviar el dominio al puerto `8080`.
6. Exponga en el firewall únicamente `80` y `443`.

El contenedor frontend ya reenvía internamente `/api` y `/socket.io` al backend. Los puertos `4000` y `5435` se enlazan a `127.0.0.1`, por lo que no quedan publicados hacia Internet.

Ejemplo conceptual para un proxy Nginx instalado en el servidor:

```nginx
server {
    listen 443 ssl;
    server_name scm.midominio.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

El certificado y sus rutas dependen del proveedor. Use un certificado válido, por ejemplo mediante Let's Encrypt.

## 11. Desarrollo sin Docker

Mantenga PostgreSQL de Docker iniciado y ejecute:

```bash
pnpm install
pnpm dev
```

Servicios de desarrollo:

- Vite: <http://localhost:5173>
- API: <http://localhost:4000/api>
- PostgreSQL: `localhost:5435`

Validación completa:

```bash
pnpm check
```

Este comando ejecuta verificación estricta de TypeScript, pruebas automatizadas y compilaciones de producción.

## 12. Solución de problemas

### Docker Desktop no está iniciado

Abra Docker Desktop y espere a que indique que el motor está listo. Después vuelva a ejecutar el arranque.

### Un puerto está ocupado

Identifique el proceso que utiliza `8080`, `4000` o `5435`. El puerto de PostgreSQL puede cambiarse con `POSTGRES_PORT` en `.env`. Si cambia los puertos web, actualice también la configuración de publicación correspondiente.

### Un contenedor no está saludable

```bash
docker compose ps
docker compose logs --tail 200 backend
docker compose logs --tail 200 postgres
docker compose logs --tail 200 frontend
```

### Agregué una migración pero no se ejecutó

Cada archivo nuevo de `database/migrations` debe tener un prefijo numérico superior y no debe reutilizar el nombre de una migración aplicada. El servicio `migrate` lo ejecuta en el siguiente `docker compose up`. Consulte:

```bash
docker compose logs migrate
docker compose exec -T postgres psql -U scm_user -d scm_global -c "TABLE schema_migrations"
```

No edite una migración aplicada ni use `down -v` durante una actualización normal.

### No llegan correos

Complete todas las variables `SMTP_*` de `.env` y reinicie el backend:

```bash
docker compose up -d --force-recreate backend
```

Sin SMTP configurado, la aplicación conserva las notificaciones internas y registra la salida de correo para desarrollo.
