# Manual completo de SCM Global

Versión del manual: 1.1  
Aplicación: SCM Global  
Público: usuarios operativos, expositores, administradores y equipo técnico

## 1. Propósito del sistema

SCM Global centraliza las tareas principales de una cadena de suministro:

- proveedores y sus catálogos;
- órdenes de compra;
- inventario por producto y almacén;
- rutas terrestres, marítimas y aéreas;
- vehículos, transportistas y cargas;
- rastreo, ubicación, incidencias y retrasos;
- reportes PDF y Excel;
- notificaciones, seguridad y auditoría.

La regla central es la correlación: una pantalla no representa un proceso separado.
Una orden, su envío, los eventos del conductor, la recepción y los movimientos de
inventario conservan referencias entre sí.

## 2. Acceso inicial

Con el sistema levantado, abra:

- aplicación: <http://localhost:8080>;
- salud de la API: <http://localhost:4000/api/health>;
- rastreo público: <http://localhost:8080/rastreo>.

Cuenta administrativa inicial:

```text
Usuario: admin@scm.local
Contraseña: SCM2026!
```

Todas las cuentas demostrativas utilizan `SCM2026!`. Estas credenciales son para
presentación y capacitación. Deben cambiarse antes de usar información real.

## 3. Perfiles y responsabilidades

| Rol | Responsabilidad | No debe hacer |
|---|---|---|
| Administrador | Usuarios, roles, configuración y supervisión integral. | Sustituir la validación física u operativa de otros responsables. |
| Compras | Proveedores, catálogos, calificaciones y órdenes. | Recibir stock o asignar transporte. |
| Proveedor | Confirmar las órdenes dirigidas a su empresa. | Ver otros proveedores, inventario o transporte interno. |
| Logística | Rutas, cargas, flota y asignaciones. | Aprobar compras o ingresar stock manualmente. |
| Transportista | Aceptar y ejecutar cargas asignadas. | Ver cargas ajenas o confirmar inventario. |
| Inventario | Existencias, movimientos, almacenes y recepción física. | Aprobar compras o conducir cargas. |
| Gerencia | Indicadores, reportes y decisiones. | Modificar la operación. |
| Auditor | Evidencia, trazabilidad y bitácora. | Crear o editar registros operativos. |
| Cliente | Consultar un envío mediante su código. | Acceder a módulos internos. |

El menú se adapta al rol. La API vuelve a comprobar los permisos en cada petición;
por ello ocultar una opción en la interfaz no es el único control de seguridad.

## 4. Cuentas de demostración

### 4.1 Cuentas principales

| Rol | Usuario |
|---|---|
| Administrador | `admin@scm.local` |
| Compras | `compras@scm.local` |
| Inventario | `inventario@scm.local` |
| Logística | `logistica@scm.local` |
| Transportista | `transportista@scm.local` |
| Gerencia | `gerente@scm.local` |
| Cliente | `cliente@scm.local` |
| Auditor | `auditor@scm.local` |

### 4.2 Portales de proveedor

| Proveedor | Cuenta principal | Cuenta alterna |
|---|---|---|
| Andes Tech Supply | `proveedor@scm.local` | `proveedor.andes.alterno@scm.local` |
| Brasil Components | `proveedor.brasil@scm.local` | `proveedor.brasil.alterno@scm.local` |
| Pacífico Foods | `proveedor.pacifico@scm.local` | `proveedor.pacifico.alterno@scm.local` |
| Salud Global | `proveedor.salud@scm.local` | `proveedor.salud.alterno@scm.local` |

### 4.3 Cuentas de respaldo operativo

- Administrador: `admin.coordinacion@scm.local`.
- Compras: `compras.andina@scm.local`, `compras.internacional@scm.local`.
- Inventario: `inventario.lapaz@scm.local`, `inventario.santacruz@scm.local`.
- Logística: `logistica.nacional@scm.local`, `logistica.internacional@scm.local`.
- Gerencia: `gerencia.operaciones@scm.local`, `gerencia.regional@scm.local`.
- Cliente: `cliente.distribucion@scm.local`, `cliente.corporativo@scm.local`.
- Auditoría: `auditor.calidad@scm.local`, `auditor.procesos@scm.local`.
- Transportistas libres: desde `transportista.libre01@scm.local` hasta
  `transportista.libre08@scm.local`.

Una instalación nueva contiene al menos dos cuentas activas por rol, trece
transportistas y una reserva de vehículos terrestres, marítimos y aéreos.

## 5. Navegación y apariencia

La barra lateral contiene los módulos habilitados para el perfil actual. En la parte
superior se encuentran:

- botón de tema claro u oscuro;
- selector de idioma;
- notificaciones;
- identificación del usuario;
- cierre de sesión.

El tema se recuerda en el navegador. Los formularios, tablas, tarjetas, reportes,
estados, modales, mapas y la demo automática tienen estilos específicos para tema
oscuro.

La sesión expira después de inactividad. Cinco intentos fallidos pueden bloquear
temporalmente la cuenta.

## 6. Dashboard

Disponible para Administrador, Gerencia y otros perfiles con permiso de reportes.

Muestra:

- ventas del período;
- valor del inventario;
- envíos activos;
- envíos retrasados;
- órdenes pendientes;
- proveedor mejor calificado;
- ventas por país;
- evolución mensual;
- stock por categoría.

Los filtros de fecha, país y categoría cambian el mismo conjunto de información que
alimenta los gráficos. Use **Actualizar** después de modificar filtros.

## 7. Proveedores y catálogos

### 7.1 Consultar proveedores

Abra **Proveedores**. Puede buscar por nombre, código o país y revisar:

- categoría;
- contacto;
- puntuación;
- productos incluidos en el catálogo;
- estado activo.

### 7.2 Crear o editar

Use **Nuevo proveedor** o el botón de edición. Los identificadores fiscales y
códigos no pueden duplicarse.

### 7.3 Catálogo

Cada proveedor debe tener productos asociados. Una orden sólo puede incorporar
productos del catálogo del proveedor elegido.

Si cambia de proveedor mientras crea una orden, el sistema limpia los productos que
ya no son válidos.

### 7.4 Calificación

Compras puede registrar puntualidad, calidad, precio y comentario. La puntuación
ponderada se calcula automáticamente.

## 8. Órdenes de compra

### 8.1 Crear una orden

1. Inicie sesión como Compras.
2. Abra **Órdenes de compra**.
3. Pulse **Nueva orden**.
4. Seleccione el proveedor.
5. Agregue productos desde su catálogo.
6. Indique cantidades y fecha esperada.
7. Guarde la orden.

La orden comienza en `BORRADOR`.

### 8.2 Aprobar

Compras revisa productos, cantidades y destino previsto, y luego aprueba. El estado
pasa a `APROBADA`.

### 8.3 Confirmar como proveedor

1. Cierre la sesión de Compras.
2. Inicie sesión con la cuenta del proveedor seleccionado.
3. Abra **Portal del proveedor**.
4. Indique fecha comprometida y documento comercial.
5. Confirme.

La orden pasa a `CONFIRMADA`. Todavía no aumenta el inventario.

### 8.4 Estados de una compra

```text
BORRADOR → APROBADA → CONFIRMADA → ENVIADA → RECIBIDA
```

- `ENVIADA` se establece cuando el conductor acepta la carga.
- `RECIBIDA` se establece cuando Inventario confirma la recepción física.
- Una orden cancelada no puede continuar.

## 9. Inventario

### 9.1 Interpretar cantidades

- **Actual**: unidades físicamente registradas.
- **Reservado**: unidades comprometidas para una distribución preparada o asignada.
- **Disponible**: actual menos reservado.
- **Mínimo**: umbral configurado para alerta.

Una reserva no es una ubicación oculta. Puede pulsarse para consultar el envío que la
originó. La reserva evita comprometer las mismas unidades en dos cargas.

### 9.2 Movimientos

Los movimientos indican producto, almacén, tipo, cantidad, usuario, motivo y
referencia. Son inmutables: no se editan ni eliminan.

### 9.3 Transferencias

Las transferencias manuales relacionan almacén de origen, destino y productos. Para
traslados con transporte se recomienda el flujo de distribución, porque incorpora
ruta, vehículo, conductor, telemetría y recepción.

### 9.4 Catálogos internos

Inventario administra:

- productos;
- almacenes;
- límites mínimo y máximo;
- unidades y precios.

La desactivación es lógica para conservar el historial.

## 10. Rutas

### 10.1 Crear una ruta

1. Abra **Rutas** con un perfil de Logística.
2. Seleccione modo terrestre, marítimo o aéreo.
3. Elija origen y destino.
4. Agregue escalas si corresponde.
5. Defina propósito.
6. Revise distancia, duración y requisito aduanero.
7. Guarde.

Cada punto requiere nombre, país, latitud y longitud. El origen, escalas y destino no
pueden repetirse.

### 10.2 Propósitos

- `ENTRADA_COMPRA`: termina en un almacén de la empresa.
- `SALIDA_DISTRIBUCION`: parte de un almacén de la empresa.
- `AMBOS`: ambos extremos son almacenes y puede utilizarse en ambos sentidos
  operativos permitidos.

Una ruta internacional marca el requisito aduanero, pero no afirma conexión con una
API gubernamental.

## 11. Transporte y envíos

### 11.1 Crear una entrada de compra

Logística sólo puede seleccionar órdenes `CONFIRMADA` sin otro envío relacionado.
Elige una ruta de entrada y registra peso y volumen.

### 11.2 Crear una salida

Logística elige:

- ruta de distribución;
- almacén de origen;
- productos;
- cantidades disponibles;
- peso y volumen.

Al crearla, el envío queda `PREPARANDO` y se reserva el stock.

### 11.3 Asignar

El selector muestra únicamente:

- vehículos activos y libres;
- modo igual al de la ruta;
- capacidad suficiente de peso y volumen;
- conductores activos, libres y con licencia vigente.

La API repite todas estas validaciones. La asignación deja el envío `ASIGNADO`; no
inicia el viaje ni cambia todavía el stock físico.

### 11.4 Aceptar como transportista

El conductor asignado inicia sesión y pulsa **Aceptar carga**.

- La carga pasa a `EN_TRANSITO`.
- En una compra, la orden pasa a `ENVIADA`.
- En una distribución, se libera la reserva y se descuenta el almacén de origen.

### 11.5 Actualizar el recorrido

El conductor puede registrar:

- ubicación;
- escala;
- aduana;
- incidencia;
- retraso;
- resolución;
- arribo;
- entrega a cliente final.

La evidencia es una URL opcional hacia una fotografía o documento ya almacenado en
un servicio autorizado. No es obligatorio inventar una dirección.

Una incidencia exige tipo y descripción. Un retraso conserva minutos acumulados y
puede resolverse mediante el evento correspondiente.

### 11.6 Arribo y recepción

Si el destino es un almacén:

1. el conductor registra `ARRIBO`;
2. el envío queda `PENDIENTE_RECEPCION`;
3. el stock todavía no cambia;
4. Inventario revisa físicamente;
5. Inventario pulsa **Confirmar recepción**;
6. el envío pasa a `ENTREGADO`;
7. la orden pasa a `RECIBIDA`, si corresponde;
8. el destino aumenta y se registra el movimiento.

Si el destino es un cliente final sin almacén, el conductor puede cerrar con
`ENTREGA`.

## 12. Mapa global

El mapa muestra los envíos con coordenadas. Al seleccionar una carga:

- se enfoca su posición;
- aparece modo, vehículo y conductor;
- se distingue la frescura de la telemetría;
- se muestran incidencia, retraso y ETA.

Estados de posición:

- `EN VIVO`: señal reciente;
- `RECIENTE`: última señal dentro del margen operativo;
- `SIN ACTUALIZAR`: requiere comprobar telemetría.

Docker ejecuta una telemetría demostrativa cada 15 segundos. No representa un GPS
físico, pero usa el mismo endpoint autenticado que utilizaría una integración real.

## 13. Rastreo público

Abra **Rastreo público** o `/rastreo`.

Al escribir parte del código aparecen coincidencias. Seleccione una para consultar:

- origen y destino;
- carga;
- estado;
- ETA;
- ubicación;
- vehículo;
- historial de eventos;
- incidencias y evidencia.

La vista pública no expone todos los envíos internos ni permite modificarlos.

Códigos útiles:

- `SCM-BO-2026-001`: flujo completado;
- `SCM-BR-2026-003`: incidencia;
- `SCM-AR-2026-004`: retraso;
- `SCM-BO-2026-007`: tránsito y telemetría.

## 14. Reportes

### 14.1 Exportación

Debe indicar fecha inicial y final. Opcionalmente filtre:

- país;
- proveedor;
- producto;
- estado;
- almacén.

Formatos:

- PDF: portada, filtros, indicadores, detalle y paginación;
- Excel: hojas estructuradas, filtros y datos reutilizables.

### 14.2 Trazabilidad de producto

Permite seguir movimientos y referencias de un SKU a través de almacenes, compras y
envíos.

### 14.3 Auditoría

Muestra usuario, acción, entidad, identificador, fecha y detalles. El registro de
auditoría es inmutable.

## 15. Usuarios y seguridad

El Administrador puede:

- crear cuentas;
- seleccionar rol;
- vincular proveedor;
- registrar licencia para conductores;
- desactivar o reactivar;
- forzar cambio de contraseña;
- revisar último acceso.

Reglas importantes:

- no puede desactivarse a sí mismo;
- no puede eliminarse el último Administrador activo;
- un conductor activo requiere licencia vigente;
- un proveedor requiere `supplier_id`;
- cambiar rol, contraseña o estado invalida sesiones anteriores.

## 16. Notificaciones

El centro reúne mensajes operativos. Cada usuario puede marcar como leídos y
configurar preferencias por evento.

Sin SMTP, las notificaciones internas continúan funcionando. El correo externo
requiere variables `SMTP_*` en `.env`.

## 17. Guía operativa

La opción **Guía operativa** explica:

- funciones del perfil actual;
- límites por rol;
- compra entrante;
- distribución;
- siguiente responsable.

Es recomendable consultarla antes de ejecutar una presentación manual.

## 18. Demo automática

La opción **Demo automática** está disponible para perfiles con reportes.

Características:

- 14 diapositivas;
- los nueve roles;
- compra entrante;
- distribución;
- rastreo, mapa, reportes y auditoría;
- avance automático cada nueve segundos;
- pausa, anterior, siguiente y reinicio;
- pantalla completa;
- tema claro y oscuro;
- navegación con flechas y barra espaciadora;
- sólo lectura.

Esta demo no inicia sesión como otros usuarios ni crea registros. Es segura para una
presentación repetida. Para enseñar formularios reales, pause y siga la guía manual.

## 19. Instalación en Windows

Requisitos:

- Windows 10/11 de 64 bits;
- Docker Desktop;
- Git;
- virtualización habilitada;
- 2 GB de RAM libre como mínimo;
- puertos 8080, 4000 y 5435 libres.

```powershell
git clone https://github.com/rolandobryanmunozante/scm-global.git
cd scm-global
powershell -ExecutionPolicy Bypass -File .\iniciar-scm.ps1
```

El iniciador:

1. comprueba Docker y Compose;
2. crea `.env` si falta;
3. valida la configuración;
4. descarga imágenes;
5. crea PostgreSQL;
6. aplica migraciones;
7. espera servicios saludables;
8. ejecuta `database/verify.sql`;
9. muestra diagnóstico si algo falla.

## 20. Validar una instalación completamente nueva

La prueba aislada no toca la instalación principal:

```powershell
powershell -ExecutionPolicy Bypass -File .\probar-instalacion-limpia.ps1
```

Antes de publicar imágenes nuevas, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\probar-instalacion-limpia.ps1 -Build
```

La prueba crea un proyecto Docker y puertos temporales, verifica migraciones, salud,
login, integridad, conductores y vehículos disponibles, y elimina únicamente ese
entorno al terminar.

## 21. Operación diaria

```powershell
# Iniciar o actualizar
.\iniciar-scm.ps1

# Estado
docker compose ps

# Registros
docker compose logs -f

# Detener conservando datos
.\detener-scm.ps1
```

No use `docker compose down -v` en una actualización normal.

## 22. Copia de seguridad

```powershell
docker compose exec -T postgres pg_dump -U scm_user -d scm_global > scm_global_backup.sql
```

Compruebe que el archivo tenga contenido y guárdelo fuera de la carpeta del
repositorio.

## 23. Actualización

```powershell
git switch main
git pull --ff-only origin main
powershell -ExecutionPolicy Bypass -File .\iniciar-scm.ps1
```

El volumen se conserva y sólo se aplican migraciones pendientes.

## 24. Solución de problemas

### Docker no está listo

Abra Docker Desktop y espere el mensaje de motor activo.

### Puerto ocupado

Cambie `WEB_PORT`, `BACKEND_PORT` o `POSTGRES_PORT` en `.env`, o cierre el programa
que utiliza el puerto.

### Error de contraseña o rol de PostgreSQL

Suele indicar un volumen antiguo creado con credenciales distintas. Lea primero los
registros mostrados por `iniciar-scm.ps1`.

- Con datos importantes: no elimine el volumen; realice copia y recupere las
  credenciales originales.
- Instalación demostrativa descartable: consulte la sección de recuperación en
  `GUIA_INSTALACION.md`.

### Migración con error

```powershell
docker compose logs --tail 200 migrate
docker compose exec -T postgres psql -U scm_user -d scm_global -c "TABLE schema_migrations"
```

No marque manualmente una migración como aplicada.

### No hay transportistas disponibles

Compruebe:

- cuenta activa;
- licencia vigente;
- que no tenga otro envío activo;
- migración `014_demo_accounts_and_available_fleet.sql`;
- vehículos del mismo modo que la ruta.

### El tema oscuro se ve incorrecto

Actualice `main`, descargue las nuevas imágenes y fuerce una recarga con
`Ctrl+F5`. El tema se guarda por navegador.

### No hay posición en vivo

```powershell
docker compose ps telemetry-demo
docker compose logs --tail 100 telemetry-demo
```

La primera señal puede tardar hasta 15 segundos.

## 25. Integridad y límites

La base impide, entre otros casos:

- recibir dos veces una orden;
- recibir sin arribo;
- despachar sin reserva;
- asignar un recurso ocupado;
- asignar vehículo de modo diferente a la ruta;
- dejar un envío activo sin conductor o vehículo;
- asociar productos fuera del catálogo del proveedor;
- crear rutas con extremos incoherentes;
- modificar movimientos o auditoría.

Integraciones externas todavía no implementadas:

- aduana gubernamental;
- GPS físico;
- ERP;
- aplicación móvil nativa;
- firma digital certificada;
- correo sin configurar SMTP.

La interfaz distingue estas simulaciones para no presentar una integración
inexistente como real.

## 26. Glosario

- **ETA**: fecha y hora estimada de llegada.
- **Reserva**: stock comprometido, todavía físicamente en el origen.
- **Arribo**: llegada reportada por el conductor.
- **Recepción**: validación física de Inventario.
- **Telemetría**: coordenadas y tiempo de la última señal.
- **Incidencia**: evento que afecta la operación.
- **Trazabilidad**: relación verificable entre documentos, usuarios y movimientos.
- **Migración**: cambio incremental y versionado de la base de datos.
