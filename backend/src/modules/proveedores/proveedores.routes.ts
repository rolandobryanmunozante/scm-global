import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/async-handler.js";
import { authenticate, requirePermission } from "../../shared/auth.js";
import { audit } from "../../shared/audit.js";
import { pool } from "../../shared/db.js";
import { AppError } from "../../shared/errors.js";

const router = Router();
router.use(authenticate);

const supplierSchema = z.object({
  commercial_name: z.string().trim().min(2).max(150),
  tax_id: z.string().trim().min(4).max(30),
  country: z.string().trim().min(2).max(80),
  category_id: z.coerce.number().int().positive(),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(5).max(30),
  address: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

router.get(
  "/categorias",
  requirePermission("suppliers.read", "inventory.read"),
  asyncHandler(async (_request, response) => {
    const result = await pool.query("SELECT id, name FROM categories WHERE active ORDER BY name");
    response.json(result.rows);
  }),
);

router.get(
  "/",
  requirePermission("suppliers.read"),
  asyncHandler(async (request, response) => {
    const query = z
      .object({
        search: z.string().trim().max(100).default(""),
        country: z.string().trim().max(80).optional(),
        categoryId: z.coerce.number().int().positive().optional(),
        active: z.enum(["true", "false", "all"]).default("true"),
        sort: z.enum(["name", "score"]).default("name"),
      })
      .parse(request.query);
    const result = await pool.query(
      `SELECT s.*, c.name AS category, ss.score::FLOAT AS score, ss.rating_count
       FROM suppliers s
       JOIN categories c ON c.id = s.category_id
       JOIN supplier_scores ss ON ss.supplier_id = s.id
       WHERE ($1 = '' OR s.commercial_name ILIKE '%' || $1 || '%' OR s.code ILIKE '%' || $1 || '%' OR s.tax_id ILIKE '%' || $1 || '%')
         AND ($2::TEXT IS NULL OR s.country = $2)
         AND ($3::BIGINT IS NULL OR s.category_id = $3)
         AND ($4 = 'all' OR s.active = ($4 = 'true'))
       ORDER BY
         CASE WHEN $5 = 'score' THEN ss.score END DESC,
         s.commercial_name ASC`,
      [query.search, query.country ?? null, query.categoryId ?? null, query.active, query.sort],
    );
    response.json(result.rows);
  }),
);

router.post(
  "/",
  requirePermission("suppliers.write"),
  asyncHandler(async (request, response) => {
    const input = supplierSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const codeResult = await client.query(
        "SELECT 'PRV-' || LPAD((COALESCE(MAX(id), 0) + 1)::TEXT, 4, '0') AS code FROM suppliers",
      );
      const result = await client.query(
        `INSERT INTO suppliers
          (code, commercial_name, tax_id, country, category_id, email, phone, address, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          codeResult.rows[0].code,
          input.commercial_name,
          input.tax_id,
          input.country,
          input.category_id,
          input.email,
          input.phone,
          input.address ?? null,
          input.notes ?? null,
        ],
      );
      await audit(request, { action: "CREATE", entityType: "supplier", entityId: result.rows[0].id }, client);
      await client.query("COMMIT");
      response.status(201).json(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.put(
  "/:id",
  requirePermission("suppliers.write"),
  asyncHandler(async (request, response) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const input = supplierSchema.parse(request.body);
    const result = await pool.query(
      `UPDATE suppliers SET
         commercial_name=$2, tax_id=$3, country=$4, category_id=$5, email=$6,
         phone=$7, address=$8, notes=$9
       WHERE id=$1 RETURNING *`,
      [
        id,
        input.commercial_name,
        input.tax_id,
        input.country,
        input.category_id,
        input.email,
        input.phone,
        input.address ?? null,
        input.notes ?? null,
      ],
    );
    if (!result.rowCount) throw new AppError(404, "Proveedor no encontrado");
    await audit(request, { action: "UPDATE", entityType: "supplier", entityId: id });
    response.json(result.rows[0]);
  }),
);

router.delete(
  "/:id",
  requirePermission("suppliers.write"),
  asyncHandler(async (request, response) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const result = await pool.query(
      "UPDATE suppliers SET active = FALSE WHERE id = $1 AND active RETURNING id, active",
      [id],
    );
    if (!result.rowCount) throw new AppError(404, "Proveedor activo no encontrado");
    await audit(request, { action: "DEACTIVATE", entityType: "supplier", entityId: id });
    response.json(result.rows[0]);
  }),
);

router.get(
  "/:id/calificaciones",
  requirePermission("suppliers.read"),
  asyncHandler(async (request, response) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const result = await pool.query(
      `SELECT r.*, u.full_name AS evaluator
       FROM supplier_ratings r JOIN users u ON u.id = r.evaluator_id
       WHERE r.supplier_id = $1 ORDER BY r.period_start DESC, r.created_at DESC`,
      [id],
    );
    response.json(result.rows);
  }),
);

router.post(
  "/:id/calificaciones",
  requirePermission("suppliers.rate"),
  asyncHandler(async (request, response) => {
    const supplierId = z.coerce.number().int().positive().parse(request.params.id);
    const input = z
      .object({
        punctuality: z.coerce.number().min(1).max(5),
        quality: z.coerce.number().min(1).max(5),
        price: z.coerce.number().min(1).max(5),
        comments: z.string().trim().max(1000).nullable().optional(),
        period_start: z.string().date(),
      })
      .parse(request.body);
    const result = await pool.query(
      `INSERT INTO supplier_ratings
        (supplier_id, evaluator_id, punctuality, quality, price, comments, period_start)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        supplierId,
        request.user!.id,
        input.punctuality,
        input.quality,
        input.price,
        input.comments ?? null,
        input.period_start,
      ],
    );
    await audit(request, {
      action: "RATE",
      entityType: "supplier",
      entityId: supplierId,
      details: { score: result.rows[0].weighted_score },
    });
    response.status(201).json(result.rows[0]);
  }),
);

router.get(
  "/portal/ordenes",
  requirePermission("supplier.portal"),
  asyncHandler(async (request, response) => {
    if (!request.user!.supplierId) throw new AppError(403, "El usuario no está vinculado a un proveedor");
    const result = await pool.query(
      `SELECT po.*, json_agg(json_build_object(
        'product_id', p.id, 'sku', p.sku, 'name', p.name, 'quantity', i.quantity, 'unit_price', i.unit_price
       )) AS items
       FROM purchase_orders po
       JOIN purchase_order_items i ON i.purchase_order_id = po.id
       JOIN products p ON p.id = i.product_id
       WHERE po.supplier_id = $1 AND po.status IN ('APROBADA','ENVIADA','CONFIRMADA','RECIBIDA')
       GROUP BY po.id ORDER BY po.created_at DESC`,
      [request.user!.supplierId],
    );
    response.json(result.rows);
  }),
);

router.patch(
  "/portal/ordenes/:id",
  requirePermission("supplier.portal"),
  asyncHandler(async (request, response) => {
    if (!request.user!.supplierId) throw new AppError(403, "El usuario no está vinculado a un proveedor");
    const orderId = z.coerce.number().int().positive().parse(request.params.id);
    const input = z
      .object({
        expected_delivery_date: z.string().date(),
        document_url: z.string().url().nullable().optional(),
      })
      .parse(request.body);
    const result = await pool.query(
      `UPDATE purchase_orders
       SET status='CONFIRMADA', supplier_confirmed_at=NOW(), expected_delivery_date=$3,
           supplier_document_url=$4
       WHERE id=$1 AND supplier_id=$2 AND status IN ('APROBADA','ENVIADA')
       RETURNING *`,
      [orderId, request.user!.supplierId, input.expected_delivery_date, input.document_url ?? null],
    );
    if (!result.rowCount) throw new AppError(404, "Orden disponible no encontrada");
    await audit(request, { action: "SUPPLIER_CONFIRM", entityType: "purchase_order", entityId: orderId });
    response.json(result.rows[0]);
  }),
);

export default router;
