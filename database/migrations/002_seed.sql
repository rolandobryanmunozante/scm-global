INSERT INTO roles (code, name, description) VALUES
  ('ADMIN', 'Administrador', 'Gestión integral del sistema'),
  ('PURCHASE_MANAGER', 'Responsable de Compras', 'Proveedores, calificaciones y órdenes'),
  ('INVENTORY_MANAGER', 'Responsable de Inventario', 'Stock, movimientos y transferencias'),
  ('LOGISTICS_MANAGER', 'Responsable de Logística', 'Rutas, despachos y transporte'),
  ('DRIVER', 'Transportista', 'Actualización de envíos asignados'),
  ('MANAGER', 'Gerente', 'Dashboard, indicadores y reportes'),
  ('CLIENT', 'Cliente interno', 'Consulta de envíos'),
  ('SUPPLIER', 'Proveedor externo', 'Portal de órdenes del proveedor'),
  ('AUDITOR', 'Auditor', 'Trazabilidad y auditoría');

INSERT INTO permissions (code, name) VALUES
  ('users.manage', 'Gestionar usuarios y roles'),
  ('suppliers.read', 'Consultar proveedores'),
  ('suppliers.write', 'Crear y editar proveedores'),
  ('suppliers.rate', 'Calificar proveedores'),
  ('inventory.read', 'Consultar inventario'),
  ('inventory.move', 'Registrar movimientos'),
  ('inventory.transfer', 'Transferir stock'),
  ('purchases.read', 'Consultar órdenes de compra'),
  ('purchases.approve', 'Aprobar órdenes de compra'),
  ('routes.manage', 'Gestionar rutas'),
  ('shipments.read', 'Consultar envíos'),
  ('shipments.assign', 'Asignar transporte'),
  ('shipments.update', 'Actualizar envíos'),
  ('reports.read', 'Consultar dashboard y reportes'),
  ('reports.export', 'Exportar reportes'),
  ('audit.read', 'Consultar auditoría'),
  ('supplier.portal', 'Acceder al portal de proveedores');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'ADMIN';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
  ('suppliers.read','suppliers.write','suppliers.rate','inventory.read','purchases.read','purchases.approve','shipments.read','reports.read')
WHERE r.code = 'PURCHASE_MANAGER';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
  ('suppliers.read','inventory.read','inventory.move','inventory.transfer','purchases.read','shipments.read')
WHERE r.code = 'INVENTORY_MANAGER';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
  ('inventory.read','purchases.read','routes.manage','shipments.read','shipments.assign','reports.read')
WHERE r.code = 'LOGISTICS_MANAGER';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('shipments.read','shipments.update')
WHERE r.code = 'DRIVER';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
  ('suppliers.read','inventory.read','purchases.read','shipments.read','reports.read','reports.export','audit.read')
WHERE r.code = 'MANAGER';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('shipments.read')
WHERE r.code = 'CLIENT';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'supplier.portal'
WHERE r.code = 'SUPPLIER';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('reports.read','reports.export','audit.read')
WHERE r.code = 'AUDITOR';

INSERT INTO categories (name) VALUES
  ('Electrónica'), ('Alimentos'), ('Farmacéutica'), ('Textiles'), ('Repuestos');

INSERT INTO suppliers (code, commercial_name, tax_id, country, category_id, email, phone, address, notes) VALUES
  ('PRV-0001', 'Andes Tech Supply', 'BO-1020304050', 'Bolivia', 1, 'ventas@andestech.bo', '+591 2 2440001', 'El Alto, Bolivia', 'Proveedor regional de electrónica'),
  ('PRV-0002', 'Brasil Components', 'BR-5544332211', 'Brasil', 1, 'contato@brcomponents.com.br', '+55 11 3000-2222', 'São Paulo, Brasil', 'Componentes electrónicos'),
  ('PRV-0003', 'Pacífico Foods', 'PE-20112233445', 'Perú', 2, 'comercial@pacificofoods.pe', '+51 1 555-1000', 'Lima, Perú', 'Alimentos no perecederos'),
  ('PRV-0004', 'Salud Global', 'AR-30700112233', 'Argentina', 3, 'ventas@saludglobal.ar', '+54 11 4000-9090', 'Buenos Aires, Argentina', 'Insumos farmacéuticos');

INSERT INTO users (full_name, email, password_hash, role_id, language, license_number, license_expiry)
SELECT x.full_name, x.email, crypt('SCM2026!', gen_salt('bf', 12)), r.id, 'es', x.license_number, x.license_expiry
FROM (VALUES
  ('Ana Administradora', 'admin@scm.local', 'ADMIN', NULL::VARCHAR, NULL::DATE),
  ('Carla Compras', 'compras@scm.local', 'PURCHASE_MANAGER', NULL::VARCHAR, NULL::DATE),
  ('Iván Inventario', 'inventario@scm.local', 'INVENTORY_MANAGER', NULL::VARCHAR, NULL::DATE),
  ('Lucía Logística', 'logistica@scm.local', 'LOGISTICS_MANAGER', NULL::VARCHAR, NULL::DATE),
  ('Tomás Transportista', 'transportista@scm.local', 'DRIVER', 'LIC-BO-77881', CURRENT_DATE + 365),
  ('Gabriela Gerente', 'gerente@scm.local', 'MANAGER', NULL::VARCHAR, NULL::DATE),
  ('Claudio Cliente', 'cliente@scm.local', 'CLIENT', NULL::VARCHAR, NULL::DATE),
  ('Audrey Auditoría', 'auditor@scm.local', 'AUDITOR', NULL::VARCHAR, NULL::DATE)
) AS x(full_name, email, role_code, license_number, license_expiry)
JOIN roles r ON r.code = x.role_code;

INSERT INTO users (full_name, email, password_hash, role_id, supplier_id, language)
SELECT 'Portal Andes Tech', 'proveedor@scm.local', crypt('SCM2026!', gen_salt('bf', 12)), r.id, s.id, 'es'
FROM roles r CROSS JOIN suppliers s WHERE r.code = 'SUPPLIER' AND s.code = 'PRV-0001';

INSERT INTO supplier_ratings (supplier_id, evaluator_id, punctuality, quality, price, comments, period_start)
SELECT s.id, u.id, v.punctuality, v.quality, v.price, v.comments, v.period_start
FROM (VALUES
  ('PRV-0001', 4.8, 4.6, 4.2, 'Excelente cumplimiento', DATE '2026-05-01'),
  ('PRV-0001', 4.6, 4.8, 4.4, 'Calidad consistente', DATE '2026-06-01'),
  ('PRV-0002', 4.1, 4.5, 4.7, 'Buena relación precio-calidad', DATE '2026-06-01'),
  ('PRV-0003', 3.8, 4.3, 4.0, 'Entrega con leve demora', DATE '2026-06-01'),
  ('PRV-0004', 4.5, 4.9, 3.8, 'Alta calidad', DATE '2026-06-01')
) AS v(code, punctuality, quality, price, comments, period_start)
JOIN suppliers s ON s.code = v.code
JOIN users u ON u.email = 'compras@scm.local';

INSERT INTO products (sku, name, category_id, minimum_stock, maximum_stock, unit_of_measure, unit_price) VALUES
  ('ELEC-001', 'Sensor IoT industrial', 1, 25, 180, 'unidad', 420.00),
  ('ELEC-002', 'Controlador de temperatura', 1, 15, 120, 'unidad', 860.00),
  ('ALIM-001', 'Conserva premium 500g', 2, 120, 1000, 'caja', 95.00),
  ('FARM-001', 'Kit de primeros auxilios', 3, 40, 300, 'kit', 180.00),
  ('TEXT-001', 'Uniforme operativo', 4, 60, 500, 'unidad', 210.00),
  ('REP-001', 'Filtro hidráulico H22', 5, 20, 140, 'unidad', 310.00);

INSERT INTO warehouses (code, name, address, city, country, latitude, longitude) VALUES
  ('ALM-LPZ', 'Centro La Paz', 'Av. 6 de Marzo 100', 'La Paz', 'Bolivia', -16.5000000, -68.1500000),
  ('ALM-SCZ', 'Centro Santa Cruz', 'Parque Industrial Mz. 8', 'Santa Cruz', 'Bolivia', -17.7833000, -63.1821000),
  ('ALM-LIM', 'Centro Lima', 'Callao 450', 'Lima', 'Perú', -12.0464000, -77.0428000);

INSERT INTO stocks (product_id, warehouse_id, current_quantity, reserved_quantity)
SELECT p.id, w.id,
  CASE
    WHEN p.sku = 'ELEC-002' AND w.code = 'ALM-LPZ' THEN 10
    WHEN p.sku = 'FARM-001' AND w.code = 'ALM-SCZ' THEN 22
    ELSE 80 + ((p.id * w.id * 17)::INTEGER % 180)
  END,
  CASE WHEN w.code = 'ALM-LPZ' THEN 5 ELSE 0 END
FROM products p CROSS JOIN warehouses w;

INSERT INTO routes (
  name, origin_name, origin_country, origin_latitude, origin_longitude,
  destination_name, destination_country, destination_latitude, destination_longitude,
  stops, transport_mode, estimated_distance_km, estimated_duration_hours,
  customs_required, created_by
)
SELECT
  'La Paz - Lima', 'Centro La Paz', 'Bolivia', -16.5000000, -68.1500000,
  'Centro Lima', 'Perú', -12.0464000, -77.0428000,
  '[{"name":"Desaguadero","lat":-16.5656,"lng":-69.0417}]'::jsonb,
  'TERRESTRE', 1165.00, 25.90, TRUE, u.id
FROM users u WHERE u.email = 'logistica@scm.local';

INSERT INTO vehicles (plate, type, transport_mode, capacity_kg, capacity_m3, current_location) VALUES
  ('BO-TRK-101', 'Camión refrigerado', 'TERRESTRE', 12000, 45, 'La Paz'),
  ('BO-TRK-202', 'Camión caja seca', 'TERRESTRE', 18000, 70, 'Santa Cruz'),
  ('CONT-4041', 'Contenedor 40 pies', 'MARITIMO', 26000, 67, 'Puerto de Arica'),
  ('AIR-CARGO-7', 'Carga aérea', 'AEREO', 8000, 35, 'El Alto');

INSERT INTO purchase_orders (code, supplier_id, status, automatic, generated_by, expected_delivery_date, notes)
SELECT 'OC-2026-0001', s.id, 'APROBADA', TRUE, u.id, CURRENT_DATE + 5, 'Reposición automática inicial'
FROM suppliers s CROSS JOIN users u WHERE s.code = 'PRV-0001' AND u.email = 'compras@scm.local';

INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_price)
SELECT po.id, p.id, 110, p.unit_price
FROM purchase_orders po CROSS JOIN products p
WHERE po.code = 'OC-2026-0001' AND p.sku = 'ELEC-002';

INSERT INTO shipments (
  tracking_code, route_id, purchase_order_id, vehicle_id, driver_id, origin, destination,
  status, total_weight_kg, total_volume_m3, current_latitude, current_longitude,
  departure_at, eta_at
)
SELECT
  'SCM-BO-2026-001', r.id, po.id, v.id, u.id, r.origin_name, r.destination_name,
  'EN_TRANSITO', 4200, 21, -16.5656, -69.0417, NOW() - INTERVAL '8 hours', NOW() + INTERVAL '18 hours'
FROM routes r
JOIN purchase_orders po ON po.code = 'OC-2026-0001'
JOIN vehicles v ON v.plate = 'BO-TRK-101'
JOIN users u ON u.email = 'transportista@scm.local'
WHERE r.name = 'La Paz - Lima';

INSERT INTO shipment_items (shipment_id, product_id, quantity)
SELECT s.id, p.id, 110 FROM shipments s CROSS JOIN products p
WHERE s.tracking_code = 'SCM-BO-2026-001' AND p.sku = 'ELEC-002';

INSERT INTO shipment_events (shipment_id, user_id, event_type, status, description, latitude, longitude, created_at)
SELECT s.id, u.id, x.event_type::shipment_event_type, x.status::shipment_status, x.description, x.lat, x.lng, x.created_at
FROM shipments s
JOIN users u ON u.email = 'transportista@scm.local'
CROSS JOIN (VALUES
  ('CREADO', 'PREPARANDO', 'Envío preparado y documentación validada', -16.5000, -68.1500, NOW() - INTERVAL '12 hours'),
  ('SALIDA', 'EN_TRANSITO', 'Salida del centro de distribución La Paz', -16.5000, -68.1500, NOW() - INTERVAL '8 hours'),
  ('UBICACION', 'EN_TRANSITO', 'Control de paso en Desaguadero', -16.5656, -69.0417, NOW() - INTERVAL '1 hour')
) AS x(event_type, status, description, lat, lng, created_at)
WHERE s.tracking_code = 'SCM-BO-2026-001';

INSERT INTO monthly_sales (month, country, category_id, amount)
SELECT d.month, d.country, c.id, d.amount
FROM (VALUES
  (DATE '2026-01-01', 'Bolivia', 'Electrónica', 82000.00),
  (DATE '2026-02-01', 'Bolivia', 'Electrónica', 91000.00),
  (DATE '2026-03-01', 'Perú', 'Alimentos', 105000.00),
  (DATE '2026-04-01', 'Brasil', 'Electrónica', 118000.00),
  (DATE '2026-05-01', 'Argentina', 'Farmacéutica', 126000.00),
  (DATE '2026-06-01', 'Bolivia', 'Repuestos', 143000.00),
  (DATE '2026-07-01', 'Perú', 'Textiles', 152000.00)
) AS d(month, country, category, amount)
JOIN categories c ON c.name = d.category;
