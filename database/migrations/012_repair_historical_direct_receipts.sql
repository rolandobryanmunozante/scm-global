-- Versiones anteriores permitían recibir una compra sin transporte. Conservamos
-- el movimiento de inventario existente y reconstruimos únicamente su trazabilidad
-- logística para que todo el historial respete el flujo vigente.
UPDATE purchase_orders purchase_order
SET supplier_confirmed_at=COALESCE(
      purchase_order.supplier_confirmed_at,
      purchase_order.approved_at,
      purchase_order.created_at
    ),
    updated_at=NOW()
WHERE purchase_order.status='RECIBIDA'
  AND NOT EXISTS (
    SELECT 1 FROM shipments shipment
    WHERE shipment.purchase_order_id=purchase_order.id
  );

INSERT INTO routes(
  name,origin_name,origin_country,origin_latitude,origin_longitude,
  destination_name,destination_country,destination_latitude,destination_longitude,
  stops,transport_mode,estimated_distance_km,estimated_duration_hours,
  customs_required,is_template,created_by,origin_warehouse_id,
  destination_warehouse_id,purpose,active
)
SELECT
  'Trazabilidad histórica ' || purchase_order.code,
  supplier.commercial_name,
  supplier.country,
  COALESCE(candidate_route.origin_latitude,warehouse.latitude),
  COALESCE(candidate_route.origin_longitude,warehouse.longitude),
  warehouse.name,
  warehouse.country,
  warehouse.latitude,
  warehouse.longitude,
  '[]'::JSONB,
  COALESCE(candidate_route.transport_mode,'TERRESTRE'::transport_mode),
  COALESCE(candidate_route.estimated_distance_km,1),
  COALESCE(candidate_route.estimated_duration_hours,1),
  LOWER(supplier.country)<>LOWER(warehouse.country),
  FALSE,
  logistics.id,
  NULL,
  warehouse.id,
  'ENTRADA_COMPRA',
  FALSE
FROM purchase_orders purchase_order
JOIN suppliers supplier ON supplier.id=purchase_order.supplier_id
JOIN warehouses warehouse ON warehouse.id=purchase_order.received_warehouse_id
CROSS JOIN LATERAL (
  SELECT user_account.id
  FROM users user_account
  JOIN roles role_record ON role_record.id=user_account.role_id
  WHERE role_record.code='LOGISTICS_MANAGER' AND user_account.active
  ORDER BY user_account.id
  LIMIT 1
) logistics
LEFT JOIN LATERAL (
  SELECT route.*
  FROM routes route
  WHERE LOWER(route.origin_country)=LOWER(supplier.country)
  ORDER BY
    CASE
      WHEN LOWER(route.origin_name) LIKE '%' || LOWER(supplier.commercial_name) || '%'
        THEN 0
      ELSE 1
    END,
    route.id
  LIMIT 1
) candidate_route ON TRUE
WHERE purchase_order.status='RECIBIDA'
  AND NOT EXISTS (
    SELECT 1 FROM shipments shipment
    WHERE shipment.purchase_order_id=purchase_order.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM routes route
    WHERE route.name='Trazabilidad histórica ' || purchase_order.code
  );

INSERT INTO shipments(
  tracking_code,route_id,purchase_order_id,vehicle_id,driver_id,
  origin,destination,status,total_weight_kg,total_volume_m3,
  current_latitude,current_longitude,departure_at,eta_at,delivered_at,
  origin_warehouse_id,destination_warehouse_id,inventory_reserved_at,
  inventory_dispatched_at,inventory_received_at,flow_type,created_at,updated_at
)
SELECT
  'SCM-HIST-' || purchase_order.id,
  route.id,
  purchase_order.id,
  vehicle.id,
  driver.id,
  route.origin_name,
  route.destination_name,
  'ENTREGADO',
  GREATEST(1,details.total_units),
  GREATEST(0.1,details.total_units::NUMERIC/100),
  route.destination_latitude,
  route.destination_longitude,
  purchase_order.received_at-INTERVAL '2 days',
  purchase_order.received_at,
  purchase_order.received_at,
  NULL,
  purchase_order.received_warehouse_id,
  NULL,
  NULL,
  purchase_order.received_at,
  'ENTRADA_COMPRA',
  LEAST(purchase_order.created_at,purchase_order.received_at-INTERVAL '3 days'),
  purchase_order.received_at
FROM purchase_orders purchase_order
JOIN routes route ON route.name='Trazabilidad histórica ' || purchase_order.code
JOIN LATERAL (
  SELECT COALESCE(SUM(item.quantity),1)::INTEGER AS total_units
  FROM purchase_order_items item
  WHERE item.purchase_order_id=purchase_order.id
) details ON TRUE
JOIN LATERAL (
  SELECT vehicle_record.id
  FROM vehicles vehicle_record
  WHERE vehicle_record.active
    AND vehicle_record.transport_mode=route.transport_mode
  ORDER BY vehicle_record.id
  LIMIT 1
) vehicle ON TRUE
JOIN LATERAL (
  SELECT user_account.id
  FROM users user_account
  JOIN roles role_record ON role_record.id=user_account.role_id
  WHERE role_record.code='DRIVER'
    AND user_account.active
    AND user_account.license_expiry>=CURRENT_DATE
  ORDER BY user_account.id
  LIMIT 1
) driver ON TRUE
WHERE purchase_order.status='RECIBIDA'
  AND NOT EXISTS (
    SELECT 1 FROM shipments shipment
    WHERE shipment.purchase_order_id=purchase_order.id
  )
ON CONFLICT (tracking_code) DO NOTHING;

INSERT INTO shipment_items(shipment_id,product_id,quantity)
SELECT shipment.id,item.product_id,item.quantity
FROM shipments shipment
JOIN purchase_order_items item ON item.purchase_order_id=shipment.purchase_order_id
WHERE shipment.tracking_code LIKE 'SCM-HIST-%'
ON CONFLICT (shipment_id,product_id) DO NOTHING;

INSERT INTO shipment_events(
  shipment_id,user_id,event_type,status,description,latitude,longitude,created_at
)
SELECT
  shipment.id,
  CASE event.actor
    WHEN 'LOGISTICA' THEN logistics.id
    WHEN 'TRANSPORTISTA' THEN shipment.driver_id
    ELSE purchase_order.received_by
  END,
  event.event_type::shipment_event_type,
  event.status::shipment_status,
  event.description,
  CASE
    WHEN event.event_type IN ('ARRIBO','ENTREGA') THEN route.destination_latitude
    ELSE route.origin_latitude
  END,
  CASE
    WHEN event.event_type IN ('ARRIBO','ENTREGA') THEN route.destination_longitude
    ELSE route.origin_longitude
  END,
  purchase_order.received_at-event.offset_before
FROM shipments shipment
JOIN purchase_orders purchase_order ON purchase_order.id=shipment.purchase_order_id
JOIN routes route ON route.id=shipment.route_id
CROSS JOIN LATERAL (
  SELECT user_account.id
  FROM users user_account
  JOIN roles role_record ON role_record.id=user_account.role_id
  WHERE role_record.code='LOGISTICS_MANAGER' AND user_account.active
  ORDER BY user_account.id
  LIMIT 1
) logistics
CROSS JOIN (VALUES
  ('LOGISTICA','CREADO','PREPARANDO','Envío histórico creado desde la orden confirmada',INTERVAL '3 days'),
  ('LOGISTICA','ASIGNACION','ASIGNADO','Vehículo y transportista asignados',INTERVAL '2 days 1 hour'),
  ('TRANSPORTISTA','ACEPTACION','EN_TRANSITO','Carga aceptada y traslado histórico iniciado',INTERVAL '2 days'),
  ('TRANSPORTISTA','ARRIBO','PENDIENTE_RECEPCION','Arribo histórico registrado en el almacén',INTERVAL '1 hour'),
  ('INVENTARIO','ENTREGA','ENTREGADO','Recepción histórica conciliada con el movimiento de inventario existente',INTERVAL '0')
) event(actor,event_type,status,description,offset_before)
WHERE shipment.tracking_code LIKE 'SCM-HIST-%'
  AND NOT EXISTS (
    SELECT 1
    FROM shipment_events existing
    WHERE existing.shipment_id=shipment.id
      AND existing.event_type::TEXT=event.event_type
  );

CREATE OR REPLACE FUNCTION validate_inbound_shipment_state()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM purchase_orders purchase_order
    WHERE purchase_order.status='RECIBIDA'
      AND NOT EXISTS (
        SELECT 1
        FROM shipments shipment
        WHERE shipment.purchase_order_id=purchase_order.id
          AND shipment.flow_type='ENTRADA_COMPRA'
      )
  ) OR EXISTS (
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
