ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS delay_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (delay_minutes >= 0 AND delay_minutes <= 10080);

UPDATE shipments
SET delay_minutes = GREATEST(
  30,
  ROUND(EXTRACT(EPOCH FROM (NOW()-eta_at))/60)::INTEGER
)
WHERE status='RETRASADO' AND delay_minutes=0;

CREATE INDEX IF NOT EXISTS idx_shipments_operational_alerts
  ON shipments(status,delay_minutes,eta_at)
  WHERE status<>'ENTREGADO';
