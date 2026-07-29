-- Las plantillas mixtas solo son reversibles cuando ambos extremos son almacenes.
-- Clasifica las plantillas históricas de un solo almacén según la dirección real.
UPDATE routes
SET purpose=CASE
  WHEN origin_warehouse_id IS NOT NULL AND destination_warehouse_id IS NULL
    THEN 'SALIDA_DISTRIBUCION'::route_purpose
  WHEN origin_warehouse_id IS NULL AND destination_warehouse_id IS NOT NULL
    THEN 'ENTRADA_COMPRA'::route_purpose
  ELSE purpose
END
WHERE purpose='AMBOS'
  AND (
    (origin_warehouse_id IS NOT NULL AND destination_warehouse_id IS NULL)
    OR
    (origin_warehouse_id IS NULL AND destination_warehouse_id IS NOT NULL)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='routes_purpose_endpoints_consistent'
  ) THEN
    ALTER TABLE routes
      ADD CONSTRAINT routes_purpose_endpoints_consistent CHECK (
        (purpose='ENTRADA_COMPRA' AND destination_warehouse_id IS NOT NULL)
        OR
        (purpose='SALIDA_DISTRIBUCION' AND origin_warehouse_id IS NOT NULL)
        OR
        (
          purpose='AMBOS'
          AND origin_warehouse_id IS NOT NULL
          AND destination_warehouse_id IS NOT NULL
        )
      );
  END IF;
END $$;
