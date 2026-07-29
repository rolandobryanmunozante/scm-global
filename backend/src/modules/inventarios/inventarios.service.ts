import type { PoolClient } from "pg";
import { pool } from "../../shared/db.js";
import { AppError } from "../../shared/errors.js";
import { sendMail } from "../../shared/mailer.js";

export async function receivePurchaseOrder(
  client: PoolClient,
  orderId: number,
  warehouseId: number,
  userId: number,
): Promise<{ order: Record<string, unknown>; productIds: number[] }> {
  const orderResult = await client.query(
    `SELECT po.*,s.active AS supplier_active
     FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id
     WHERE po.id=$1 FOR UPDATE OF po`,
    [orderId],
  );
  const order = orderResult.rows[0];
  if (!order) throw new AppError(404, "Orden de compra no encontrada");
  if (order.status === "RECIBIDA") {
    throw new AppError(409, "La orden de compra ya fue recibida");
  }
  if (!["APROBADA", "ENVIADA", "CONFIRMADA"].includes(String(order.status))) {
    throw new AppError(409, "La orden debe estar aprobada o confirmada para recibirla");
  }
  const warehouse = await client.query("SELECT id FROM warehouses WHERE id=$1 AND active", [warehouseId]);
  if (!warehouse.rowCount) throw new AppError(400, "El almacén de recepción no existe o está inactivo");

  const items = await client.query(
    "SELECT product_id,quantity FROM purchase_order_items WHERE purchase_order_id=$1 ORDER BY product_id",
    [orderId],
  );
  if (!items.rowCount) throw new AppError(409, "La orden no contiene productos");

  const productIds: number[] = [];
  for (const item of items.rows) {
    await client.query(
      `INSERT INTO stocks(product_id,warehouse_id,current_quantity)
       VALUES($1,$2,0) ON CONFLICT(product_id,warehouse_id) DO NOTHING`,
      [item.product_id, warehouseId],
    );
    const stockResult = await client.query(
      "SELECT * FROM stocks WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE",
      [item.product_id, warehouseId],
    );
    const stock = stockResult.rows[0];
    const resulting = Number(stock.current_quantity) + Number(item.quantity);
    await client.query("UPDATE stocks SET current_quantity=$2,updated_at=NOW() WHERE id=$1", [
      stock.id,
      resulting,
    ]);
    await client.query(
      `INSERT INTO inventory_movements
       (product_id,warehouse_id,user_id,movement_type,reason,quantity,previous_quantity,
        resulting_quantity,reference_type,reference_id,observations)
       VALUES($1,$2,$3,'ENTRADA','COMPRA',$4,$5,$6,'purchase_order',$7,$8)`,
      [
        item.product_id,
        warehouseId,
        userId,
        item.quantity,
        stock.current_quantity,
        resulting,
        orderId,
        `Recepción de la orden ${order.code}`,
      ],
    );
    productIds.push(Number(item.product_id));
  }

  const updated = await client.query(
    `UPDATE purchase_orders
     SET status='RECIBIDA',received_by=$2,received_at=NOW(),received_warehouse_id=$3,updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [orderId, userId, warehouseId],
  );
  return { order: updated.rows[0], productIds };
}

export async function generateAutomaticPurchaseOrders(): Promise<number> {
  const client = await pool.connect();
  let generated = 0;
  try {
    await client.query("BEGIN");
    const lowStock = await client.query(
      `SELECT p.id, p.sku, p.name, p.category_id, p.minimum_stock, p.maximum_stock,
              p.unit_price,
              COALESCE(SUM(s.current_quantity - s.reserved_quantity), 0)::INTEGER AS available
       FROM products p
       LEFT JOIN stocks s ON s.product_id = p.id
       WHERE p.active
       GROUP BY p.id
       HAVING COALESCE(SUM(s.current_quantity - s.reserved_quantity), 0) <= p.minimum_stock`,
    );

    for (const product of lowStock.rows) {
      const existing = await client.query(
        `SELECT 1 FROM purchase_orders po
         JOIN purchase_order_items i ON i.purchase_order_id = po.id
         WHERE i.product_id = $1 AND po.status IN ('BORRADOR','APROBADA','ENVIADA','CONFIRMADA')
         LIMIT 1`,
        [product.id],
      );
      if (existing.rowCount) continue;

      const supplier = await client.query(
        `SELECT s.id,catalog.unit_price
         FROM supplier_products catalog
         JOIN suppliers s ON s.id=catalog.supplier_id
         JOIN supplier_scores ss ON ss.supplier_id = s.id
         WHERE catalog.product_id=$1 AND catalog.active AND s.active
         ORDER BY ss.score DESC, s.created_at ASC
         LIMIT 1`,
        [product.id],
      );
      if (!supplier.rowCount) {
        await client.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, details)
           VALUES ('AUTO_REPLENISH_SKIPPED', 'product', $1, $2)`,
          [product.id, JSON.stringify({ reason: "No existe proveedor activo con el producto en catálogo" })],
        );
        continue;
      }

      const maximum = Number(product.maximum_stock) || Number(product.minimum_stock) * 2;
      const suggestedQuantity = Math.max(1, maximum - Number(product.available));
      const code = `OC-AUTO-${Date.now()}-${product.id}`;
      const order = await client.query(
        `INSERT INTO purchase_orders (code, supplier_id, automatic, notes)
         VALUES ($1,$2,TRUE,$3) RETURNING id`,
        [code, supplier.rows[0].id, `Generada por stock bajo de ${product.sku}`],
      );
      await client.query(
        `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_price)
         VALUES ($1,$2,$3,$4)`,
        [order.rows[0].id, product.id, suggestedQuantity, supplier.rows[0].unit_price],
      );
      await notifyRole(
        client,
        "PURCHASE_MANAGER",
        "Orden automática pendiente",
        `${code}: ${suggestedQuantity} unidades de ${product.name}`,
        "AUTO_PURCHASE_ORDER",
      );
      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details)
         VALUES ('AUTO_CREATE', 'purchase_order', $1, $2)`,
        [order.rows[0].id, JSON.stringify({ productId: product.id, suggestedQuantity })],
      );
      generated += 1;
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (generated > 0) {
    const managers = await pool.query(
      `SELECT u.email FROM users u JOIN roles r ON r.id=u.role_id
       LEFT JOIN notification_preferences np
         ON np.user_id=u.id AND np.event_code='AUTO_PURCHASE_ORDER'
       WHERE r.code='PURCHASE_MANAGER' AND u.active AND COALESCE(np.email_enabled,TRUE)`,
    );
    await Promise.allSettled(
      managers.rows.map((manager) =>
        sendMail(
          manager.email,
          "Órdenes automáticas generadas",
          `<p>Se generaron <strong>${generated}</strong> órdenes de compra en estado borrador para su revisión.</p>`,
        ),
      ),
    );
  }

  return generated;
}

export async function checkLatePurchaseOrders(): Promise<number> {
  const client = await pool.connect();
  let notified = 0;
  try {
    await client.query("BEGIN");
    const late = await client.query(
      `SELECT po.id, po.code, po.supplier_id, po.expected_delivery_date
       FROM purchase_orders po
       WHERE po.expected_delivery_date < CURRENT_DATE
         AND po.status IN ('APROBADA','ENVIADA','CONFIRMADA')
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.event_code = 'LATE_ORDER:' || po.id::TEXT
         )`,
    );
    const evaluator = await client.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id
       WHERE r.code='PURCHASE_MANAGER' AND u.active ORDER BY u.id LIMIT 1`,
    );
    for (const order of late.rows) {
      await notifyRole(
        client,
        "PURCHASE_MANAGER",
        "Incumplimiento de proveedor",
        `La orden ${order.code} superó la fecha comprometida ${order.expected_delivery_date.toISOString().slice(0, 10)}`,
        `LATE_ORDER:${order.id}`,
      );
      if (evaluator.rowCount) {
        await client.query(
          `INSERT INTO supplier_ratings
            (supplier_id, evaluator_id, punctuality, quality, price, comments, period_start)
           VALUES ($1,$2,1,3,3,$3,CURRENT_DATE)`,
          [order.supplier_id, evaluator.rows[0].id, `Incumplimiento automático: ${order.code}`],
        );
      }
      notified += 1;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (notified > 0) {
    const managers = await pool.query(
      `SELECT u.email FROM users u JOIN roles r ON r.id=u.role_id
       LEFT JOIN notification_preferences np ON np.user_id=u.id AND np.event_code='LATE_ORDER'
       WHERE r.code='PURCHASE_MANAGER' AND u.active AND COALESCE(np.email_enabled,TRUE)`,
    );
    await Promise.allSettled(
      managers.rows.map((manager) =>
        sendMail(
          manager.email,
          "Órdenes de compra con retraso",
          `<p>Se detectaron <strong>${notified}</strong> órdenes que superaron su fecha comprometida. Revise el panel de compras.</p>`,
        ),
      ),
    );
  }
  return notified;
}

async function notifyRole(
  client: PoolClient,
  roleCode: string,
  title: string,
  message: string,
  eventCode: string,
): Promise<void> {
  await client.query(
    `INSERT INTO notifications (user_id, title, message, channel, event_code)
     SELECT u.id, $2, $3, 'APP', $4
     FROM users u JOIN roles r ON r.id=u.role_id
     LEFT JOIN notification_preferences np
       ON np.user_id=u.id AND np.event_code=$5
     WHERE r.code=$1 AND u.active AND COALESCE(np.app_enabled,TRUE)`,
    [roleCode, title, message, eventCode, eventCode.split(":")[0]],
  );
}
