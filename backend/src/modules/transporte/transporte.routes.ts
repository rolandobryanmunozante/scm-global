import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/async-handler.js";
import { authenticate, optionalAuthenticate, requirePermission } from "../../shared/auth.js";
import { audit } from "../../shared/audit.js";
import { pool } from "../../shared/db.js";
import { AppError } from "../../shared/errors.js";
import { sendMail } from "../../shared/mailer.js";
import { emitEvent } from "../../shared/realtime.js";

const router = Router();

router.get(
  "/rastreo/:code",
  optionalAuthenticate,
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
  requirePermission("shipments.assign"),
  asyncHandler(async (_request, response) => {
    const result = await pool.query(
      `SELECT v.*,
              NOT EXISTS(SELECT 1 FROM shipments s WHERE s.vehicle_id=v.id AND s.status IN ('EN_TRANSITO','EN_ADUANA','RETRASADO','INCIDENCIA')) AS available
       FROM vehicles v WHERE v.active ORDER BY v.type,v.plate`,
    );
    response.json(result.rows);
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
        `SELECT u.* FROM users u JOIN roles r ON r.id=u.role_id
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

      const updated = await client.query(
        `UPDATE shipments SET vehicle_id=$2,driver_id=$3,status='EN_TRANSITO',departure_at=NOW()
         WHERE id=$1 RETURNING *`,
        [shipmentId, input.vehicle_id, input.driver_id],
      );
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
         VALUES($1,'Nuevo envío asignado',$2,$3)`,
        [
          input.driver_id,
          `${shipment.origin} → ${shipment.destination} (${shipment.tracking_code})`,
          `SHIPMENT_ASSIGNED:${shipmentId}`,
        ],
      );
      await audit(request, { action: "ASSIGN", entityType: "shipment", entityId: shipmentId }, client);
      await client.query("COMMIT");
      await sendMail(
        driver.email,
        "Nuevo envío asignado",
        `<p>Se le asignó el envío <strong>${shipment.tracking_code}</strong>.</p><p>${shipment.origin} → ${shipment.destination}</p>`,
      );
      emitEvent(`shipment:${shipmentId}`, "shipment:updated", updated.rows[0]);
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
      const shipmentResult = await client.query("SELECT * FROM shipments WHERE id=$1 FOR UPDATE", [
        shipmentId,
      ]);
      const shipment = shipmentResult.rows[0];
      if (!shipment) throw new AppError(404, "Envío no encontrado");
      if (request.user!.role === "DRIVER" && Number(shipment.driver_id) !== request.user!.id) {
        throw new AppError(403, "El envío no está asignado a este transportista");
      }
      if (shipment.status === "ENTREGADO") throw new AppError(409, "El envío ya fue entregado");
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
          delivered_at=CASE WHEN $2::shipment_status='ENTREGADO' THEN NOW() ELSE delivered_at END
         WHERE id=$1 RETURNING *`,
        [shipmentId, status, input.latitude, input.longitude],
      );
      await audit(request, { action: "SHIPMENT_EVENT", entityType: "shipment", entityId: shipmentId, details: { status } }, client);
      await client.query("COMMIT");
      emitEvent(`shipment:${shipmentId}`, "shipment:event", event.rows[0]);
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
