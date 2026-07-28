ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS received_by BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_warehouse_id BIGINT REFERENCES warehouses(id);

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS origin_warehouse_id BIGINT REFERENCES warehouses(id),
  ADD COLUMN IF NOT EXISTS destination_warehouse_id BIGINT REFERENCES warehouses(id),
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS origin_warehouse_id BIGINT REFERENCES warehouses(id),
  ADD COLUMN IF NOT EXISTS destination_warehouse_id BIGINT REFERENCES warehouses(id),
  ADD COLUMN IF NOT EXISTS inventory_reserved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inventory_dispatched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inventory_received_at TIMESTAMPTZ;

UPDATE routes r
SET origin_warehouse_id = w.id
FROM warehouses w
WHERE r.origin_warehouse_id IS NULL
  AND LOWER(r.origin_name) = LOWER(w.name)
  AND LOWER(r.origin_country) = LOWER(w.country);

UPDATE routes r
SET destination_warehouse_id = w.id
FROM warehouses w
WHERE r.destination_warehouse_id IS NULL
  AND LOWER(r.destination_name) = LOWER(w.name)
  AND LOWER(r.destination_country) = LOWER(w.country);

UPDATE shipments s
SET origin_warehouse_id = r.origin_warehouse_id,
    destination_warehouse_id = r.destination_warehouse_id
FROM routes r
WHERE r.id = s.route_id
  AND (s.origin_warehouse_id IS NULL OR s.destination_warehouse_id IS NULL);

INSERT INTO permissions (code, name) VALUES
  ('purchases.write', 'Crear órdenes de compra'),
  ('purchases.receive', 'Recibir órdenes de compra'),
  ('inventory.catalog', 'Gestionar productos y almacenes'),
  ('transport.resources', 'Gestionar vehículos'),
  ('tracking.read', 'Consultar rastreo de envíos')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'purchases.write'
WHERE r.code = 'PURCHASE_MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('purchases.receive', 'inventory.catalog')
WHERE r.code = 'INVENTORY_MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'transport.resources'
WHERE r.code = 'LOGISTICS_MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'tracking.read'
WHERE r.code = 'CLIENT'
ON CONFLICT DO NOTHING;

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'CLIENT'
  AND p.code = 'shipments.read';

CREATE INDEX IF NOT EXISTS idx_purchase_orders_received_warehouse
  ON purchase_orders (received_warehouse_id, received_at);
CREATE INDEX IF NOT EXISTS idx_routes_warehouses
  ON routes (origin_warehouse_id, destination_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_shipments_warehouses
  ON shipments (origin_warehouse_id, destination_warehouse_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shipments_purchase_order
  ON shipments (purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_reception_consistent'
  ) THEN
    ALTER TABLE purchase_orders
      ADD CONSTRAINT purchase_orders_reception_consistent CHECK (
        (status = 'RECIBIDA' AND received_at IS NOT NULL AND received_by IS NOT NULL AND received_warehouse_id IS NOT NULL)
        OR status <> 'RECIBIDA'
      );
  END IF;
END $$;
