-- Reserva operativa para demostraciones, capacitaciones e instalaciones nuevas.
-- Las cuentas adicionales permiten mostrar trabajo concurrente por rol y la flota
-- libre evita que los envíos históricos ocupen todos los recursos asignables.

INSERT INTO users (
  full_name,
  email,
  password_hash,
  role_id,
  supplier_id,
  language,
  license_number,
  license_expiry
)
SELECT
  account.full_name,
  account.email,
  crypt('SCM2026!', gen_salt('bf', 12)),
  role_record.id,
  supplier_record.id,
  'es',
  account.license_number,
  CASE WHEN account.role_code='DRIVER' THEN CURRENT_DATE + 730 ELSE NULL END
FROM (VALUES
  ('Sergio Coordinación', 'admin.coordinacion@scm.local', 'ADMIN', NULL::VARCHAR, NULL::VARCHAR),
  ('Mariana Compras Andinas', 'compras.andina@scm.local', 'PURCHASE_MANAGER', NULL::VARCHAR, NULL::VARCHAR),
  ('Pablo Compras Internacionales', 'compras.internacional@scm.local', 'PURCHASE_MANAGER', NULL::VARCHAR, NULL::VARCHAR),
  ('Rosa Inventario La Paz', 'inventario.lapaz@scm.local', 'INVENTORY_MANAGER', NULL::VARCHAR, NULL::VARCHAR),
  ('Hugo Inventario Santa Cruz', 'inventario.santacruz@scm.local', 'INVENTORY_MANAGER', NULL::VARCHAR, NULL::VARCHAR),
  ('Natalia Logística Nacional', 'logistica.nacional@scm.local', 'LOGISTICS_MANAGER', NULL::VARCHAR, NULL::VARCHAR),
  ('Óscar Logística Internacional', 'logistica.internacional@scm.local', 'LOGISTICS_MANAGER', NULL::VARCHAR, NULL::VARCHAR),
  ('Nicolás Transporte Uno', 'transportista.libre01@scm.local', 'DRIVER', NULL::VARCHAR, 'LIC-BO-91001'),
  ('Valeria Transporte Dos', 'transportista.libre02@scm.local', 'DRIVER', NULL::VARCHAR, 'LIC-BO-91002'),
  ('Raúl Transporte Tres', 'transportista.libre03@scm.local', 'DRIVER', NULL::VARCHAR, 'LIC-BO-91003'),
  ('Camila Transporte Cuatro', 'transportista.libre04@scm.local', 'DRIVER', NULL::VARCHAR, 'LIC-BO-91004'),
  ('Mateo Transporte Cinco', 'transportista.libre05@scm.local', 'DRIVER', NULL::VARCHAR, 'LIC-BO-91005'),
  ('Paola Transporte Seis', 'transportista.libre06@scm.local', 'DRIVER', NULL::VARCHAR, 'LIC-BO-91006'),
  ('Jorge Transporte Siete', 'transportista.libre07@scm.local', 'DRIVER', NULL::VARCHAR, 'LIC-BO-91007'),
  ('Daniela Transporte Ocho', 'transportista.libre08@scm.local', 'DRIVER', NULL::VARCHAR, 'LIC-BO-91008'),
  ('Mónica Gerencia Operativa', 'gerencia.operaciones@scm.local', 'MANAGER', NULL::VARCHAR, NULL::VARCHAR),
  ('Fernando Gerencia Regional', 'gerencia.regional@scm.local', 'MANAGER', NULL::VARCHAR, NULL::VARCHAR),
  ('Cliente Distribución Andina', 'cliente.distribucion@scm.local', 'CLIENT', NULL::VARCHAR, NULL::VARCHAR),
  ('Cliente Corporativo Sur', 'cliente.corporativo@scm.local', 'CLIENT', NULL::VARCHAR, NULL::VARCHAR),
  ('Alicia Auditoría de Calidad', 'auditor.calidad@scm.local', 'AUDITOR', NULL::VARCHAR, NULL::VARCHAR),
  ('Bruno Auditoría de Procesos', 'auditor.procesos@scm.local', 'AUDITOR', NULL::VARCHAR, NULL::VARCHAR),
  ('Contacto Alterno Andes Tech', 'proveedor.andes.alterno@scm.local', 'SUPPLIER', 'PRV-0001', NULL::VARCHAR),
  ('Contacto Alterno Brasil Components', 'proveedor.brasil.alterno@scm.local', 'SUPPLIER', 'PRV-0002', NULL::VARCHAR),
  ('Contacto Alterno Pacífico Foods', 'proveedor.pacifico.alterno@scm.local', 'SUPPLIER', 'PRV-0003', NULL::VARCHAR),
  ('Contacto Alterno Salud Global', 'proveedor.salud.alterno@scm.local', 'SUPPLIER', 'PRV-0004', NULL::VARCHAR)
) AS account(full_name,email,role_code,supplier_code,license_number)
JOIN roles role_record ON role_record.code=account.role_code
LEFT JOIN suppliers supplier_record ON supplier_record.code=account.supplier_code
ON CONFLICT (email) DO UPDATE
SET full_name=EXCLUDED.full_name,
    role_id=EXCLUDED.role_id,
    supplier_id=EXCLUDED.supplier_id,
    license_number=EXCLUDED.license_number,
    license_expiry=EXCLUDED.license_expiry,
    active=TRUE,
    updated_at=NOW();

INSERT INTO vehicles (
  plate,
  type,
  transport_mode,
  capacity_kg,
  capacity_m3,
  current_location,
  current_latitude,
  current_longitude,
  last_position_at,
  active
)
VALUES
  ('BO-LIB-801', 'Camión libre caja seca', 'TERRESTRE', 18000, 68, 'La Paz, Bolivia', -16.5000000, -68.1500000, NOW(), TRUE),
  ('BO-LIB-802', 'Camión libre refrigerado', 'TERRESTRE', 14000, 48, 'Santa Cruz, Bolivia', -17.7833000, -63.1821000, NOW(), TRUE),
  ('BO-LIB-803', 'Camión libre de distribución', 'TERRESTRE', 10000, 40, 'Cochabamba, Bolivia', -17.3895000, -66.1568000, NOW(), TRUE),
  ('PE-LIB-804', 'Camión internacional libre', 'TERRESTRE', 20000, 74, 'Lima, Perú', -12.0464000, -77.0428000, NOW(), TRUE),
  ('BR-LIB-805', 'Camión internacional libre', 'TERRESTRE', 22000, 78, 'São Paulo, Brasil', -23.5505000, -46.6333000, NOW(), TRUE),
  ('AR-LIB-806', 'Camión internacional libre', 'TERRESTRE', 21000, 76, 'Buenos Aires, Argentina', -34.6037000, -58.3816000, NOW(), TRUE),
  ('BO-LIB-807', 'Furgón libre de última milla', 'TERRESTRE', 4500, 21, 'El Alto, Bolivia', -16.5047000, -68.1635000, NOW(), TRUE),
  ('BO-LIB-808', 'Camión libre de alta capacidad', 'TERRESTRE', 26000, 88, 'Oruro, Bolivia', -17.9647000, -67.1060000, NOW(), TRUE),
  ('SEA-LIB-81', 'Contenedor marítimo libre 40 pies', 'MARITIMO', 28000, 72, 'Puerto de Arica, Chile', -18.4783000, -70.3126000, NOW(), TRUE),
  ('SEA-LIB-82', 'Contenedor marítimo refrigerado', 'MARITIMO', 25000, 66, 'Puerto del Callao, Perú', -12.0566000, -77.1181000, NOW(), TRUE),
  ('SEA-LIB-83', 'Contenedor marítimo libre 20 pies', 'MARITIMO', 18000, 38, 'Puerto de Santos, Brasil', -23.9608000, -46.3336000, NOW(), TRUE),
  ('AIR-LIB-81', 'Carga aérea libre mediana', 'AEREO', 9000, 38, 'Aeropuerto El Alto, Bolivia', -16.5133000, -68.1923000, NOW(), TRUE),
  ('AIR-LIB-82', 'Carga aérea libre internacional', 'AEREO', 12000, 46, 'Aeropuerto Jorge Chávez, Perú', -12.0219000, -77.1143000, NOW(), TRUE),
  ('AIR-LIB-83', 'Carga aérea libre regional', 'AEREO', 7000, 31, 'Aeropuerto Viru Viru, Bolivia', -17.6448000, -63.1354000, NOW(), TRUE)
ON CONFLICT (plate) DO UPDATE
SET type=EXCLUDED.type,
    transport_mode=EXCLUDED.transport_mode,
    capacity_kg=EXCLUDED.capacity_kg,
    capacity_m3=EXCLUDED.capacity_m3,
    current_location=EXCLUDED.current_location,
    current_latitude=EXCLUDED.current_latitude,
    current_longitude=EXCLUDED.current_longitude,
    last_position_at=EXCLUDED.last_position_at,
    active=TRUE;
