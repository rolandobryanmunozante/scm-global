import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/async-handler.js";
import { authenticate, requirePermission } from "../../shared/auth.js";
import { audit } from "../../shared/audit.js";
import { pool } from "../../shared/db.js";
import { AppError } from "../../shared/errors.js";
import { estimateDuration, routeDistance, type Coordinate } from "../../shared/geo.js";

const router = Router();
router.use(authenticate);

router.get(
  "/rutas",
  requirePermission("routes.manage", "shipments.read"),
  asyncHandler(async (_request, response) => {
    const result = await pool.query(
      `SELECT r.*, u.full_name AS created_by_name
       FROM routes r JOIN users u ON u.id=r.created_by
       ORDER BY r.created_at DESC`,
    );
    response.json(result.rows);
  }),
);

router.post(
  "/rutas",
  requirePermission("routes.manage"),
  asyncHandler(async (request, response) => {
    const coordinate = z.object({
      name: z.string().trim().min(2).max(150),
      country: z.string().trim().min(2).max(80),
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
    });
    const input = z
      .object({
        name: z.string().trim().min(3).max(120),
        origin: coordinate,
        destination: coordinate,
        stops: z.array(coordinate).max(8).default([]),
        transport_mode: z.enum(["TERRESTRE", "MARITIMO", "AEREO"]),
        is_template: z.boolean().default(true),
      })
      .parse(request.body);
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
    const result = await pool.query(
      `INSERT INTO routes(
        name,origin_name,origin_country,origin_latitude,origin_longitude,
        destination_name,destination_country,destination_latitude,destination_longitude,
        stops,transport_mode,estimated_distance_km,estimated_duration_hours,
        customs_required,is_template,created_by
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
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

router.get(
  "/mapa-envios",
  requirePermission("shipments.read", "reports.read"),
  asyncHandler(async (request, response) => {
    const search = z.string().trim().max(100).default("").parse(request.query.search);
    const result = await pool.query(
      `SELECT s.id,s.tracking_code,s.origin,s.destination,s.status,s.current_latitude,
              s.current_longitude,s.eta_at,s.departure_at,r.transport_mode,r.name AS route,
              u.full_name AS driver,v.plate
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
        total_weight_kg: z.coerce.number().positive(),
        total_volume_m3: z.coerce.number().positive(),
        items: z
          .array(
            z.object({
              product_id: z.coerce.number().int().positive(),
              quantity: z.coerce.number().int().positive(),
            }),
          )
          .min(1),
      })
      .parse(request.body);
    const route = await pool.query("SELECT * FROM routes WHERE id=$1", [input.route_id]);
    if (!route.rowCount) throw new AppError(404, "Ruta no encontrada");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const code = `SCM-${new Date().getUTCFullYear()}-${Date.now().toString().slice(-8)}`;
      const routeData = route.rows[0];
      const eta = new Date(Date.now() + Number(routeData.estimated_duration_hours) * 3_600_000);
      const shipment = await client.query(
        `INSERT INTO shipments(
          tracking_code,route_id,purchase_order_id,origin,destination,total_weight_kg,total_volume_m3,
          current_latitude,current_longitude,eta_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
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
        ],
      );
      for (const item of input.items) {
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
