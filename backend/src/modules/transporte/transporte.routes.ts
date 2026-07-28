import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/async-handler.js";
import { authenticate, requirePermission } from "../../shared/auth.js";
import { audit } from "../../shared/audit.js";
import { pool } from "../../shared/db.js";
import { AppError } from "../../shared/errors.js";
import { estimateDuration, haversineKm } from "../../shared/geo.js";
import { sendMail } from "../../shared/mailer.js";
import { emitEvent } from "../../shared/realtime.js";
import { receivePurchaseOrder } from "../inventarios/inventarios.service.js";

const router = Router();
const vehicleSchema = z.object({
  plate: z.string().trim().min(3).max(30),
  type: z.string().trim().min(2).max(50),
  transport_mode: z.enum(["TERRESTRE", "MARITIMO", "AEREO"]),
  capacity_kg: z.coerce.number().positive(),
  capacity_m3: z.coerce.number().positive(),
  current_location: z.string().trim().max(150).nullable().optional(),
});

router.get(
  "/rastreo/:code",
  asyncHandler(async (request, response) => {
    const code = z.string().trim().min(5).max(30).parse(request.params.code);
    const shipmentResult = await pool.query(
      `SELECT s.id,s.tracking_code,s.origin,s.destination,s.status,s.current_latitude,
              s.current_longitude,s.departure_at,s.eta_at,s.delivered_at,
              r.transport_mode,r.estimated_distance_km,r.customs_required,
              v.plate,v.type AS vehicle,u.full_name AS driver
       FROM shipments s
       JOIN routes r ON r.id=s.route_id
       LEFT JOIN vehicles v ON v.id=s.vehicle_id
       LEFT JOIN users u ON u.id=s.driver_id
       WHERE s.tracking_code=$1`,
      [code],
    );
    const shipment = shipmentResult.rows[0];
    if (!shipment) throw new AppError(404, "Código de rastreo no encontrado");
    const events = await pool.query(
      `SELECT e.id,e.event_type,e.status,e.description,e.latitude,e.longitude,e.evidence_url,e.created_at,
              u.full_name AS user_name
       FROM shipment_events e LEFT JOIN users u ON u.id=e.user_id
       WHERE e.shipment_id=$1 ORDER BY e.created_at`,
      [shipment.id],
    );
    response.json({ shipment, events: events.rows });
  }),
);

router.use(authenticate);

router.get(
  "/vehiculos",
  requirePermission("shipments.assign", "transport.resources"),
  asyncHandler(async (request, response) => {
    const active = z.enum(["true", "false", "all"]).default("true").parse(request.query.active);
    const result = await pool.query(
      `SELECT v.*,
              NOT EXISTS(SELECT 1 FROM shipments s WHERE s.vehicle_id=v.id AND s.status IN ('EN_TRANSITO','EN_ADUANA','RETRASADO','INCIDENCIA')) AS available
       FROM vehicles v WHERE ($1='all' OR v.active=($1='true')) ORDER BY v.type,v.plate`,
      [active],
    );
    response.json(result.rows);
  }),
);

router.post(
  "/vehiculos",
  requirePermission("transport.resources"),
  asyncHandler(async (request, response) => {
    const input = vehicleSchema.parse(request.body);
    const result = await pool.query(
      `INSERT INTO vehicles(plate,type,transport_mode,capacity_kg,capacity_m3,current_location)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        input.plate.toUpperCase(),
        input.type,
        input.transport_mode,
        input.capacity_kg,
        input.capacity_m3,
        input.current_location ?? null,
      ],
    );
    await audit(request, {
      action: "CREATE",
      entityType: "vehicle",
      entityId: result.rows[0].id,
    });
    response.status(201).json(result.rows[0]);
  }),
);

router.put(
  "/vehiculos/:id",
  requirePermission("transport.resources"),
  asyncHandler(async (request, response) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const input = vehicleSchema.parse(request.body);
    const result = await pool.query(
      `UPDATE vehicles SET plate=$2,type=$3,transport_mode=$4,capacity_kg=$5,
       capacity_m3=$6,current_location=$7 WHERE id=$1 RETURNING *`,
      [
        id,
        input.plate.toUpperCase(),
        input.type,
        input.transport_mode,
        input.capacity_kg,
        input.capacity_m3,
        input.current_location ?? null,
      ],
    );
    if (!result.rowCount) throw new AppError(404, "Vehículo no encontrado");
    await audit(request, { action: "UPDATE", entityType: "vehicle", entityId: id });
    response.json(result.rows[0]);
  }),
);

router.patch(
  "/vehiculos/:id/estado",
  requirePermission("transport.resources"),
  asyncHandler(async (request, response) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const { active } = z.object({ active: z.boolean() }).parse(request.body);
    if (!active) {
      const inUse = await pool.query(
        `SELECT 1 FROM shipments
         WHERE vehicle_id=$1 AND status IN ('EN_TRANSITO','EN_ADUANA','RETRASADO','INCIDENCIA')`,
        [id],
      );
      if (inUse.rowCount) throw new AppError(409, "No puede desactivar un vehículo en operación");
    }
    const result = await pool.query(
      "UPDATE vehicles SET active=$2 WHERE id=$1 RETURNING id,active",
      [id, active],
    );
    if (!result.rowCount) throw new AppError(404, "Vehículo no encontrado");
    await audit(request, {
      action: active ? "REACTIVATE" : "DEACTIVATE",
      entityType: "vehicle",
      entityId: id,
    });
    response.json(result.rows[0]);
  }),
);

router.get(
  "/transportistas",
  requirePermission("shipments.assign"),
  asyncHandler(async (_request, response) => {
    const result = await pool.query(
      `SELECT u.id,u.full_name,u.email,u.license_number,u.license_expiry,
              (u.license_expiry >= CURRENT_DATE) AS license_valid,
              NOT EXISTS(SELECT 1 FROM shipments s WHERE s.driver_id=u.id AND s.status IN ('EN_TRANSITO','EN_ADUANA','RETRASADO','INCIDENCIA')) AS available
       FROM users u JOIN roles r ON r.id=u.role_id
       WHERE r.code='DRIVER' AND u.active ORDER BY u.full_name`,
    );
    response.json(result.rows);
  }),
);

router.get(
  "/envios",
  requirePermission("shipments.read"),
  asyncHandler(async (request, response) => {
    const onlyDriver = request.user!.role === "DRIVER";
    const result = await pool.query(
      `SELECT s.*,r.name AS route,r.transport_mode,r.estimated_distance_km,
              v.plate,v.type AS vehicle,u.full_name AS driver,
              json_agg(json_build_object('product_id',p.id,'sku',p.sku,'product',p.name,'quantity',si.quantity))
                FILTER (WHERE p.id IS NOT NULL) AS items
       FROM shipments s
       JOIN routes r ON r.id=s.route_id
       LEFT JOIN vehicles v ON v.id=s.vehicle_id
       LEFT JOIN users u ON u.id=s.driver_id
       LEFT JOIN shipment_items si ON si.shipment_id=s.id
       LEFT JOIN products p ON p.id=si.product_id
       WHERE ($1::BOOLEAN=FALSE OR s.driver_id=$2)
       GROUP BY s.id,r.name,r.transport_mode,r.estimated_distance_km,v.plate,v.type,u.full_name
       ORDER BY s.created_at DESC`,
      [onlyDriver, request.user!.id],
    );
    response.json(result.rows);
  }),
);

router.patch(
  "/envios/:id/asignar",
  requirePermission("shipments.assign"),
  asyncHandler(async (request, response) => {
    const shipmentId = z.coerce.number().int().positive().parse(request.params.id);
    const input = z
      .object({
        vehicle_id: z.coerce.number().int().positive(),
        driver_id: z.coerce.number().int().positive(),
      })
      .parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const shipmentResult = await client.query(
        "SELECT * FROM shipments WHERE id=$1 FOR UPDATE",
        [shipmentId],
      );
      const shipment = shipmentResult.rows[0];
      if (!shipment || shipment.status !== "PREPARANDO") {
        throw new AppError(409, "El envío no está disponible para asignación");
      }
      const vehicleResult = await client.query("SELECT * FROM vehicles WHERE id=$1 AND active", [
        input.vehicle_id,
      ]);
      const vehicle = vehicleResult.rows[0];
      if (
        !vehicle ||
        Number(vehicle.capacity_kg) < Number(shipment.total_weight_kg) ||
        Number(vehicle.capacity_m3) < Number(shipment.total_volume_m3)
      ) {
        throw new AppError(409, "El vehículo no tiene capacidad suficiente");
      }
      const vehicleConflict = await client.query(
        `SELECT 1 FROM shipments WHERE vehicle_id=$1 AND status IN ('EN_TRANSITO','EN_ADUANA','RETRASADO','INCIDENCIA')`,
        [input.vehicle_id],
      );
      if (vehicleConflict.rowCount) throw new AppError(409, "El vehículo ya está asignado");

      const driverResult = await client.query(
        `SELECT u.*,
                COALESCE((SELECT np.email_enabled FROM notification_preferences np
                          WHERE np.user_id=u.id AND np.event_code='SHIPMENT_ASSIGNED'),TRUE)
                  AS assignment_email_enabled
         FROM users u JOIN roles r ON r.id=u.role_id
         WHERE u.id=$1 AND r.code='DRIVER' AND u.active`,
        [input.driver_id],
      );
      const driver = driverResult.rows[0];
      if (!driver || !driver.license_expiry || new Date(driver.license_expiry) < new Date()) {
        throw new AppError(409, "El transportista no tiene licencia vigente");
      }
      const driverConflict = await client.query(
        `SELECT 1 FROM shipments WHERE driver_id=$1 AND status IN ('EN_TRANSITO','EN_ADUANA','RETRASADO','INCIDENCIA')`,
        [input.driver_id],
      );
      if (driverConflict.rowCount) throw new AppError(409, "El transportista ya está asignado");

      const dispatchedProducts: number[] = [];
      if (!shipment.purchase_order_id && !shipment.inventory_dispatched_at) {
        if (!shipment.origin_warehouse_id) {
          throw new AppError(409, "El envío no tiene un almacén de origen válido");
        }
        const items = await client.query(
          "SELECT product_id,quantity FROM shipment_items WHERE shipment_id=$1 ORDER BY product_id",
          [shipmentId],
        );
        for (const item of items.rows) {
          const stockResult = await client.query(
            `SELECT * FROM stocks
             WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE`,
            [item.product_id, shipment.origin_warehouse_id],
          );
          const stock = stockResult.rows[0];
          if (
            !stock ||
            Number(stock.current_quantity) < Number(item.quantity) ||
            Number(stock.reserved_quantity) < Number(item.quantity)
          ) {
            throw new AppError(409, `La reserva de inventario no es válida para el producto ${item.product_id}`);
          }
          const resulting = Number(stock.current_quantity) - Number(item.quantity);
          await client.query(
            `UPDATE stocks
             SET current_quantity=$3,reserved_quantity=reserved_quantity-$4,updated_at=NOW()
             WHERE product_id=$1 AND warehouse_id=$2`,
            [
              item.product_id,
              shipment.origin_warehouse_id,
              resulting,
              item.quantity,
            ],
          );
          await client.query(
            `INSERT INTO inventory_movements
             (product_id,warehouse_id,user_id,movement_type,reason,quantity,previous_quantity,
              resulting_quantity,reference_type,reference_id,observations)
             VALUES($1,$2,$3,'SALIDA','DESPACHO',$4,$5,$6,'shipment',$7,$8)`,
            [
              item.product_id,
              shipment.origin_warehouse_id,
              request.user!.id,
              item.quantity,
              stock.current_quantity,
              resulting,
              shipmentId,
              `Despacho del envío ${shipment.tracking_code}`,
            ],
          );
          dispatchedProducts.push(Number(item.product_id));
        }
      }
      const updated = await client.query(
        `UPDATE shipments SET vehicle_id=$2,driver_id=$3,status='EN_TRANSITO',departure_at=NOW(),
          inventory_dispatched_at=CASE WHEN purchase_order_id IS NULL THEN NOW() ELSE inventory_dispatched_at END,
          updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [shipmentId, input.vehicle_id, input.driver_id],
      );
      if (shipment.purchase_order_id) {
        await client.query(
          `UPDATE purchase_orders
           SET status=CASE WHEN status='APROBADA' THEN 'ENVIADA' ELSE status END,updated_at=NOW()
           WHERE id=$1`,
          [shipment.purchase_order_id],
        );
      }
      await client.query(
        `INSERT INTO shipment_events(shipment_id,user_id,event_type,status,description,latitude,longitude)
         VALUES($1,$2,'SALIDA','EN_TRANSITO','Transporte asignado; envío en tránsito',$3,$4)`,
        [
          shipmentId,
          request.user!.id,
          shipment.current_latitude,
          shipment.current_longitude,
        ],
      );
      await client.query(
        `INSERT INTO notifications(user_id,title,message,event_code)
         SELECT $1,'Nuevo envío asignado',$2,$3
         WHERE COALESCE((SELECT app_enabled FROM notification_preferences
                         WHERE user_id=$1 AND event_code='SHIPMENT_ASSIGNED'),TRUE)`,
        [
          input.driver_id,
          `${shipment.origin} → ${shipment.destination} (${shipment.tracking_code})`,
          `SHIPMENT_ASSIGNED:${shipmentId}`,
        ],
      );
      await audit(request, { action: "ASSIGN", entityType: "shipment", entityId: shipmentId }, client);
      await client.query("COMMIT");
      if (driver.assignment_email_enabled) {
        await sendMail(
          driver.email,
          "Nuevo envío asignado",
          `<p>Se le asignó el envío <strong>${shipment.tracking_code}</strong>.</p><p>${shipment.origin} → ${shipment.destination}</p>`,
        );
      }
      emitEvent(`shipment:${shipmentId}`, "shipment:updated", updated.rows[0]);
      if (dispatchedProducts.length) {
        emitEvent("inventory", "stock:dispatched", {
          shipmentId,
          warehouseId: shipment.origin_warehouse_id,
          productIds: dispatchedProducts,
        });
      }
      response.json(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.post(
  "/envios/:id/eventos",
  requirePermission("shipments.update"),
  asyncHandler(async (request, response) => {
    const shipmentId = z.coerce.number().int().positive().parse(request.params.id);
    const input = z
      .object({
        event_type: z.enum(["SALIDA", "ESCALA", "ADUANA", "INCIDENCIA", "ENTREGA", "UBICACION"]),
        description: z.string().trim().min(3).max(1000),
        latitude: z.coerce.number().min(-90).max(90),
        longitude: z.coerce.number().min(-180).max(180),
        evidence_url: z.string().url().nullable().optional(),
      })
      .parse(request.body);
    const statusMap = {
      SALIDA: "EN_TRANSITO",
      ESCALA: "EN_TRANSITO",
      ADUANA: "EN_ADUANA",
      INCIDENCIA: "INCIDENCIA",
      ENTREGA: "ENTREGADO",
      UBICACION: "EN_TRANSITO",
    } as const;
    const status = statusMap[input.event_type];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const shipmentResult = await client.query(
        `SELECT s.*,r.destination_latitude,r.destination_longitude,r.transport_mode
         FROM shipments s JOIN routes r ON r.id=s.route_id
         WHERE s.id=$1 FOR UPDATE OF s`,
        [shipmentId],
      );
      const shipment = shipmentResult.rows[0];
      if (!shipment) throw new AppError(404, "Envío no encontrado");
      if (request.user!.role === "DRIVER" && Number(shipment.driver_id) !== request.user!.id) {
        throw new AppError(403, "El envío no está asignado a este transportista");
      }
      if (shipment.status === "ENTREGADO") throw new AppError(409, "El envío ya fue entregado");

      const inventoryProducts: number[] = [];
      if (input.event_type === "ENTREGA") {
        if (shipment.purchase_order_id) {
          if (!shipment.destination_warehouse_id) {
            throw new AppError(409, "El envío de compra no tiene almacén de recepción");
          }
          const received = await receivePurchaseOrder(
            client,
            Number(shipment.purchase_order_id),
            Number(shipment.destination_warehouse_id),
            request.user!.id,
          );
          inventoryProducts.push(...received.productIds);
        } else if (shipment.destination_warehouse_id && !shipment.inventory_received_at) {
          const items = await client.query(
            "SELECT product_id,quantity FROM shipment_items WHERE shipment_id=$1 ORDER BY product_id",
            [shipmentId],
          );
          for (const item of items.rows) {
            await client.query(
              `INSERT INTO stocks(product_id,warehouse_id,current_quantity)
               VALUES($1,$2,0) ON CONFLICT(product_id,warehouse_id) DO NOTHING`,
              [item.product_id, shipment.destination_warehouse_id],
            );
            const stockResult = await client.query(
              "SELECT * FROM stocks WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE",
              [item.product_id, shipment.destination_warehouse_id],
            );
            const stock = stockResult.rows[0];
            const resulting = Number(stock.current_quantity) + Number(item.quantity);
            await client.query(
              "UPDATE stocks SET current_quantity=$2,updated_at=NOW() WHERE id=$1",
              [stock.id, resulting],
            );
            await client.query(
              `INSERT INTO inventory_movements
               (product_id,warehouse_id,user_id,movement_type,reason,quantity,previous_quantity,
                resulting_quantity,reference_type,reference_id,observations)
               VALUES($1,$2,$3,'ENTRADA','TRASLADO_ENVIO',$4,$5,$6,'shipment',$7,$8)`,
              [
                item.product_id,
                shipment.destination_warehouse_id,
                request.user!.id,
                item.quantity,
                stock.current_quantity,
                resulting,
                shipmentId,
                `Recepción del envío ${shipment.tracking_code}`,
              ],
            );
            inventoryProducts.push(Number(item.product_id));
          }
        }
      }
      const remainingKm =
        input.event_type === "ENTREGA"
          ? 0
          : haversineKm(
              { lat: input.latitude, lng: input.longitude },
              {
                lat: Number(shipment.destination_latitude),
                lng: Number(shipment.destination_longitude),
              },
            );
      const recalculatedEta =
        input.event_type === "ENTREGA"
          ? new Date()
          : new Date(
              Date.now() +
                estimateDuration(remainingKm, String(shipment.transport_mode)) * 3_600_000,
            );
      const event = await client.query(
        `INSERT INTO shipment_events
          (shipment_id,user_id,event_type,status,description,latitude,longitude,evidence_url)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          shipmentId,
          request.user!.id,
          input.event_type,
          status,
          input.description,
          input.latitude,
          input.longitude,
          input.evidence_url ?? null,
        ],
      );
      const updated = await client.query(
        `UPDATE shipments SET status=$2::shipment_status,current_latitude=$3,current_longitude=$4,
          departure_at=CASE WHEN $2::shipment_status='EN_TRANSITO' AND departure_at IS NULL THEN NOW() ELSE departure_at END,
          delivered_at=CASE WHEN $2::shipment_status='ENTREGADO' THEN NOW() ELSE delivered_at END,
          inventory_received_at=CASE
            WHEN $2::shipment_status='ENTREGADO' AND destination_warehouse_id IS NOT NULL THEN NOW()
            ELSE inventory_received_at END,
          eta_at=$5,updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [shipmentId, status, input.latitude, input.longitude, recalculatedEta],
      );
      await audit(request, { action: "SHIPMENT_EVENT", entityType: "shipment", entityId: shipmentId, details: { status } }, client);
      await client.query("COMMIT");
      emitEvent(`shipment:${shipmentId}`, "shipment:event", event.rows[0]);
      if (inventoryProducts.length) {
        emitEvent("inventory", "stock:received", {
          shipmentId,
          warehouseId: shipment.destination_warehouse_id,
          productIds: inventoryProducts,
        });
      }
      response.status(201).json({ shipment: updated.rows[0], event: event.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

export default router;
