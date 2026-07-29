-- Catálogos explícitos por proveedor y reservas derivadas de envíos reales.

CREATE TABLE IF NOT EXISTS supplier_products (
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  lead_time_days INTEGER NOT NULL DEFAULT 7 CHECK (lead_time_days BETWEEN 0 AND 365),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (supplier_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_products_catalog
  ON supplier_products (supplier_id, active, product_id);

-- Conserva toda relación histórica ya utilizada por una orden de compra.
INSERT INTO supplier_products (supplier_id, product_id, unit_price, lead_time_days)
SELECT
  purchase_order.supplier_id,
  item.product_id,
  item.unit_price,
  7
FROM purchase_orders purchase_order
JOIN purchase_order_items item ON item.purchase_order_id = purchase_order.id
ON CONFLICT (supplier_id, product_id) DO NOTHING;

-- Catálogos demostrativos: pueden compartir rubro, pero no necesariamente productos o precios.
INSERT INTO supplier_products (supplier_id, product_id, unit_price, lead_time_days)
SELECT
  supplier.id,
  product.id,
  ROUND(product.unit_price * catalog.price_factor, 2),
  catalog.lead_time_days
FROM (VALUES
  ('PRV-0001', 'ELEC-001', 1.02::NUMERIC, 3),
  ('PRV-0001', 'ELEC-002', 1.01::NUMERIC, 4),
  ('PRV-0001', 'ELEC-003', 1.04::NUMERIC, 5),
  ('PRV-0002', 'ELEC-001', 0.96::NUMERIC, 12),
  ('PRV-0002', 'ELEC-003', 0.94::NUMERIC, 14),
  ('PRV-0003', 'ALIM-001', 1.00::NUMERIC, 8),
  ('PRV-0003', 'ALIM-002', 0.98::NUMERIC, 9),
  ('PRV-0004', 'FARM-001', 1.03::NUMERIC, 10),
  ('PRV-0004', 'FARM-002', 1.05::NUMERIC, 12)
) AS catalog(supplier_code, sku, price_factor, lead_time_days)
JOIN suppliers supplier ON supplier.code = catalog.supplier_code
JOIN products product ON product.sku = catalog.sku
ON CONFLICT (supplier_id, product_id)
DO UPDATE SET
  unit_price = EXCLUDED.unit_price,
  lead_time_days = EXCLUDED.lead_time_days,
  active = TRUE,
  updated_at = NOW();

-- Las reservas solo existen mientras un envío de distribución está preparado.
UPDATE stocks SET reserved_quantity = 0, updated_at = NOW()
WHERE reserved_quantity <> 0;

UPDATE stocks stock
SET
  reserved_quantity = reservation.quantity,
  updated_at = NOW()
FROM (
  SELECT
    shipment.origin_warehouse_id AS warehouse_id,
    item.product_id,
    SUM(item.quantity)::INTEGER AS quantity
  FROM shipments shipment
  JOIN shipment_items item ON item.shipment_id = shipment.id
  WHERE shipment.flow_type = 'SALIDA_DISTRIBUCION'
    AND shipment.status = 'PREPARANDO'
    AND shipment.inventory_reserved_at IS NOT NULL
    AND shipment.inventory_dispatched_at IS NULL
  GROUP BY shipment.origin_warehouse_id, item.product_id
) reservation
WHERE stock.warehouse_id = reservation.warehouse_id
  AND stock.product_id = reservation.product_id;

ALTER TABLE shipment_events
  ADD COLUMN IF NOT EXISTS incident_type VARCHAR(30);

UPDATE shipment_events
SET incident_type = 'MECANICA'
WHERE event_type = 'INCIDENCIA'
  AND incident_type IS NULL
  AND description ILIKE '%mecán%';

UPDATE shipment_events
SET incident_type = 'OTRA'
WHERE event_type = 'INCIDENCIA'
  AND incident_type IS NULL;
