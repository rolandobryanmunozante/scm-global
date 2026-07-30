# Guía de roles y flujos de datos

Esta guía explica quién realiza cada acción y qué tablas cambian. La misma explicación
está disponible dentro del frontend en **Guía operativa**.

## Regla principal de rutas y transporte

Una ruta siempre se lee de izquierda a derecha:

```text
ORIGEN (el vehículo sale)  →  DESTINO (el vehículo llega)
```

El propósito evita utilizarla en el flujo incorrecto:

| Propósito | Interpretación |
|---|---|
| `ENTRADA_COMPRA` | El vehículo recoge una compra en el proveedor o punto de origen y llega a un almacén propio. |
| `SALIDA_DISTRIBUCION` | El vehículo sale de un almacén propio hacia otro almacén o un cliente final. |
| `AMBOS` | La plantilla puede utilizarse para cualquiera de los dos flujos. |

El propósito no invierte la flecha. Si se necesita el recorrido contrario debe crearse
otra ruta con origen y destino intercambiados.

## Responsabilidad por perfil

| Perfil | Se encarga de | No puede hacer |
|---|---|---|
| Administrador | Usuarios, roles y supervisión completa. | No sustituye la validación operativa de cada responsable. |
| Compras | Proveedores, calificaciones, creación y aprobación de órdenes. | Recibir stock, crear rutas o asignar camiones. |
| Inventario | Productos, almacenes, recepciones, movimientos y transferencias. | Aprobar compras o administrar transporte. |
| Logística | Rutas, envíos, flota, capacidad y asignación de conductores. | Modificar órdenes o ajustar stock manualmente. |
| Transportista | Aceptar sus asignaciones y reportar ubicación, aduana, retraso, incidencia, resolución y arribo. | Ver envíos ajenos, asignarse un vehículo o ingresar stock. |
| Gerencia | Dashboard, reportes, trazabilidad y auditoría. | Modificar la operación. |
| Proveedor | Ver únicamente sus órdenes, confirmar fecha y documento. | Ver inventario, otros proveedores o flota interna. |
| Auditor | Reportes, exportaciones, trazabilidad y bitácora. | Crear o modificar datos operativos. |
| Cliente | Rastreo por código, ETA y eventos públicos. | Entrar a módulos internos. |

## Ejemplo A: compra que llega a la empresa

Objetivo: demostrar que una orden aprobada termina aumentando el stock del almacén
receptor sin descontar ningún almacén de origen.

1. Inicie sesión como `compras@scm.local`.
2. En **Órdenes de compra**, cree una orden para un proveedor y agregue productos.
3. Apruebe la orden. Su estado cambia de `BORRADOR` a `APROBADA`.
4. Inicie sesión como `proveedor@scm.local` y, en **Portal proveedor**, confirme fecha
   y documento. El proveedor solo verá órdenes asociadas a su cuenta.
5. Inicie sesión como `logistica@scm.local`.
6. En **Rutas**, cree o seleccione una ruta de propósito **Llegada de compra** o
   **Uso mixto**. El destino debe corresponder al almacén que recibirá.
7. En **Transporte**, pulse **Nuevo envío**, elija **Entrada de compra**, la ruta, la
   orden confirmada y el almacén receptor.
8. El sistema copia los productos desde `purchase_order_items` a `shipment_items`.
   No existe almacén de salida porque la mercadería proviene del proveedor.
9. Asigne vehículo y transportista. El envío queda `ASIGNADO`; todavía no sale ni
   cambia el stock.
10. Como transportista, pulse **Aceptar carga**. El envío pasa a `EN_TRANSITO` y la
    orden a `ENVIADA`.
11. Al llegar, el transportista registra **Arribo al almacén**. El envío queda
    `PENDIENTE_RECEPCION`; el stock todavía no aumenta.
12. Como Inventario, revise físicamente la carga y pulse **Confirmar recepción**.
    En una sola transacción la orden pasa a `RECIBIDA`, se crean movimientos
    `ENTRADA/COMPRA`, aumenta el stock y el envío queda `ENTREGADO`.

Relaciones esperadas:

```text
supplier
  └─ purchase_order
       ├─ purchase_order_items ── products
       └─ shipment (flow_type=ENTRADA_COMPRA)
            ├─ route (ENTRADA_COMPRA o AMBOS)
            ├─ destination_warehouse
            ├─ shipment_items ── products
            └─ shipment_events

delivery
  ├─ purchase_order.status = RECIBIDA
  ├─ stocks[destination] += cantidades
  └─ inventory_movements = ENTRADA / COMPRA
```

No existe recepción directa de una orden. El backend exige confirmación del proveedor,
envío, asignación, aceptación del conductor y arribo antes de permitir que Inventario
registre existencias. Así ningún rol puede saltarse el relevo anterior.

La asignación exige además que el modo del vehículo sea igual al modo de la ruta.
Una ruta terrestre no muestra ni acepta contenedores marítimos o carga aérea.

## Ejemplo B: distribución que sale de la empresa

Objetivo: demostrar reserva, despacho y recepción relacionada entre almacenes.

1. Inicie sesión como `logistica@scm.local`.
2. En **Rutas**, cree o seleccione una ruta de propósito **Salida de distribución**
   o **Uso mixto**, con un almacén en el origen.
3. En **Transporte**, cree un envío de **Salida de distribución** y seleccione
   almacén de salida, producto, cantidad y destino.
4. Al crearlo, `current_quantity` no cambia y `reserved_quantity` aumenta. Esto
   impide prometer las mismas unidades a otro envío.
5. Asigne vehículo y conductor. El backend comprueba capacidad, disponibilidad y
   licencia, pero conserva la reserva y deja el envío `ASIGNADO`.
6. Como transportista, pulse **Aceptar carga**. En ese momento disminuye
   `current_quantity`, se libera la reserva y se registra `SALIDA/DESPACHO`.
7. Si el destino es otro almacén, publique **Arribo**; el envío queda esperando a
   Inventario sin sumar existencias. Inventario confirma luego
   `ENTRADA/TRASLADO_ENVIO`. Si el destino es cliente final, el transportista publica
   **Entrega** y no se suma a ningún almacén.

Relaciones esperadas:

```text
stocks[origin]
  └─ shipment (flow_type=SALIDA_DISTRIBUCION)
       ├─ route (SALIDA_DISTRIBUCION o AMBOS)
       ├─ vehicle
       ├─ driver
       ├─ shipment_items ── products
       └─ shipment_events

creation         → reserved_quantity += cantidad
assignment       → shipment.status = ASIGNADO; stock sin cambios
driver_acceptance→ current_quantity -= cantidad; reserved_quantity -= cantidad
arrival          → shipment.status = PENDIENTE_RECEPCION; destino sin cambios
inventory_receive→ stocks[destination] += cantidad; shipment.status = ENTREGADO
```

## Verificación desde la interfaz

| Comprobación | Dónde observarla |
|---|---|
| La ruta indica salida y llegada | **Rutas**, mapa y tarjeta de plantilla. |
| Solo aparecen rutas compatibles | **Transporte → Nuevo envío** después de elegir el tipo. |
| Compra y proveedor vinculados | Tarjeta de envío y **Trazabilidad de producto**. |
| Reserva y descuento de salida | **Inventario**, stock disponible y movimientos. |
| Entrada en destino | **Inventario**, almacén receptor y movimientos. |
| Eventos y entrega | **Transporte**, **Mapa global** y rastreo público. |
| Acciones por usuario | **Reportes → Auditoría**. |
| Exportación por proveedor | **Reportes**, busque por nombre/código/país y selecciónelo. |

## Verificación técnica automatizada

En una base de pruebas:

```powershell
pnpm check
pnpm verify:system
pnpm verify:workflows
docker compose exec -T postgres psql -U scm_user -d scm_global -v ON_ERROR_STOP=1 -f /database/verify.sql
```

Para comenzar desde una base completamente vacía sin tocar la instalación actual:

```powershell
.\probar-instalacion-limpia.ps1 -Build
```

`verify:workflows` crea registros de prueba. No debe ejecutarse en una base de
producción. `verify.sql` es de solo lectura y comprueba, entre otras reglas, que cada
envío tenga productos, que el stock no sea negativo y que propósito, tipo de flujo,
orden y almacenes sean consistentes.

La instalación demostrativa mantiene ocho conductores de respaldo libres y vehículos
adicionales por modo para que los escenarios históricos no bloqueen una nueva
asignación durante la exposición.
