-- Completa las paradas históricas para que el contrato de rutas siempre incluya país.
UPDATE routes route
SET stops = normalized.stops
FROM (
  SELECT
    route_row.id,
    COALESCE(
      jsonb_agg(
        CASE
          WHEN stop.point ? 'country' AND NULLIF(BTRIM(stop.point->>'country'), '') IS NOT NULL
            THEN stop.point
          ELSE jsonb_set(
            stop.point,
            '{country}',
            to_jsonb(
              CASE LOWER(stop.point->>'name')
                WHEN 'desaguadero' THEN 'Bolivia'
                WHEN 'cochabamba' THEN 'Bolivia'
                WHEN 'campo grande' THEN 'Brasil'
                WHEN 'corumbá' THEN 'Brasil'
                WHEN 'corumbÃ¡' THEN 'Brasil'
                WHEN 'córdoba' THEN 'Argentina'
                WHEN 'cÃ³rdoba' THEN 'Argentina'
                WHEN 'jujuy' THEN 'Argentina'
                ELSE route_row.origin_country
              END
            ),
            TRUE
          )
        END
        ORDER BY stop.position
      ) FILTER (WHERE stop.point IS NOT NULL),
      '[]'::JSONB
    ) AS stops
  FROM routes route_row
  LEFT JOIN LATERAL jsonb_array_elements(route_row.stops)
    WITH ORDINALITY AS stop(point, position) ON TRUE
  GROUP BY route_row.id
) normalized
WHERE normalized.id = route.id
  AND route.stops IS DISTINCT FROM normalized.stops;

-- Cada proveedor activo tiene una cuenta demostrativa propia para participar en
-- la confirmación de sus órdenes. Todas usan la contraseña documentada SCM2026!.
INSERT INTO users(full_name,email,password_hash,role_id,supplier_id,language)
SELECT
  'Portal ' || supplier.commercial_name,
  CASE supplier.code
    WHEN 'PRV-0001' THEN 'proveedor@scm.local'
    WHEN 'PRV-0002' THEN 'proveedor.brasil@scm.local'
    WHEN 'PRV-0003' THEN 'proveedor.pacifico@scm.local'
    WHEN 'PRV-0004' THEN 'proveedor.salud@scm.local'
    ELSE LOWER(REPLACE(supplier.code, '_', '.')) || '@scm.local'
  END,
  crypt('SCM2026!', gen_salt('bf', 12)),
  role_record.id,
  supplier.id,
  'es'
FROM suppliers supplier
CROSS JOIN roles role_record
WHERE role_record.code='SUPPLIER'
  AND supplier.active
ON CONFLICT (email) DO UPDATE
SET supplier_id=EXCLUDED.supplier_id,
    role_id=EXCLUDED.role_id,
    active=TRUE,
    updated_at=NOW();

-- Las cargas históricas se alinean con el nuevo relevo de responsabilidades:
-- proveedor confirmado antes de preparar, orden enviada después de salir.
UPDATE purchase_orders purchase_order
SET status='CONFIRMADA',
    supplier_confirmed_at=COALESCE(purchase_order.supplier_confirmed_at, shipment.created_at),
    updated_at=NOW()
FROM shipments shipment
WHERE shipment.purchase_order_id=purchase_order.id
  AND shipment.status IN ('PREPARANDO','ASIGNADO')
  AND purchase_order.status<>'RECIBIDA';

UPDATE purchase_orders purchase_order
SET status='ENVIADA',
    supplier_confirmed_at=COALESCE(
      purchase_order.supplier_confirmed_at,
      purchase_order.approved_at,
      shipment.created_at
    ),
    updated_at=NOW()
FROM shipments shipment
WHERE shipment.purchase_order_id=purchase_order.id
  AND shipment.status IN (
    'EN_TRANSITO','EN_ADUANA','INCIDENCIA','RETRASADO','PENDIENTE_RECEPCION'
  )
  AND purchase_order.status<>'RECIBIDA';

CREATE OR REPLACE FUNCTION validate_inbound_shipment_state()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM shipments shipment
    JOIN purchase_orders purchase_order ON purchase_order.id=shipment.purchase_order_id
    WHERE shipment.flow_type='ENTRADA_COMPRA'
      AND (
        purchase_order.supplier_confirmed_at IS NULL
        OR
        (
          shipment.status IN ('PREPARANDO','ASIGNADO')
          AND purchase_order.status<>'CONFIRMADA'
        )
        OR
        (
          shipment.status IN (
            'EN_TRANSITO','EN_ADUANA','INCIDENCIA','RETRASADO','PENDIENTE_RECEPCION'
          )
          AND purchase_order.status<>'ENVIADA'
        )
        OR
        (
          shipment.status='ENTREGADO'
          AND (
            purchase_order.status<>'RECIBIDA'
            OR shipment.inventory_received_at IS NULL
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'El estado de una compra entrante no coincide con su envío';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='shipments_assignment_consistent'
  ) THEN
    ALTER TABLE shipments
      ADD CONSTRAINT shipments_assignment_consistent CHECK (
        status<>'ASIGNADO'
        OR (
          vehicle_id IS NOT NULL
          AND driver_id IS NOT NULL
          AND departure_at IS NULL
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='shipments_reception_handoff_consistent'
  ) THEN
    ALTER TABLE shipments
      ADD CONSTRAINT shipments_reception_handoff_consistent CHECK (
        status<>'PENDIENTE_RECEPCION'
        OR (
          destination_warehouse_id IS NOT NULL
          AND delivered_at IS NULL
          AND inventory_received_at IS NULL
        )
      );
  END IF;
END $$;
