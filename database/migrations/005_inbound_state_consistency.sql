-- Repara bases que permitieron recibir manualmente una orden mientras su envío
-- seguía activo. El inventario ya fue recibido, por lo que se cierra el envío sin
-- volver a sumar existencias.
INSERT INTO shipment_events(
  shipment_id,user_id,event_type,status,description,latitude,longitude,created_at
)
SELECT
  s.id,
  po.received_by,
  'ENTREGA',
  'ENTREGADO',
  'Envío cerrado automáticamente: la orden vinculada ya había sido recibida en inventario',
  r.destination_latitude,
  r.destination_longitude,
  COALESCE(po.received_at,NOW())
FROM shipments s
JOIN purchase_orders po ON po.id=s.purchase_order_id
JOIN routes r ON r.id=s.route_id
WHERE s.flow_type='ENTRADA_COMPRA'
  AND po.status='RECIBIDA'
  AND s.status<>'ENTREGADO'
  AND NOT EXISTS (
    SELECT 1 FROM shipment_events e
    WHERE e.shipment_id=s.id AND e.event_type='ENTREGA'
  );

UPDATE shipments s
SET status='ENTREGADO',
    delivered_at=COALESCE(s.delivered_at,po.received_at,NOW()),
    inventory_received_at=COALESCE(s.inventory_received_at,po.received_at,NOW()),
    current_latitude=r.destination_latitude,
    current_longitude=r.destination_longitude,
    updated_at=NOW()
FROM purchase_orders po,routes r
WHERE po.id=s.purchase_order_id
  AND r.id=s.route_id
  AND s.flow_type='ENTRADA_COMPRA'
  AND po.status='RECIBIDA'
  AND s.status<>'ENTREGADO';

CREATE OR REPLACE FUNCTION validate_inbound_shipment_state()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM shipments s
    JOIN purchase_orders po ON po.id=s.purchase_order_id
    WHERE s.flow_type='ENTRADA_COMPRA'
      AND (
        (s.status='ENTREGADO' AND (po.status<>'RECIBIDA' OR s.inventory_received_at IS NULL))
        OR
        (s.status<>'ENTREGADO' AND po.status='RECIBIDA')
      )
  ) THEN
    RAISE EXCEPTION 'El estado de una compra entrante no coincide con su envío';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_inbound_order_state ON purchase_orders;
CREATE CONSTRAINT TRIGGER trg_validate_inbound_order_state
AFTER INSERT OR UPDATE OF status ON purchase_orders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_inbound_shipment_state();

DROP TRIGGER IF EXISTS trg_validate_inbound_shipment_state ON shipments;
CREATE CONSTRAINT TRIGGER trg_validate_inbound_shipment_state
AFTER INSERT OR UPDATE OF status,inventory_received_at,purchase_order_id,flow_type ON shipments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_inbound_shipment_state();
