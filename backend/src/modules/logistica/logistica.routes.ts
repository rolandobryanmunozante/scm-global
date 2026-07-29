import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/async-handler.js";
import { authenticate, requirePermission } from "../../shared/auth.js";
import { audit } from "../../shared/audit.js";
import { pool } from "../../shared/db.js";
import { AppError } from "../../shared/errors.js";
import { estimateDuration, routeDistance, type Coordinate } from "../../shared/geo.js";
import { emitEvent, emitShipmentEvent } from "../../shared/realtime.js";

const router = Router();
router.use(authenticate);
const coordinateSchema = z.object({
  name: z.string().trim().min(2).max(150),
  country: z.string().trim().min(2).max(80),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
const routeSchema = z.object({
  name: z.string().trim().min(3).max(120),
  origin: coordinateSchema,
  destination: coordinateSchema,
  stops: z.array(coordinateSchema).max(8).default([]),
  transport_mode: z.enum(["TERRESTRE", "MARITIMO", "AEREO"]),
  purpose: z.enum(["ENTRADA_COMPRA", "SALIDA_DISTRIBUCION", "AMBOS"]).default("AMBOS"),
  is_template: z.boolean().default(true),
}).superRefine((value, context) => {
  const points = [value.origin, ...value.stops, value.destination];
  const uniquePoints = new Set(
    points.map((point) => `${point.name.toLocaleLowerCase()}|${point.lat}|${point.lng}`),
  );
  if (uniquePoints.size !== points.length) {
    context.addIssue({
      code: "custom",
      path: ["stops"],
      message: "El origen, las escalas y el destino deben ser ubicaciones diferentes",
    });
  }
});

router.get(
  "/rutas",
  requirePermission("routes.manage", "shipments.read"),
  asyncHandler(async (request, response) => {
    const active = z.enum(["true", "false", "all"]).default("true").parse(request.query.active);
    const result = await pool.query(
      `SELECT r.*, u.full_name AS created_by_name,
              (SELECT COUNT(*)::INTEGER FROM shipments s
               WHERE s.route_id=r.id AND s.flow_type='ENTRADA_COMPRA') AS inbound_shipments,
              (SELECT COUNT(*)::INTEGER FROM shipments s
               WHERE s.route_id=r.id AND s.flow_type='SALIDA_DISTRIBUCION') AS outbound_shipments
       FROM routes r JOIN users u ON u.id=r.created_by
       WHERE ($1='all' OR r.active=($1='true'))
       ORDER BY r.created_at DESC`,
      [active],
    );
    response.json(result.rows);
  }),
);

router.post(
  "/rutas",
  requirePermission("routes.manage"),
  asyncHandler(async (request, response) => {
    const input = routeSchema.parse(request.body);
    const points: Coordinate[] = [
      { lat: input.origin.lat, lng: input.origin.lng },
      ...input.stops.map(({ lat, lng }) => ({ lat, lng })),
      { lat: input.destination.lat, lng: input.destination.lng },
    ];
    const distance = Number(routeDistance(points).toFixed(2));
    const duration = Number(estimateDuration(distance, input.transport_mode).toFixed(2));
    const countries = new Set([
      input.origin.country.toLowerCase(),
      ...input.stops.map((stop) => stop.country.toLowerCase()),
      input.destination.country.toLowerCase(),
    ]);
    const warehouseIds = await findRouteWarehouses(input.origin, input.destination);
    validateRoutePurpose(input.purpose, warehouseIds);
    const result = await pool.query(
      `INSERT INTO routes(
        name,origin_name,origin_country,origin_latitude,origin_longitude,
        destination_name,destination_country,destination_latitude,destination_longitude,
        stops,transport_mode,estimated_distance_km,estimated_duration_hours,
        customs_required,is_template,created_by,origin_warehouse_id,destination_warehouse_id,purpose
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        input.name,
        input.origin.name,
        input.origin.country,
        input.origin.lat,
        input.origin.lng,
        input.destination.name,
        input.destination.country,
        input.destination.lat,
        input.destination.lng,
        JSON.stringify(input.stops),
        input.transport_mode,
        distance,
        duration,
        countries.size > 1,
        input.is_template,
        request.user!.id,
        warehouseIds.origin,
        warehouseIds.destination,
        input.purpose,
      ],
    );
    await audit(request, {
      action: "CREATE",
      entityType: "route",
      entityId: result.rows[0].id,
      details: { distance, duration, customsRequired: countries.size > 1 },
    });
    response.status(201).json(result.rows[0]);
  }),
);

router.put(
  "/rutas/:id",
  requirePermission("routes.manage"),
  asyncHandler(async (request, response) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const input = routeSchema.parse(request.body);
    const points: Coordinate[] = [
      { lat: input.origin.lat, lng: input.origin.lng },
      ...input.stops.map(({ lat, lng }) => ({ lat, lng })),
      { lat: input.destination.lat, lng: input.destination.lng },
    ];
    const distance = Number(routeDistance(points).toFixed(2));
    const duration = Number(estimateDuration(distance, input.transport_mode).toFixed(2));
    const countries = new Set([
      input.origin.country.toLowerCase(),
      ...input.stops.map((stop) => stop.country.toLowerCase()),
      input.destination.country.toLowerCase(),
    ]);
    const warehouseIds = await findRouteWarehouses(input.origin, input.destination);
    validateRoutePurpose(input.purpose, warehouseIds);
    if (input.purpose !== "AMBOS") {
      const incompatible = await pool.query(
        "SELECT COUNT(*)::INTEGER AS total FROM shipments WHERE route_id=$1 AND flow_type::TEXT<>$2",
        [id, input.purpose],
      );
      if (incompatible.rows[0].total > 0) {
        throw new AppError(
          409,
          "No puede cambiar el propósito: la ruta conserva envíos históricos del otro flujo",
        );
      }
    }
    const result = await pool.query(
      `UPDATE routes SET
       name=$2,origin_name=$3,origin_country=$4,origin_latitude=$5,origin_longitude=$6,
       destination_name=$7,destination_country=$8,destination_latitude=$9,destination_longitude=$10,
       stops=$11,transport_mode=$12,estimated_distance_km=$13,estimated_duration_hours=$14,
       customs_required=$15,is_template=$16,origin_warehouse_id=$17,destination_warehouse_id=$18,
       purpose=$19
       WHERE id=$1 RETURNING *`,
      [
        id,
        input.name,
        input.origin.name,
        input.origin.country,
        input.origin.lat,
        input.origin.lng,
        input.destination.name,
        input.destination.country,
        input.destination.lat,
        input.destination.lng,
        JSON.stringify(input.stops),
        input.transport_mode,
        distance,
        duration,
        countries.size > 1,
        input.is_template,
        warehouseIds.origin,
        warehouseIds.destination,
        input.purpose,
      ],
    );
    if (!result.rowCount) throw new AppError(404, "Ruta no encontrada");
    await audit(request, {
      action: "UPDATE",
      entityType: "route",
      entityId: id,
      details: { distance, duration },
    });
    response.json(result.rows[0]);
  }),
);

router.patch(
  "/rutas/:id/estado",
  requirePermission("routes.manage"),
  asyncHandler(async (request, response) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const { active } = z.object({ active: z.boolean() }).parse(request.body);
    if (!active) {
      const activeShipments = await pool.query(
        `SELECT COUNT(*)::INTEGER AS total
         FROM shipments
         WHERE route_id=$1 AND status<>'ENTREGADO'`,
        [id],
      );
      if (activeShipments.rows[0].total > 0) {
        throw new AppError(409, "No puede desactivar una ruta con envíos pendientes o en tránsito");
      }
    }
    const result = await pool.query(
      "UPDATE routes SET active=$2 WHERE id=$1 RETURNING id,active",
      [id, active],
    );
    if (!result.rowCount) throw new AppError(404, "Ruta no encontrada");
    await audit(request, {
      action: active ? "REACTIVATE" : "DEACTIVATE",
      entityType: "route",
      entityId: id,
    });
    response.json(result.rows[0]);
  }),
);

router.get(
  "/mapa-envios",
  requirePermission("shipments.read", "reports.read"),
  asyncHandler(async (request, response) => {
    const search = z.string().trim().max(100).default("").parse(request.query.search);
    const result = await pool.query(
      `SELECT s.id,s.tracking_code,s.origin,s.destination,s.status,s.current_latitude,
              s.current_longitude,s.eta_at,s.departure_at,r.transport_mode,r.name AS route,
              r.origin_latitude,r.origin_longitude,r.destination_latitude,r.destination_longitude,
              u.full_name AS driver,v.plate,v.type AS vehicle,v.last_position_at,
              (s.status='RETRASADO' OR s.eta_at<NOW()) AS is_delayed,
              GREATEST(s.delay_minutes,
                GREATEST(ROUND(EXTRACT(EPOCH FROM (NOW()-s.eta_at))/60),0)::INTEGER
              ) AS delay_minutes,
              CASE
                WHEN NOW()-COALESCE(v.last_position_at,s.updated_at) <= INTERVAL '15 minutes' THEN 'EN_VIVO'
                WHEN NOW()-COALESCE(v.last_position_at,s.updated_at) <= INTERVAL '60 minutes' THEN 'RECIENTE'
                ELSE 'SIN_ACTUALIZAR'
              END AS position_state,
              (SELECT COUNT(*)::INTEGER FROM shipment_items item
               WHERE item.shipment_id=s.id) AS item_count,
              (SELECT COALESCE(SUM(item.quantity),0)::INTEGER FROM shipment_items item
               WHERE item.shipment_id=s.id) AS cargo_units,
              (SELECT COUNT(*)::INTEGER FROM shipment_events event
               WHERE event.shipment_id=s.id AND event.event_type='INCIDENCIA') AS incident_count,
              (SELECT event.description FROM shipment_events event
               WHERE event.shipment_id=s.id ORDER BY event.created_at DESC LIMIT 1) AS latest_event
       FROM shipments s
       JOIN routes r ON r.id=s.route_id
       LEFT JOIN users u ON u.id=s.driver_id
       LEFT JOIN vehicles v ON v.id=s.vehicle_id
       WHERE s.status NOT IN ('ENTREGADO')
         AND ($1='' OR s.tracking_code ILIKE '%'||$1||'%' OR s.origin ILIKE '%'||$1||'%' OR s.destination ILIKE '%'||$1||'%')
       ORDER BY CASE WHEN s.status='RETRASADO' THEN 0 ELSE 1 END,s.eta_at`,
      [search],
    );
    response.json(result.rows);
  }),
);

router.post(
  "/envios",
  requirePermission("shipments.assign"),
  asyncHandler(async (request, response) => {
    const input = z
      .object({
        route_id: z.coerce.number().int().positive(),
        purchase_order_id: z.coerce.number().int().positive().nullable().optional(),
        origin_warehouse_id: z.coerce.number().int().positive().nullable().optional(),
        destination_warehouse_id: z.coerce.number().int().positive().nullable().optional(),
        total_weight_kg: z.coerce.number().positive(),
        total_volume_m3: z.coerce.number().positive(),
        items: z
          .array(
            z.object({
              product_id: z.coerce.number().int().positive(),
              quantity: z.coerce.number().int().positive(),
            }),
          )
          .max(100)
          .default([]),
      })
      .superRefine((value, context) => {
        if (!value.purchase_order_id && !value.origin_warehouse_id) {
          context.addIssue({
            code: "custom",
            message: "Debe indicar el almacén de origen",
            path: ["origin_warehouse_id"],
          });
        }
        if (!value.purchase_order_id && value.items.length === 0) {
          context.addIssue({
            code: "custom",
            message: "Debe incluir al menos un producto",
            path: ["items"],
          });
        }
        if (new Set(value.items.map((item) => item.product_id)).size !== value.items.length) {
          context.addIssue({
            code: "custom",
            message: "No puede repetir productos",
            path: ["items"],
          });
        }
      })
      .parse(request.body);
    const client = await pool.connect();
    const reservedProducts: number[] = [];
    try {
      await client.query("BEGIN");
      const route = await client.query("SELECT * FROM routes WHERE id=$1 AND active FOR SHARE", [
        input.route_id,
      ]);
      if (!route.rowCount) throw new AppError(404, "Ruta no encontrada o inactiva");
      const routeData = route.rows[0];
      const flowType = input.purchase_order_id ? "ENTRADA_COMPRA" : "SALIDA_DISTRIBUCION";
      if (routeData.purpose !== "AMBOS" && routeData.purpose !== flowType) {
        throw new AppError(
          400,
          flowType === "ENTRADA_COMPRA"
            ? "La ruta seleccionada es solo para salidas; elija una ruta de llegada de compra"
            : "La ruta seleccionada es solo para compras entrantes; elija una ruta de distribución",
        );
      }
      let shipmentItems = input.items;
      let originWarehouseId = input.origin_warehouse_id ?? routeData.origin_warehouse_id ?? null;
      let destinationWarehouseId =
        input.destination_warehouse_id ?? routeData.destination_warehouse_id ?? null;

      if (input.purchase_order_id) {
        const orderResult = await client.query(
          `SELECT * FROM purchase_orders
           WHERE id=$1 AND status='CONFIRMADA' AND supplier_confirmed_at IS NOT NULL
           FOR UPDATE`,
          [input.purchase_order_id],
        );
        if (!orderResult.rowCount) {
          throw new AppError(
            409,
            "El proveedor debe confirmar la orden antes de que Logística pueda crear el envío",
          );
        }
        const existing = await client.query(
          "SELECT 1 FROM shipments WHERE purchase_order_id=$1",
          [input.purchase_order_id],
        );
        if (existing.rowCount) throw new AppError(409, "La orden ya está vinculada a un envío");
        const orderItems = await client.query(
          "SELECT product_id,quantity FROM purchase_order_items WHERE purchase_order_id=$1",
          [input.purchase_order_id],
        );
        shipmentItems = orderItems.rows.map((item) => ({
          product_id: Number(item.product_id),
          quantity: Number(item.quantity),
        }));
        originWarehouseId = null;
        if (!destinationWarehouseId) {
          throw new AppError(400, "La recepción de una compra requiere un almacén de destino");
        }
      } else {
        if (!originWarehouseId) throw new AppError(400, "Debe indicar el almacén de origen");
        if (
          routeData.origin_warehouse_id &&
          Number(routeData.origin_warehouse_id) !== Number(originWarehouseId)
        ) {
          throw new AppError(400, "El almacén de origen no coincide con la ruta");
        }
        const warehouse = await client.query(
          "SELECT id FROM warehouses WHERE id=$1 AND active FOR SHARE",
          [originWarehouseId],
        );
        if (!warehouse.rowCount) throw new AppError(400, "El almacén de origen no está activo");
        for (const item of shipmentItems) {
          const stockResult = await client.query(
            `SELECT * FROM stocks
             WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE`,
            [item.product_id, originWarehouseId],
          );
          const stock = stockResult.rows[0];
          if (
            !stock ||
            Number(stock.current_quantity) - Number(stock.reserved_quantity) < item.quantity
          ) {
            throw new AppError(409, `Stock disponible insuficiente para el producto ${item.product_id}`);
          }
          await client.query(
            "UPDATE stocks SET reserved_quantity=reserved_quantity+$3,updated_at=NOW() WHERE product_id=$1 AND warehouse_id=$2",
            [item.product_id, originWarehouseId, item.quantity],
          );
          reservedProducts.push(item.product_id);
        }
      }

      if (
        destinationWarehouseId &&
        routeData.destination_warehouse_id &&
        Number(routeData.destination_warehouse_id) !== Number(destinationWarehouseId)
      ) {
        throw new AppError(400, "El almacén de destino no coincide con la ruta");
      }
      if (destinationWarehouseId) {
        const destinationWarehouse = await client.query(
          "SELECT id FROM warehouses WHERE id=$1 AND active FOR SHARE",
          [destinationWarehouseId],
        );
        if (!destinationWarehouse.rowCount) {
          throw new AppError(400, "El almacén de destino no existe o está inactivo");
        }
      }
      const code = `SCM-${new Date().getUTCFullYear()}-${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString("hex").toUpperCase()}`;
      const eta = new Date(Date.now() + Number(routeData.estimated_duration_hours) * 3_600_000);
      const shipment = await client.query(
        `INSERT INTO shipments(
          tracking_code,route_id,purchase_order_id,origin,destination,total_weight_kg,total_volume_m3,
          current_latitude,current_longitude,eta_at,origin_warehouse_id,destination_warehouse_id,
          inventory_reserved_at,flow_type
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [
          code,
          input.route_id,
          input.purchase_order_id ?? null,
          routeData.origin_name,
          routeData.destination_name,
          input.total_weight_kg,
          input.total_volume_m3,
          routeData.origin_latitude,
          routeData.origin_longitude,
          eta,
          originWarehouseId,
          destinationWarehouseId,
          input.purchase_order_id ? null : new Date(),
          flowType,
        ],
      );
      for (const item of shipmentItems) {
        await client.query(
          "INSERT INTO shipment_items(shipment_id,product_id,quantity) VALUES($1,$2,$3)",
          [shipment.rows[0].id, item.product_id, item.quantity],
        );
      }
      await client.query(
        `INSERT INTO shipment_events(shipment_id,user_id,event_type,status,description,latitude,longitude)
         VALUES($1,$2,'CREADO','PREPARANDO','Envío creado y pendiente de asignación',$3,$4)`,
        [
          shipment.rows[0].id,
          request.user!.id,
          routeData.origin_latitude,
          routeData.origin_longitude,
        ],
      );
      await audit(request, { action: "CREATE", entityType: "shipment", entityId: shipment.rows[0].id }, client);
      await client.query("COMMIT");
      emitShipmentEvent(shipment.rows[0].id, "shipment:created", shipment.rows[0]);
      if (originWarehouseId) {
        emitEvent("inventory", "stock:reserved", {
          shipmentId: shipment.rows[0].id,
          warehouseId: originWarehouseId,
          productIds: reservedProducts,
        });
      }
      response.status(201).json(shipment.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

export default router;

async function findRouteWarehouses(
  origin: z.infer<typeof coordinateSchema>,
  destination: z.infer<typeof coordinateSchema>,
): Promise<{ origin: number | null; destination: number | null }> {
  const result = await pool.query(
    `SELECT
       (SELECT id FROM warehouses
        WHERE active
          AND LOWER(country)=LOWER($1)
          AND (LOWER(name)=LOWER($2) OR LOWER(city)=LOWER($2))
        ORDER BY CASE WHEN LOWER(name)=LOWER($2) THEN 0 ELSE 1 END
        LIMIT 1) AS origin,
       (SELECT id FROM warehouses
        WHERE active
          AND LOWER(country)=LOWER($3)
          AND (LOWER(name)=LOWER($4) OR LOWER(city)=LOWER($4))
        ORDER BY CASE WHEN LOWER(name)=LOWER($4) THEN 0 ELSE 1 END
        LIMIT 1) AS destination`,
    [
      origin.country,
      origin.name,
      destination.country,
      destination.name,
    ],
  );
  return {
    origin: result.rows[0]?.origin ? Number(result.rows[0].origin) : null,
    destination: result.rows[0]?.destination ? Number(result.rows[0].destination) : null,
  };
}

function validateRoutePurpose(
  purpose: z.infer<typeof routeSchema>["purpose"],
  warehouses: { origin: number | null; destination: number | null },
): void {
  if (purpose === "ENTRADA_COMPRA" && !warehouses.destination) {
    throw new AppError(
      400,
      "Una ruta de compra debe terminar en un almacén activo. Seleccione un almacén como destino.",
    );
  }
  if (purpose === "SALIDA_DISTRIBUCION" && !warehouses.origin) {
    throw new AppError(
      400,
      "Una ruta de distribución debe comenzar en un almacén activo. Seleccione un almacén como origen.",
    );
  }
  if (purpose === "AMBOS" && (!warehouses.origin || !warehouses.destination)) {
    throw new AppError(
      400,
      "Una ruta de uso mixto debe comenzar y terminar en almacenes activos.",
    );
  }
}
