-- Datos correlacionados para demostrar compras, inventario, transporte, alertas,
-- rastreo y auditoría en varias etapas del ciclo operativo.

INSERT INTO products (
  sku, name, category_id, minimum_stock, maximum_stock, unit_of_measure, unit_price
)
SELECT v.sku, v.name, c.id, v.minimum_stock, v.maximum_stock, v.unit_of_measure, v.unit_price
FROM (VALUES
  ('ELEC-003', 'Gateway de telemetría vehicular', 'Electrónica', 12, 100, 'unidad', 1250.00),
  ('ALIM-002', 'Ración logística de emergencia', 'Alimentos', 80, 800, 'caja', 135.00),
  ('FARM-002', 'Monitor portátil de signos vitales', 'Farmacéutica', 10, 80, 'unidad', 2890.00),
  ('TEXT-002', 'Equipo de protección impermeable', 'Textiles', 35, 260, 'unidad', 340.00),
  ('REP-002', 'Kit de mantenimiento de flota', 'Repuestos', 18, 150, 'kit', 780.00)
) AS v(sku, name, category, minimum_stock, maximum_stock, unit_of_measure, unit_price)
JOIN categories c ON c.name = v.category
ON CONFLICT (sku) DO NOTHING;

INSERT INTO warehouses (code, name, address, city, country, latitude, longitude)
VALUES
  ('ALM-SAO', 'Centro São Paulo', 'Av. Paulista 1800', 'São Paulo', 'Brasil', -23.5505000, -46.6333000),
  ('ALM-BUE', 'Centro Buenos Aires', 'Av. del Libertador 1200', 'Buenos Aires', 'Argentina', -34.6037000, -58.3816000)
ON CONFLICT (code) DO NOTHING;

INSERT INTO stocks (product_id, warehouse_id, current_quantity, reserved_quantity)
SELECT
  p.id,
  w.id,
  90 + ((p.id * w.id * 13)::INTEGER % 210),
  0
FROM products p
CROSS JOIN warehouses w
ON CONFLICT (product_id, warehouse_id) DO NOTHING;

INSERT INTO users (
  full_name, email, password_hash, role_id, language, license_number, license_expiry
)
SELECT
  v.full_name,
  v.email,
  crypt('SCM2026!', gen_salt('bf', 12)),
  r.id,
  'es',
  v.license_number,
  CURRENT_DATE + 540
FROM (VALUES
  ('Marco Ruta Brasil', 'marco.transportista@scm.local', 'LIC-BR-44021'),
  ('Sofía Ruta Argentina', 'sofia.transportista@scm.local', 'LIC-AR-55034'),
  ('Diego Ruta Perú', 'diego.transportista@scm.local', 'LIC-PE-66018'),
  ('Elena Distribución Bolivia', 'elena.transportista@scm.local', 'LIC-BO-88042')
) AS v(full_name, email, license_number)
CROSS JOIN roles r
WHERE r.code = 'DRIVER'
ON CONFLICT (email) DO NOTHING;

INSERT INTO vehicles (
  plate, type, transport_mode, capacity_kg, capacity_m3, current_location,
  current_latitude, current_longitude, last_position_at
)
VALUES
  ('BR-TRK-404', 'Camión internacional caja seca', 'TERRESTRE', 20000, 72, 'Corumbá, Brasil', -19.0090000, -57.6530000, NOW() - INTERVAL '8 minutes'),
  ('AR-TRK-505', 'Camión internacional con remolque', 'TERRESTRE', 22000, 78, 'Jujuy, Argentina', -24.1858000, -65.2995000, NOW() - INTERVAL '18 minutes'),
  ('PE-TRK-606', 'Camión de distribución regional', 'TERRESTRE', 15000, 54, 'Desaguadero, Perú', -16.5656000, -69.0417000, NOW() - INTERVAL '4 minutes'),
  ('BO-TRK-303', 'Camión urbano de reparto', 'TERRESTRE', 9000, 36, 'Santa Cruz, Bolivia', -17.7833000, -63.1821000, NOW() - INTERVAL '55 minutes'),
  ('BO-VAN-707', 'Furgón de última milla', 'TERRESTRE', 3500, 18, 'Cochabamba, Bolivia', -17.3895000, -66.1568000, NOW() - INTERVAL '3 hours')
ON CONFLICT (plate) DO NOTHING;

INSERT INTO routes (
  name, origin_name, origin_country, origin_latitude, origin_longitude,
  destination_name, destination_country, destination_latitude, destination_longitude,
  stops, transport_mode, estimated_distance_km, estimated_duration_hours,
  customs_required, created_by, origin_warehouse_id, destination_warehouse_id, purpose
)
SELECT
  v.name, v.origin_name, v.origin_country, v.origin_latitude, v.origin_longitude,
  v.destination_name, v.destination_country, v.destination_latitude, v.destination_longitude,
  v.stops::JSONB, 'TERRESTRE', v.distance_km, v.duration_hours, v.customs_required,
  logistics.id, origin_warehouse.id, destination_warehouse.id,
  v.purpose::route_purpose
FROM (VALUES
  (
    'Lima proveedor - La Paz',
    'Pacífico Foods Lima', 'Perú', -12.0464000::NUMERIC, -77.0428000::NUMERIC,
    'Centro La Paz', 'Bolivia', -16.5000000::NUMERIC, -68.1500000::NUMERIC,
    '[{"name":"Desaguadero","lat":-16.5656,"lng":-69.0417}]',
    1160.00::NUMERIC, 25.50::NUMERIC, TRUE,
    NULL::VARCHAR, 'ALM-LPZ', 'ENTRADA_COMPRA'
  ),
  (
    'São Paulo proveedor - Santa Cruz',
    'Brasil Components São Paulo', 'Brasil', -23.5505000::NUMERIC, -46.6333000::NUMERIC,
    'Centro Santa Cruz', 'Bolivia', -17.7833000::NUMERIC, -63.1821000::NUMERIC,
    '[{"name":"Campo Grande","lat":-20.4697,"lng":-54.6201},{"name":"Corumbá","lat":-19.0090,"lng":-57.6530}]',
    1900.00::NUMERIC, 35.00::NUMERIC, TRUE,
    NULL::VARCHAR, 'ALM-SCZ', 'ENTRADA_COMPRA'
  ),
  (
    'Buenos Aires proveedor - La Paz',
    'Salud Global Buenos Aires', 'Argentina', -34.6037000::NUMERIC, -58.3816000::NUMERIC,
    'Centro La Paz', 'Bolivia', -16.5000000::NUMERIC, -68.1500000::NUMERIC,
    '[{"name":"Córdoba","lat":-31.4201,"lng":-64.1888},{"name":"Jujuy","lat":-24.1858,"lng":-65.2995}]',
    2700.00::NUMERIC, 48.00::NUMERIC, TRUE,
    NULL::VARCHAR, 'ALM-LPZ', 'ENTRADA_COMPRA'
  ),
  (
    'El Alto proveedor - La Paz',
    'Andes Tech El Alto', 'Bolivia', -16.5047000::NUMERIC, -68.1635000::NUMERIC,
    'Centro La Paz', 'Bolivia', -16.5000000::NUMERIC, -68.1500000::NUMERIC,
    '[]', 18.00::NUMERIC, 1.20::NUMERIC, FALSE,
    NULL::VARCHAR, 'ALM-LPZ', 'ENTRADA_COMPRA'
  ),
  (
    'La Paz - Santa Cruz distribución',
    'Centro La Paz', 'Bolivia', -16.5000000::NUMERIC, -68.1500000::NUMERIC,
    'Centro Santa Cruz', 'Bolivia', -17.7833000::NUMERIC, -63.1821000::NUMERIC,
    '[{"name":"Cochabamba","lat":-17.3895,"lng":-66.1568}]',
    855.00::NUMERIC, 17.50::NUMERIC, FALSE,
    'ALM-LPZ', 'ALM-SCZ', 'SALIDA_DISTRIBUCION'
  ),
  (
    'Santa Cruz - La Paz distribución',
    'Centro Santa Cruz', 'Bolivia', -17.7833000::NUMERIC, -63.1821000::NUMERIC,
    'Centro La Paz', 'Bolivia', -16.5000000::NUMERIC, -68.1500000::NUMERIC,
    '[{"name":"Cochabamba","lat":-17.3895,"lng":-66.1568}]',
    855.00::NUMERIC, 17.50::NUMERIC, FALSE,
    'ALM-SCZ', 'ALM-LPZ', 'SALIDA_DISTRIBUCION'
  ),
  (
    'Santa Cruz - Cliente Cochabamba',
    'Centro Santa Cruz', 'Bolivia', -17.7833000::NUMERIC, -63.1821000::NUMERIC,
    'Cliente industrial Cochabamba', 'Bolivia', -17.3895000::NUMERIC, -66.1568000::NUMERIC,
    '[]', 475.00::NUMERIC, 9.00::NUMERIC, FALSE,
    'ALM-SCZ', NULL::VARCHAR, 'SALIDA_DISTRIBUCION'
  )
) AS v(
  name, origin_name, origin_country, origin_latitude, origin_longitude,
  destination_name, destination_country, destination_latitude, destination_longitude,
  stops, distance_km, duration_hours, customs_required,
  origin_warehouse_code, destination_warehouse_code, purpose
)
CROSS JOIN users logistics
LEFT JOIN warehouses origin_warehouse ON origin_warehouse.code = v.origin_warehouse_code
LEFT JOIN warehouses destination_warehouse ON destination_warehouse.code = v.destination_warehouse_code
WHERE logistics.email = 'logistica@scm.local'
  AND NOT EXISTS (SELECT 1 FROM routes existing WHERE existing.name = v.name);

INSERT INTO purchase_orders (
  code, supplier_id, status, automatic, generated_by, approved_by,
  expected_delivery_date, supplier_confirmed_at, supplier_document_url,
  notes, created_at, approved_at, received_by, received_at, received_warehouse_id
)
SELECT
  v.code,
  supplier.id,
  v.status::purchase_order_status,
  v.automatic,
  purchases.id,
  CASE WHEN v.status = 'BORRADOR' THEN NULL ELSE purchases.id END,
  CURRENT_DATE + v.delivery_offset,
  CASE WHEN v.status IN ('CONFIRMADA', 'RECIBIDA') THEN NOW() - INTERVAL '2 days' ELSE NULL END,
  CASE WHEN v.status IN ('CONFIRMADA', 'RECIBIDA') THEN 'https://example.com/documentos/' || LOWER(v.code) || '.pdf' ELSE NULL END,
  v.notes,
  NOW() - (v.age_days || ' days')::INTERVAL,
  CASE WHEN v.status = 'BORRADOR' THEN NULL ELSE NOW() - ((v.age_days - 1) || ' days')::INTERVAL END,
  CASE WHEN v.status = 'RECIBIDA' THEN inventory.id ELSE NULL END,
  CASE WHEN v.status = 'RECIBIDA' THEN NOW() - INTERVAL '1 day' ELSE NULL END,
  CASE WHEN v.status = 'RECIBIDA' THEN received_warehouse.id ELSE NULL END
FROM (VALUES
  ('OC-2026-0002', 'PRV-0003', 'APROBADA', FALSE, 8, 9, 'Reposición de alimentos para almacén La Paz', NULL::VARCHAR),
  ('OC-2026-0003', 'PRV-0002', 'ENVIADA', FALSE, 10, 7, 'Sensores industriales con seguimiento internacional', NULL::VARCHAR),
  ('OC-2026-0004', 'PRV-0004', 'CONFIRMADA', FALSE, 12, 5, 'Equipos médicos prioritarios con compromiso confirmado', NULL::VARCHAR),
  ('OC-2026-0005', 'PRV-0001', 'RECIBIDA', TRUE, 15, -1, 'Compra local completada y conciliada', 'ALM-LPZ'),
  ('OC-2026-0006', 'PRV-0003', 'BORRADOR', FALSE, 1, 14, 'Borrador pendiente de revisión de Compras', NULL::VARCHAR),
  ('OC-2026-0007', 'PRV-0001', 'APROBADA', TRUE, 4, 11, 'Reposición automática aprobada, todavía sin transporte', NULL::VARCHAR)
) AS v(code, supplier_code, status, automatic, age_days, delivery_offset, notes, received_warehouse_code)
JOIN suppliers supplier ON supplier.code = v.supplier_code
CROSS JOIN users purchases
CROSS JOIN users inventory
LEFT JOIN warehouses received_warehouse ON received_warehouse.code = v.received_warehouse_code
WHERE purchases.email = 'compras@scm.local'
  AND inventory.email = 'inventario@scm.local'
ON CONFLICT (code) DO NOTHING;

INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_price)
SELECT purchase_order.id, product.id, v.quantity, product.unit_price
FROM (VALUES
  ('OC-2026-0002', 'ALIM-001', 240),
  ('OC-2026-0002', 'ALIM-002', 120),
  ('OC-2026-0003', 'ELEC-001', 80),
  ('OC-2026-0003', 'ELEC-003', 25),
  ('OC-2026-0004', 'FARM-001', 60),
  ('OC-2026-0004', 'FARM-002', 12),
  ('OC-2026-0005', 'ELEC-001', 50),
  ('OC-2026-0006', 'ALIM-002', 90),
  ('OC-2026-0007', 'ELEC-002', 35)
) AS v(order_code, sku, quantity)
JOIN purchase_orders purchase_order ON purchase_order.code = v.order_code
JOIN products product ON product.sku = v.sku
ON CONFLICT (purchase_order_id, product_id) DO NOTHING;

INSERT INTO shipments (
  tracking_code, route_id, purchase_order_id, vehicle_id, driver_id,
  origin, destination, status, total_weight_kg, total_volume_m3,
  current_latitude, current_longitude, departure_at, eta_at, delivered_at,
  origin_warehouse_id, destination_warehouse_id,
  inventory_reserved_at, inventory_dispatched_at, inventory_received_at, flow_type,
  created_at
)
SELECT
  v.tracking_code,
  route.id,
  purchase_order.id,
  vehicle.id,
  driver.id,
  route.origin_name,
  route.destination_name,
  v.status::shipment_status,
  v.weight_kg,
  v.volume_m3,
  v.latitude,
  v.longitude,
  CASE WHEN v.status = 'PREPARANDO' THEN NULL ELSE NOW() - (v.departed_hours || ' hours')::INTERVAL END,
  NOW() + (v.eta_hours || ' hours')::INTERVAL,
  CASE WHEN v.status = 'ENTREGADO' THEN NOW() - INTERVAL '1 day' ELSE NULL END,
  NULL,
  destination_warehouse.id,
  NULL,
  NULL,
  CASE WHEN v.status = 'ENTREGADO' THEN NOW() - INTERVAL '1 day' ELSE NULL END,
  'ENTRADA_COMPRA',
  NOW() - (v.created_hours || ' hours')::INTERVAL
FROM (VALUES
  ('SCM-PE-2026-002', 'Lima proveedor - La Paz', 'OC-2026-0002', NULL::VARCHAR, NULL::VARCHAR, 'PREPARANDO', 5200::NUMERIC, 28::NUMERIC, -12.0464000::NUMERIC, -77.0428000::NUMERIC, 0, 28, 5),
  ('SCM-BR-2026-003', 'São Paulo proveedor - Santa Cruz', 'OC-2026-0003', 'BR-TRK-404', 'marco.transportista@scm.local', 'INCIDENCIA', 6800::NUMERIC, 34::NUMERIC, -19.0090000::NUMERIC, -57.6530000::NUMERIC, 22, 12, 28),
  ('SCM-AR-2026-004', 'Buenos Aires proveedor - La Paz', 'OC-2026-0004', 'AR-TRK-505', 'sofia.transportista@scm.local', 'RETRASADO', 4300::NUMERIC, 22::NUMERIC, -24.1858000::NUMERIC, -65.2995000::NUMERIC, 40, -4, 52),
  ('SCM-BO-2026-005', 'El Alto proveedor - La Paz', 'OC-2026-0005', 'BO-TRK-303', 'elena.transportista@scm.local', 'ENTREGADO', 2100::NUMERIC, 12::NUMERIC, -16.5000000::NUMERIC, -68.1500000::NUMERIC, 30, -24, 36)
) AS v(
  tracking_code, route_name, order_code, plate, driver_email, status,
  weight_kg, volume_m3, latitude, longitude, departed_hours, eta_hours, created_hours
)
JOIN routes route ON route.name = v.route_name
JOIN purchase_orders purchase_order ON purchase_order.code = v.order_code
LEFT JOIN vehicles vehicle ON vehicle.plate = v.plate
LEFT JOIN users driver ON driver.email = v.driver_email
JOIN warehouses destination_warehouse ON destination_warehouse.id = route.destination_warehouse_id
ON CONFLICT (tracking_code) DO NOTHING;

INSERT INTO shipments (
  tracking_code, route_id, vehicle_id, driver_id, origin, destination, status,
  total_weight_kg, total_volume_m3, current_latitude, current_longitude,
  departure_at, eta_at, delivered_at, origin_warehouse_id, destination_warehouse_id,
  inventory_reserved_at, inventory_dispatched_at, inventory_received_at, flow_type, created_at
)
SELECT
  v.tracking_code,
  route.id,
  vehicle.id,
  driver.id,
  route.origin_name,
  route.destination_name,
  v.status::shipment_status,
  v.weight_kg,
  v.volume_m3,
  v.latitude,
  v.longitude,
  CASE WHEN v.status = 'PREPARANDO' THEN NULL ELSE NOW() - (v.departed_hours || ' hours')::INTERVAL END,
  NOW() + (v.eta_hours || ' hours')::INTERVAL,
  CASE WHEN v.status = 'ENTREGADO' THEN NOW() - INTERVAL '2 days' ELSE NULL END,
  route.origin_warehouse_id,
  route.destination_warehouse_id,
  CASE WHEN v.status = 'PREPARANDO' THEN NOW() - INTERVAL '2 hours' ELSE NOW() - (v.departed_hours || ' hours')::INTERVAL END,
  CASE WHEN v.status = 'PREPARANDO' THEN NULL ELSE NOW() - (v.departed_hours || ' hours')::INTERVAL END,
  CASE WHEN v.status = 'ENTREGADO' AND route.destination_warehouse_id IS NOT NULL THEN NOW() - INTERVAL '2 days' ELSE NULL END,
  'SALIDA_DISTRIBUCION',
  NOW() - (v.created_hours || ' hours')::INTERVAL
FROM (VALUES
  ('SCM-BO-2026-006', 'La Paz - Santa Cruz distribución', NULL::VARCHAR, NULL::VARCHAR, 'PREPARANDO', 1800::NUMERIC, 10::NUMERIC, -16.5000000::NUMERIC, -68.1500000::NUMERIC, 0, 20, 3),
  ('SCM-BO-2026-007', 'Santa Cruz - La Paz distribución', 'PE-TRK-606', 'diego.transportista@scm.local', 'EN_TRANSITO', 2400::NUMERIC, 15::NUMERIC, -16.5656000::NUMERIC, -69.0417000::NUMERIC, 7, 9, 12),
  ('SCM-BO-2026-008', 'Santa Cruz - Cliente Cochabamba', 'BO-VAN-707', 'elena.transportista@scm.local', 'ENTREGADO', 950::NUMERIC, 7::NUMERIC, -17.3895000::NUMERIC, -66.1568000::NUMERIC, 60, -48, 66)
) AS v(
  tracking_code, route_name, plate, driver_email, status,
  weight_kg, volume_m3, latitude, longitude, departed_hours, eta_hours, created_hours
)
JOIN routes route ON route.name = v.route_name
LEFT JOIN vehicles vehicle ON vehicle.plate = v.plate
LEFT JOIN users driver ON driver.email = v.driver_email
ON CONFLICT (tracking_code) DO NOTHING;

INSERT INTO shipment_items (shipment_id, product_id, quantity)
SELECT shipment.id, item.product_id, item.quantity
FROM shipments shipment
JOIN purchase_orders purchase_order ON purchase_order.id = shipment.purchase_order_id
JOIN purchase_order_items item ON item.purchase_order_id = purchase_order.id
WHERE shipment.tracking_code IN (
  'SCM-PE-2026-002', 'SCM-BR-2026-003', 'SCM-AR-2026-004', 'SCM-BO-2026-005'
)
ON CONFLICT (shipment_id, product_id) DO NOTHING;

INSERT INTO shipment_items (shipment_id, product_id, quantity)
SELECT shipment.id, product.id, v.quantity
FROM (VALUES
  ('SCM-BO-2026-006', 'REP-001', 12),
  ('SCM-BO-2026-006', 'TEXT-002', 8),
  ('SCM-BO-2026-007', 'ELEC-001', 8),
  ('SCM-BO-2026-007', 'ELEC-003', 4),
  ('SCM-BO-2026-008', 'ALIM-001', 18),
  ('SCM-BO-2026-008', 'ALIM-002', 12)
) AS v(tracking_code, sku, quantity)
JOIN shipments shipment ON shipment.tracking_code = v.tracking_code
JOIN products product ON product.sku = v.sku
ON CONFLICT (shipment_id, product_id) DO NOTHING;

-- Reserva el envío todavía no asignado.
UPDATE stocks stock
SET reserved_quantity = stock.reserved_quantity + item.quantity,
    updated_at = NOW()
FROM shipment_items item
JOIN shipments shipment ON shipment.id = item.shipment_id
WHERE shipment.tracking_code = 'SCM-BO-2026-006'
  AND stock.product_id = item.product_id
  AND stock.warehouse_id = shipment.origin_warehouse_id;

-- Registra salidas ya despachadas y mantiene los saldos correlacionados.
INSERT INTO inventory_movements (
  product_id, warehouse_id, user_id, movement_type, reason, quantity,
  previous_quantity, resulting_quantity, reference_type, reference_id,
  observations, created_at
)
SELECT
  item.product_id,
  shipment.origin_warehouse_id,
  logistics.id,
  'SALIDA',
  'DESPACHO',
  item.quantity,
  stock.current_quantity,
  stock.current_quantity - item.quantity,
  'shipment',
  shipment.id,
  'Despacho demostrativo del envío ' || shipment.tracking_code,
  shipment.departure_at
FROM shipments shipment
JOIN shipment_items item ON item.shipment_id = shipment.id
JOIN stocks stock
  ON stock.product_id = item.product_id
 AND stock.warehouse_id = shipment.origin_warehouse_id
CROSS JOIN users logistics
WHERE shipment.tracking_code IN ('SCM-BO-2026-007', 'SCM-BO-2026-008')
  AND logistics.email = 'logistica@scm.local';

UPDATE stocks stock
SET current_quantity = stock.current_quantity - item.quantity,
    updated_at = NOW()
FROM shipment_items item
JOIN shipments shipment ON shipment.id = item.shipment_id
WHERE shipment.tracking_code IN ('SCM-BO-2026-007', 'SCM-BO-2026-008')
  AND stock.product_id = item.product_id
  AND stock.warehouse_id = shipment.origin_warehouse_id;

-- Recibe en destino únicamente los escenarios entregados que terminan en almacén.
INSERT INTO inventory_movements (
  product_id, warehouse_id, user_id, movement_type, reason, quantity,
  previous_quantity, resulting_quantity, reference_type, reference_id,
  observations, created_at
)
SELECT
  item.product_id,
  shipment.destination_warehouse_id,
  inventory.id,
  'ENTRADA',
  CASE WHEN shipment.flow_type = 'ENTRADA_COMPRA' THEN 'COMPRA' ELSE 'TRASLADO_ENVIO' END,
  item.quantity,
  stock.current_quantity,
  stock.current_quantity + item.quantity,
  'shipment',
  shipment.id,
  'Recepción demostrativa del envío ' || shipment.tracking_code,
  shipment.delivered_at
FROM shipments shipment
JOIN shipment_items item ON item.shipment_id = shipment.id
JOIN stocks stock
  ON stock.product_id = item.product_id
 AND stock.warehouse_id = shipment.destination_warehouse_id
CROSS JOIN users inventory
WHERE shipment.tracking_code = 'SCM-BO-2026-005'
  AND inventory.email = 'inventario@scm.local';

UPDATE stocks stock
SET current_quantity = stock.current_quantity + item.quantity,
    updated_at = NOW()
FROM shipment_items item
JOIN shipments shipment ON shipment.id = item.shipment_id
WHERE shipment.tracking_code = 'SCM-BO-2026-005'
  AND stock.product_id = item.product_id
  AND stock.warehouse_id = shipment.destination_warehouse_id;

INSERT INTO shipment_events (
  shipment_id, user_id, event_type, status, description,
  latitude, longitude, evidence_url, created_at
)
SELECT
  shipment.id,
  COALESCE(driver.id, logistics.id),
  event.event_type::shipment_event_type,
  event.status::shipment_status,
  event.description,
  event.latitude,
  event.longitude,
  event.evidence_url,
  NOW() - (event.minutes_ago || ' minutes')::INTERVAL
FROM (VALUES
  ('SCM-PE-2026-002', 'CREADO', 'PREPARANDO', 'Orden vinculada; carga pendiente de asignación', -12.0464000::NUMERIC, -77.0428000::NUMERIC, NULL::TEXT, 150),
  ('SCM-BR-2026-003', 'CREADO', 'PREPARANDO', 'Carga electrónica validada en origen', -23.5505000::NUMERIC, -46.6333000::NUMERIC, NULL::TEXT, 1680),
  ('SCM-BR-2026-003', 'SALIDA', 'EN_TRANSITO', 'Salida confirmada desde São Paulo', -23.5505000::NUMERIC, -46.6333000::NUMERIC, NULL::TEXT, 1320),
  ('SCM-BR-2026-003', 'UBICACION', 'EN_TRANSITO', 'Telemetría recibida cerca de Corumbá', -19.1200000::NUMERIC, -57.4000000::NUMERIC, NULL::TEXT, 28),
  ('SCM-BR-2026-003', 'INCIDENCIA', 'INCIDENCIA', 'Demora por revisión mecánica preventiva; equipo en evaluación', -19.0090000::NUMERIC, -57.6530000::NUMERIC, 'https://example.com/evidencias/incidencia-br-003.jpg', 8),
  ('SCM-AR-2026-004', 'CREADO', 'PREPARANDO', 'Equipos médicos documentados y sellados', -34.6037000::NUMERIC, -58.3816000::NUMERIC, NULL::TEXT, 3000),
  ('SCM-AR-2026-004', 'SALIDA', 'EN_TRANSITO', 'Salida desde Buenos Aires', -34.6037000::NUMERIC, -58.3816000::NUMERIC, NULL::TEXT, 2400),
  ('SCM-AR-2026-004', 'ESCALA', 'EN_TRANSITO', 'Escala operativa en Córdoba completada', -31.4201000::NUMERIC, -64.1888000::NUMERIC, NULL::TEXT, 960),
  ('SCM-AR-2026-004', 'RETRASO', 'RETRASADO', 'Cruce fronterizo con cuatro horas de demora; nueva ETA calculada', -24.1858000::NUMERIC, -65.2995000::NUMERIC, NULL::TEXT, 18),
  ('SCM-BO-2026-005', 'CREADO', 'PREPARANDO', 'Compra local preparada para despacho', -16.5047000::NUMERIC, -68.1635000::NUMERIC, NULL::TEXT, 2160),
  ('SCM-BO-2026-005', 'SALIDA', 'EN_TRANSITO', 'Salida desde proveedor Andes Tech', -16.5047000::NUMERIC, -68.1635000::NUMERIC, NULL::TEXT, 1800),
  ('SCM-BO-2026-005', 'ENTREGA', 'ENTREGADO', 'Recepción conforme en Centro La Paz', -16.5000000::NUMERIC, -68.1500000::NUMERIC, 'https://example.com/evidencias/entrega-bo-005.jpg', 1440),
  ('SCM-BO-2026-006', 'CREADO', 'PREPARANDO', 'Distribución creada; inventario reservado', -16.5000000::NUMERIC, -68.1500000::NUMERIC, NULL::TEXT, 120),
  ('SCM-BO-2026-007', 'CREADO', 'PREPARANDO', 'Carga de telemetría preparada en Santa Cruz', -17.7833000::NUMERIC, -63.1821000::NUMERIC, NULL::TEXT, 720),
  ('SCM-BO-2026-007', 'SALIDA', 'EN_TRANSITO', 'Salida hacia Centro La Paz', -17.7833000::NUMERIC, -63.1821000::NUMERIC, NULL::TEXT, 420),
  ('SCM-BO-2026-007', 'UBICACION', 'EN_TRANSITO', 'Posición actualizada en corredor occidental', -16.5656000::NUMERIC, -69.0417000::NUMERIC, NULL::TEXT, 4),
  ('SCM-BO-2026-008', 'CREADO', 'PREPARANDO', 'Pedido de cliente preparado', -17.7833000::NUMERIC, -63.1821000::NUMERIC, NULL::TEXT, 3960),
  ('SCM-BO-2026-008', 'SALIDA', 'EN_TRANSITO', 'Furgón salió de Centro Santa Cruz', -17.7833000::NUMERIC, -63.1821000::NUMERIC, NULL::TEXT, 3600),
  ('SCM-BO-2026-008', 'ENTREGA', 'ENTREGADO', 'Cliente industrial confirmó recepción completa', -17.3895000::NUMERIC, -66.1568000::NUMERIC, 'https://example.com/evidencias/entrega-bo-008.jpg', 2880)
) AS event(
  tracking_code, event_type, status, description, latitude, longitude,
  evidence_url, minutes_ago
)
JOIN shipments shipment ON shipment.tracking_code = event.tracking_code
LEFT JOIN users driver ON driver.id = shipment.driver_id
CROSS JOIN users logistics
WHERE logistics.email = 'logistica@scm.local'
  AND NOT EXISTS (
    SELECT 1
    FROM shipment_events existing
    WHERE existing.shipment_id = shipment.id
      AND existing.event_type::TEXT = event.event_type
      AND existing.description = event.description
  );

INSERT INTO notifications (user_id, title, message, event_code, created_at)
SELECT user_account.id, v.title, v.message, v.event_code, NOW() - (v.minutes_ago || ' minutes')::INTERVAL
FROM (VALUES
  ('marco.transportista@scm.local', 'Incidencia activa', 'SCM-BR-2026-003 requiere seguimiento mecánico.', 'SHIPMENT_INCIDENT:SCM-BR-2026-003', 8),
  ('sofia.transportista@scm.local', 'Envío retrasado', 'SCM-AR-2026-004 superó su ETA planificada.', 'SHIPMENT_DELAY:SCM-AR-2026-004', 18),
  ('inventario@scm.local', 'Compra recibida', 'OC-2026-0005 actualizó el inventario de Centro La Paz.', 'PURCHASE_RECEIVED:OC-2026-0005', 1440),
  ('gerente@scm.local', 'Alerta operativa', 'Hay envíos con retraso o incidencia en el mapa global.', 'OPERATIONS_ALERT', 6)
) AS v(email, title, message, event_code, minutes_ago)
JOIN users user_account ON user_account.email = v.email
WHERE NOT EXISTS (
  SELECT 1 FROM notifications existing WHERE existing.event_code = v.event_code
);

INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, created_at)
SELECT
  actor.id,
  v.action,
  v.entity_type,
  v.entity_id,
  v.details::JSONB,
  NOW() - (v.minutes_ago || ' minutes')::INTERVAL
FROM (VALUES
  ('admin@scm.local', 'REVIEW_ACCESS', 'role', 'ALL', '{"scope":"demo_operational"}', 180),
  ('compras@scm.local', 'APPROVE', 'purchase_order', 'OC-2026-0003', '{"supplier":"PRV-0002"}', 10080),
  ('proveedor@scm.local', 'SUPPLIER_CONFIRM', 'purchase_order', 'OC-2026-0004', '{"document":"confirmed"}', 2880),
  ('logistica@scm.local', 'ASSIGN', 'shipment', 'SCM-BR-2026-003', '{"vehicle":"BR-TRK-404"}', 1320),
  ('marco.transportista@scm.local', 'SHIPMENT_EVENT', 'shipment', 'SCM-BR-2026-003', '{"status":"INCIDENCIA"}', 8),
  ('sofia.transportista@scm.local', 'SHIPMENT_EVENT', 'shipment', 'SCM-AR-2026-004', '{"status":"RETRASADO"}', 18),
  ('inventario@scm.local', 'RECEIVE', 'purchase_order', 'OC-2026-0005', '{"warehouse":"ALM-LPZ"}', 1440),
  ('gerente@scm.local', 'VIEW_DASHBOARD', 'report', 'OPERATIONS', '{"filters":"all"}', 90),
  ('auditor@scm.local', 'EXPORT', 'report', 'AUDIT', '{"format":"xlsx"}', 60),
  ('cliente@scm.local', 'TRACK', 'shipment', 'SCM-BO-2026-007', '{"channel":"public"}', 4)
) AS v(email, action, entity_type, entity_id, details, minutes_ago)
JOIN users actor ON actor.email = v.email
WHERE NOT EXISTS (
  SELECT 1
  FROM audit_logs existing
  WHERE existing.action = v.action
    AND existing.entity_type = v.entity_type
    AND existing.entity_id = v.entity_id
    AND existing.details = v.details::JSONB
);

INSERT INTO monthly_sales (month, country, category_id, amount)
SELECT v.month, v.country, category.id, v.amount
FROM (VALUES
  (DATE '2026-02-01', 'Perú', 'Electrónica', 132000.00::NUMERIC),
  (DATE '2026-03-01', 'Brasil', 'Repuestos', 97000.00::NUMERIC),
  (DATE '2026-04-01', 'Bolivia', 'Textiles', 88000.00::NUMERIC),
  (DATE '2026-05-01', 'Perú', 'Farmacéutica', 145000.00::NUMERIC),
  (DATE '2026-06-01', 'Argentina', 'Electrónica', 171000.00::NUMERIC),
  (DATE '2026-07-01', 'Brasil', 'Alimentos', 119000.00::NUMERIC)
) AS v(month, country, category_name, amount)
JOIN categories category ON category.name = v.category_name
ON CONFLICT (month, country, category_id) DO NOTHING;
