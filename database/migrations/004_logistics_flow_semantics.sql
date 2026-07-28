DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'route_purpose') THEN
    CREATE TYPE route_purpose AS ENUM ('ENTRADA_COMPRA', 'SALIDA_DISTRIBUCION', 'AMBOS');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shipment_flow_type') THEN
    CREATE TYPE shipment_flow_type AS ENUM ('ENTRADA_COMPRA', 'SALIDA_DISTRIBUCION');
  END IF;
END $$;

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS purpose route_purpose NOT NULL DEFAULT 'AMBOS';

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS flow_type shipment_flow_type;

UPDATE shipments
SET flow_type = CASE
  WHEN purchase_order_id IS NOT NULL THEN 'ENTRADA_COMPRA'::shipment_flow_type
  ELSE 'SALIDA_DISTRIBUCION'::shipment_flow_type
END
WHERE flow_type IS NULL;

-- El origen de una compra es el proveedor o punto de recogida, no un almacén
-- cuyo stock deba disminuir. El destino sí debe ser un almacén de recepción.
UPDATE shipments
SET origin_warehouse_id = NULL
WHERE flow_type = 'ENTRADA_COMPRA'
  AND origin_warehouse_id IS NOT NULL;

ALTER TABLE shipments
  ALTER COLUMN flow_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipments_flow_consistent'
  ) THEN
    ALTER TABLE shipments
      ADD CONSTRAINT shipments_flow_consistent CHECK (
        (
          flow_type = 'ENTRADA_COMPRA'
          AND purchase_order_id IS NOT NULL
          AND origin_warehouse_id IS NULL
          AND destination_warehouse_id IS NOT NULL
        )
        OR
        (
          flow_type = 'SALIDA_DISTRIBUCION'
          AND purchase_order_id IS NULL
          AND origin_warehouse_id IS NOT NULL
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_routes_purpose_active
  ON routes (purpose, active);

CREATE INDEX IF NOT EXISTS idx_shipments_flow_status
  ON shipments (flow_type, status);
