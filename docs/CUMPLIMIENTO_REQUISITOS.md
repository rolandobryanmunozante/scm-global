# Matriz de cumplimiento del documento del proyecto

Fecha de revisión: 27 de julio de 2026.

Esta matriz contrasta el documento **Sistema Global de Gestión de la Cadena de Suministro** con el código, la base de datos y los flujos verificables del repositorio. La prioridad alta constituye el MVP. Las funciones externas o experimentales se mantienen identificadas para no confundir una interfaz demostrativa con una integración real.

## Resultado ejecutivo

- Las 10 historias de prioridad alta están implementadas de extremo a extremo.
- Se implementaron 5 historias de prioridad media; 2 tienen cobertura parcial y 2 requieren servicios o productos externos.
- La trazabilidad completa de producto, aunque era prioridad baja, está implementada.
- Las relaciones operativas compra–envío–inventario ahora son transaccionales y auditables.
- Los nueve roles demostrativos fueron probados tanto para accesos permitidos como denegados.
- Las funciones no implementadas no son necesarias para operar el MVP y permanecen explícitamente fuera del alcance actual.

## Historias de usuario

| ID | Historia | Estado | Evidencia funcional |
|---|---|---|---|
| HU-01 | Gestión de proveedores | Cumple | Alta, consulta, edición, baja y reactivación lógica; validación de datos y permisos. |
| HU-02 | Calificación de proveedores | Cumple | Evaluación ponderada, promedio, comentarios e historial visible por proveedor. |
| HU-03 | Movimientos de inventario | Cumple | Entradas/salidas transaccionales, stock previo/resultante, usuario, motivo, referencia y auditoría. |
| HU-04 | Consulta de stock por producto y almacén | Cumple | Búsqueda, filtros, stock global, reservado, disponible y semáforo de mínimos. |
| HU-05 | Órdenes de compra automáticas | Cumple | Detección de mínimos, proveedor por categoría/calificación, cantidad sugerida, aprobación y notificación. |
| HU-06 | Planificación de rutas | Cumple | Origen, destino, escala, modo, distancia, duración, mapa, aduana, edición y baja lógica. |
| HU-07 | Asignación de transporte | Cumple | Compatibilidad de capacidad/modo, licencia vigente, conflictos de vehículo/conductor y notificación. |
| HU-08 | Rastreo en tiempo real | Cumple | Código público, eventos, ubicación, evidencia, Socket.IO, historial y recálculo de ETA. |
| HU-09 | Autenticación y acceso por roles | Cumple | bcrypt 12, JWT de 30 minutos, inactividad, refresco activo, bloqueo, recuperación, revocación y permisos actuales consultados en base. |
| HU-10 | Dashboard global | Cumple | Seis KPI, tres gráficos, país/categoría/fechas y actualización cada diez minutos. |
| HU-11 | Incumplimiento de proveedores | Cumple | Detección programada/manual, notificación interna/correo y penalización registrada en evaluación. |
| HU-12 | Transferencias de stock | Cumple | Salida en origen, estado en tránsito, recepción en destino y doble movimiento trazable. |
| HU-13 | Integración con aduanas | Pendiente externo | Se detecta cruce internacional y se alerta que requiere aduana; no se simula una API gubernamental inexistente. |
| HU-14 | Aplicación móvil para transportistas | Parcial | Vista web adaptable y restringida al conductor; no existe aplicación nativa ni operación offline. |
| HU-15 | Mapa global de envíos | Cumple | Envíos activos, estado, ubicación, conductor, vehículo y búsqueda sobre mapa. |
| HU-16 | Exportación PDF y Excel | Cumple | Exportaciones filtradas; XLSX válido con resumen/detalle y PDF paginado. |
| HU-17 | Portal de proveedores | Cumple | Aislamiento por proveedor, órdenes propias, fecha comprometida y documento. |
| HU-18 | Multimoneda | Pendiente | El modelo actual opera en bolivianos; requiere fuente de tipos de cambio y reglas contables. |
| HU-19 | Soporte multiidioma | Parcial | Infraestructura i18next y navegación ES/EN/PT; el contenido operativo detallado continúa en español. |
| HU-20 | Predicción de demanda | Fuera del MVP | Requiere datos históricos suficientes, modelo, evaluación y gobierno de predicciones. |
| HU-21 | Simulación de escenarios | Fuera del MVP | No implementada. |
| HU-22 | Trazabilidad completa de producto | Cumple | Une órdenes, movimientos, envíos y eventos cronológicos por producto. |
| HU-23 | Integración ERP | Pendiente externo | Requiere contrato de API, credenciales y mapeo con el ERP corporativo real. |
| HU-24 | Correo y aplicación/push | Parcial | Notificación interna y correo respetan preferencias; el permiso del navegador existe, pero Web Push persistente requiere VAPID y service worker. |
| HU-25 | Huella de carbono | Fuera del MVP | Requiere factores de emisión oficiales por modo, ruta, carga y jurisdicción. |

## Roles y separación de funciones

| Rol | Funciones principales |
|---|---|
| Administrador | Usuarios, roles efectivos, catálogos, configuración y acceso total. |
| Responsable de Compras | Proveedores, evaluaciones, creación/aprobación de órdenes y seguimiento. |
| Responsable de Inventario | Stock, movimientos, transferencias, catálogos y recepción de compras. |
| Responsable de Logística | Rutas, flota, creación/asignación de envíos, mapa y reportes operativos. |
| Transportista | Solo sus envíos asignados y sus eventos de transporte. |
| Gerente | Indicadores, consultas globales, reportes y auditoría de lectura. |
| Cliente | Rastreo por código; no accede al listado interno de todos los envíos. |
| Proveedor | Solo las órdenes asociadas a su `supplier_id`. |
| Auditor | Reportes, trazabilidad y bitácora; sin mutaciones operativas. |

Los tokens no conservan permisos obsoletos: cada petición valida que el usuario siga activo, que la versión de autenticación sea vigente y recupera los permisos efectivos desde PostgreSQL.

## Coherencia de datos añadida

- Una orden recibida exige usuario, fecha y almacén de recepción.
- Un envío de compra copia exactamente los productos/cantidades de su orden y una orden solo puede vincularse a un envío.
- Un envío de distribución reserva stock al crearse y lo descuenta al asignarse el transporte.
- Una entrega dirigida a un almacén crea los movimientos de entrada correspondientes.
- Los cambios de inventario, compras, usuarios, rutas, flota y proveedores se registran en auditoría.
- `database/verify.sql` comprueba permisos, licencias, vínculos, detalles obligatorios, stock y coincidencia orden–envío.

## Límites conscientes

No se presentan como terminadas las integraciones de aduana, ERP, multimoneda, machine learning, simulación, aplicación nativa, Web Push persistente o carbono. Cada una necesita una fuente externa, reglas de negocio adicionales o un producto cliente separado. Implementarlas sin esos contratos produciría datos ficticios y reduciría la confiabilidad del sistema.
