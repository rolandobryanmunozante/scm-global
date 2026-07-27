import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/async-handler.js";
import { authenticate, requirePermission } from "../../shared/auth.js";
import { audit } from "../../shared/audit.js";
import { pool } from "../../shared/db.js";
import { AppError } from "../../shared/errors.js";
import { emitEvent } from "../../shared/realtime.js";
import {
  checkLatePurchaseOrders,
  generateAutomaticPurchaseOrders,
} from "./inventarios.service.js";

const router = Router();
router.use(authenticate);

router.get(
  "/productos",
  requirePermission("inventory.read"),
  asyncHandler(async (request, response) => {
    const search = z.string().trim().max(100).default("").parse(request.query.search);
    const result = await pool.query(
      `SELECT p.*, c.name AS category
       FROM products p JOIN categories c ON c.id=p.category_id
       WHERE p.active AND ($1='' OR p.sku ILIKE '%'||$1||'%' OR p.name ILIKE '%'||$1||'%' OR c.name ILIKE '%'||$1||'%')
       ORDER BY p.name LIMIT 100`,
      [search],
    );
    response.json(result.rows);
  }),
);

router.get(
  "/almacenes",
  requirePermission("inventory.read"),
  asyncHandler(async (_request, response) => {
    const result = await pool.query("SELECT * FROM warehouses WHERE active ORDER BY name");
    response.json(result.rows);
  }),
);

router.get(
  "/stock",
  requirePermission("inventory.read"),
  asyncHandler(async (request, response) => {
    const query = z
      .object({
        search: z.string().trim().max(100).default(""),
        warehouseId: z.coerce.number().int().positive().optional(),
        categoryId: z.coerce.number().int().positive().optional(),
      })
      .parse(request.query);
    const result = await pool.query(
      `SELECT p.id AS product_id, p.sku, p.name AS product, c.name AS category,
              p.minimum_stock, p.maximum_stock, p.unit_of_measure, p.unit_price,
              COALESCE(SUM(s.current_quantity),0)::INTEGER AS global_stock,
              COALESCE(SUM(s.current_quantity-s.reserved_quantity),0)::INTEGER AS available,
              json_agg(json_build_object(
                'warehouse_id', w.id, 'warehouse', w.name, 'code', w.code,
                'current', s.current_quantity, 'reserved', s.reserved_quantity,
                'available', s.current_quantity-s.reserved_quantity
              ) ORDER BY w.name) FILTER (WHERE w.id IS NOT NULL) AS warehouses
       FROM products p
       JOIN categories c ON c.id=p.category_id
       LEFT JOIN stocks s ON s.product_id=p.id AND ($2::BIGINT IS NULL OR s.warehouse_id=$2)
       LEFT JOIN warehouses w ON w.id=s.warehouse_id
       WHERE p.active
         AND ($1='' OR p.sku ILIKE '%'||$1||'%' OR p.name ILIKE '%'||$1||'%' OR c.name ILIKE '%'||$1||'%')
         AND ($3::BIGINT IS NULL OR p.category_id=$3)
       GROUP BY p.id,c.name
       ORDER BY p.name`,
      [query.search, query.warehouseId ?? null, query.categoryId ?? null],
    );
    response.json(result.rows);
  }),
);

router.get(
  "/movimientos",
  requirePermission("inventory.read"),
  asyncHandler(async (request, response) => {
    const limit = z.coerce.number().int().min(1).max(200).default(50).parse(request.query.limit);
    const result = await pool.query(
      `SELECT m.*, p.sku, p.name AS product, w.name AS warehouse, u.full_name AS user_name
       FROM inventory_movements m
       JOIN products p ON p.id=m.product_id
       JOIN warehouses w ON w.id=m.warehouse_id
       JOIN users u ON u.id=m.user_id
       ORDER BY m.created_at DESC LIMIT $1`,
      [limit],
    );
    response.json(result.rows);
  }),
);

router.post(
  "/movimientos",
  requirePermission("inventory.move"),
  asyncHandler(async (request, response) => {
    const input = z
      .object({
        product_id: z.coerce.number().int().positive(),
        warehouse_id: z.coerce.number().int().positive(),
        movement_type: z.enum(["ENTRADA", "SALIDA"]),
        reason: z.enum(["COMPRA", "DEVOLUCION", "VENTA", "TRANSFERENCIA", "MERMA", "AJUSTE"]),
        quantity: z.coerce.number().int().positive(),
        observations: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO stocks(product_id,warehouse_id,current_quantity)
         VALUES($1,$2,0) ON CONFLICT(product_id,warehouse_id) DO NOTHING`,
        [input.product_id, input.warehouse_id],
      );
      const stockResult = await client.query(
        `SELECT * FROM stocks WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE`,
        [input.product_id, input.warehouse_id],
      );
      const stock = stockResult.rows[0];
      const previous = Number(stock.current_quantity);
      const resulting =
        input.movement_type === "ENTRADA" ? previous + input.quantity : previous - input.quantity;
      if (resulting < Number(stock.reserved_quantity)) {
        throw new AppError(409, "Stock insuficiente para realizar la salida");
      }
      await client.query(
        "UPDATE stocks SET current_quantity=$2, updated_at=NOW() WHERE id=$1",
        [stock.id, resulting],
      );
      const movement = await client.query(
        `INSERT INTO inventory_movements
          (product_id,warehouse_id,user_id,movement_type,reason,quantity,previous_quantity,resulting_quantity,observations)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          input.product_id,
          input.warehouse_id,
          request.user!.id,
          input.movement_type,
          input.reason,
          input.quantity,
          previous,
          resulting,
          input.observations ?? null,
        ],
      );
      await audit(
        request,
        {
          action: "INVENTORY_MOVEMENT",
          entityType: "inventory_movement",
          entityId: movement.rows[0].id,
          details: { previous, resulting },
        },
        client,
      );
      await client.query("COMMIT");
      emitEvent(`warehouse:${input.warehouse_id}`, "stock:updated", {
        productId: input.product_id,
        warehouseId: input.warehouse_id,
        current: resulting,
      });
      response.status(201).json(movement.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.get(
  "/transferencias",
  requirePermission("inventory.read"),
  asyncHandler(async (_request, response) => {
    const result = await pool.query(
      `SELECT t.*, wo.name AS origin_warehouse, wd.name AS destination_warehouse,
              uc.full_name AS created_by_name, ur.full_name AS received_by_name,
              json_agg(json_build_object('product_id',p.id,'sku',p.sku,'product',p.name,'quantity',i.quantity)) AS items
       FROM stock_transfers t
       JOIN warehouses wo ON wo.id=t.origin_warehouse_id
       JOIN warehouses wd ON wd.id=t.destination_warehouse_id
       JOIN users uc ON uc.id=t.created_by
       LEFT JOIN users ur ON ur.id=t.received_by
       JOIN stock_transfer_items i ON i.transfer_id=t.id
       JOIN products p ON p.id=i.product_id
       GROUP BY t.id,wo.name,wd.name,uc.full_name,ur.full_name
       ORDER BY t.created_at DESC`,
    );
    response.json(result.rows);
  }),
);

router.post(
  "/transferencias",
  requirePermission("inventory.transfer"),
  asyncHandler(async (request, response) => {
    const input = z
      .object({
        origin_warehouse_id: z.coerce.number().int().positive(),
        destination_warehouse_id: z.coerce.number().int().positive(),
        notes: z.string().trim().max(1000).nullable().optional(),
        items: z
          .array(
            z.object({
              product_id: z.coerce.number().int().positive(),
              quantity: z.coerce.number().int().positive(),
            }),
          )
          .min(1),
      })
      .refine((value) => value.origin_warehouse_id !== value.destination_warehouse_id, {
        message: "Los almacenes deben ser diferentes",
      })
      .parse(request.body);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const transfer = await client.query(
        `INSERT INTO stock_transfers(origin_warehouse_id,destination_warehouse_id,created_by,notes)
         VALUES($1,$2,$3,$4) RETURNING *`,
        [
          input.origin_warehouse_id,
          input.destination_warehouse_id,
          request.user!.id,
          input.notes ?? null,
        ],
      );
      for (const item of input.items) {
        const stockResult = await client.query(
          `SELECT * FROM stocks WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE`,
          [item.product_id, input.origin_warehouse_id],
        );
        const stock = stockResult.rows[0];
        if (!stock || Number(stock.current_quantity) - Number(stock.reserved_quantity) < item.quantity) {
          throw new AppError(409, `Stock insuficiente para el producto ${item.product_id}`);
        }
        const resulting = Number(stock.current_quantity) - item.quantity;
        await client.query("UPDATE stocks SET current_quantity=$2,updated_at=NOW() WHERE id=$1", [
          stock.id,
          resulting,
        ]);
        await client.query(
          "INSERT INTO stock_transfer_items(transfer_id,product_id,quantity) VALUES($1,$2,$3)",
          [transfer.rows[0].id, item.product_id, item.quantity],
        );
        await client.query(
          `INSERT INTO inventory_movements
           (product_id,warehouse_id,user_id,movement_type,reason,quantity,previous_quantity,resulting_quantity,reference_type,reference_id)
           VALUES($1,$2,$3,'SALIDA','TRANSFERENCIA',$4,$5,$6,'stock_transfer',$7)`,
          [
            item.product_id,
            input.origin_warehouse_id,
            request.user!.id,
            item.quantity,
            stock.current_quantity,
            resulting,
            transfer.rows[0].id,
          ],
        );
      }
      await audit(request, { action: "CREATE", entityType: "stock_transfer", entityId: transfer.rows[0].id }, client);
      await client.query("COMMIT");
      emitEvent("inventory", "transfer:created", transfer.rows[0]);
      response.status(201).json(transfer.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.post(
  "/transferencias/:id/recibir",
  requirePermission("inventory.transfer"),
  asyncHandler(async (request, response) => {
    const transferId = z.coerce.number().int().positive().parse(request.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const transferResult = await client.query(
        "SELECT * FROM stock_transfers WHERE id=$1 FOR UPDATE",
        [transferId],
      );
      const transfer = transferResult.rows[0];
      if (!transfer || transfer.status !== "EN_TRANSITO") {
        throw new AppError(409, "La transferencia no está pendiente de recepción");
      }
      const items = await client.query("SELECT * FROM stock_transfer_items WHERE transfer_id=$1", [
        transferId,
      ]);
      for (const item of items.rows) {
        await client.query(
          `INSERT INTO stocks(product_id,warehouse_id,current_quantity)
           VALUES($1,$2,0) ON CONFLICT(product_id,warehouse_id) DO NOTHING`,
          [item.product_id, transfer.destination_warehouse_id],
        );
        const stockResult = await client.query(
          "SELECT * FROM stocks WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE",
          [item.product_id, transfer.destination_warehouse_id],
        );
        const stock = stockResult.rows[0];
        const resulting = Number(stock.current_quantity) + Number(item.quantity);
        await client.query("UPDATE stocks SET current_quantity=$2,updated_at=NOW() WHERE id=$1", [
          stock.id,
          resulting,
        ]);
        await client.query(
          `INSERT INTO inventory_movements
           (product_id,warehouse_id,user_id,movement_type,reason,quantity,previous_quantity,resulting_quantity,reference_type,reference_id)
           VALUES($1,$2,$3,'ENTRADA','TRANSFERENCIA',$4,$5,$6,'stock_transfer',$7)`,
          [
            item.product_id,
            transfer.destination_warehouse_id,
            request.user!.id,
            item.quantity,
            stock.current_quantity,
            resulting,
            transferId,
          ],
        );
      }
      const updated = await client.query(
        `UPDATE stock_transfers SET status='RECIBIDA',received_by=$2,received_at=NOW()
         WHERE id=$1 RETURNING *`,
        [transferId, request.user!.id],
      );
      await audit(request, { action: "RECEIVE", entityType: "stock_transfer", entityId: transferId }, client);
      await client.query("COMMIT");
      emitEvent("inventory", "transfer:received", updated.rows[0]);
      response.json(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.get(
  "/ordenes-compra",
  requirePermission("purchases.read"),
  asyncHandler(async (_request, response) => {
    const result = await pool.query(
      `SELECT po.*, s.commercial_name AS supplier,
              json_agg(json_build_object('product_id',p.id,'sku',p.sku,'product',p.name,'quantity',i.quantity,'unit_price',i.unit_price)) AS items,
              SUM(i.quantity*i.unit_price)::NUMERIC(16,2) AS total
       FROM purchase_orders po
       JOIN suppliers s ON s.id=po.supplier_id
       JOIN purchase_order_items i ON i.purchase_order_id=po.id
       JOIN products p ON p.id=i.product_id
       GROUP BY po.id,s.commercial_name ORDER BY po.created_at DESC`,
    );
    response.json(result.rows);
  }),
);

router.post(
  "/ordenes-compra/:id/aprobar",
  requirePermission("purchases.approve"),
  asyncHandler(async (request, response) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const result = await pool.query(
      `UPDATE purchase_orders
       SET status='APROBADA',approved_by=$2,approved_at=NOW()
       WHERE id=$1 AND status='BORRADOR' RETURNING *`,
      [id, request.user!.id],
    );
    if (!result.rowCount) throw new AppError(409, "La orden no está en estado borrador");
    await audit(request, { action: "APPROVE", entityType: "purchase_order", entityId: id });
    response.json(result.rows[0]);
  }),
);

router.post(
  "/ordenes-compra/generar-automaticas",
  requirePermission("purchases.approve"),
  asyncHandler(async (_request, response) => {
    const generated = await generateAutomaticPurchaseOrders();
    response.json({ generated });
  }),
);

router.post(
  "/ordenes-compra/verificar-incumplimientos",
  requirePermission("purchases.approve"),
  asyncHandler(async (_request, response) => {
    const notified = await checkLatePurchaseOrders();
    response.json({ notified });
  }),
);

export default router;
