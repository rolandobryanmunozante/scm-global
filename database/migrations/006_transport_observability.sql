ALTER TYPE shipment_event_type ADD VALUE IF NOT EXISTS 'RETRASO';
ALTER TYPE shipment_event_type ADD VALUE IF NOT EXISTS 'RESOLUCION';

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS current_latitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS current_longitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS last_position_at TIMESTAMPTZ;

UPDATE vehicles v
SET current_latitude = s.current_latitude,
    current_longitude = s.current_longitude,
    last_position_at = COALESCE(position_event.created_at, s.updated_at)
FROM shipments s
LEFT JOIN LATERAL (
  SELECT e.created_at
  FROM shipment_events e
  WHERE e.shipment_id = s.id
    AND e.latitude IS NOT NULL
    AND e.longitude IS NOT NULL
  ORDER BY e.created_at DESC
  LIMIT 1
) position_event ON TRUE
WHERE s.vehicle_id = v.id
  AND s.status IN ('EN_TRANSITO', 'EN_ADUANA', 'RETRASADO', 'INCIDENCIA')
  AND s.current_latitude IS NOT NULL
  AND s.current_longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_last_position
  ON vehicles (last_position_at DESC)
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_shipment_events_position
  ON shipment_events (shipment_id, created_at DESC)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
