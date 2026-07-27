import type { PoolClient } from "pg";
import { pool } from "../../shared/db.js";
import { sendMail } from "../../shared/mailer.js";

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
        `SELECT s.id
         FROM suppliers s
         JOIN supplier_scores ss ON ss.supplier_id = s.id
         WHERE s.category_id = $1 AND s.active
         ORDER BY ss.score DESC, s.created_at ASC
         LIMIT 1`,
        [product.category_id],
      );
      if (!supplier.rowCount) {
        await client.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, details)
           VALUES ('AUTO_REPLENISH_SKIPPED', 'product', $1, $2)`,
          [product.id, JSON.stringify({ reason: "No existe proveedor activo para la categoría" })],
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
        [order.rows[0].id, product.id, suggestedQuantity, product.unit_price],
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
       WHERE r.code='PURCHASE_MANAGER' AND u.active`,
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
     WHERE r.code=$1 AND u.active`,
    [roleCode, title, message, eventCode],
  );
}
