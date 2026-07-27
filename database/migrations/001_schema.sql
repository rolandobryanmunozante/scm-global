CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE inventory_movement_type AS ENUM ('ENTRADA', 'SALIDA');
CREATE TYPE purchase_order_status AS ENUM ('BORRADOR', 'APROBADA', 'ENVIADA', 'CONFIRMADA', 'RECIBIDA', 'CANCELADA');
CREATE TYPE transfer_status AS ENUM ('EN_TRANSITO', 'RECIBIDA', 'CANCELADA');
CREATE TYPE transport_mode AS ENUM ('TERRESTRE', 'MARITIMO', 'AEREO');
CREATE TYPE shipment_status AS ENUM ('PREPARANDO', 'EN_TRANSITO', 'EN_ADUANA', 'ENTREGADO', 'INCIDENCIA', 'RETRASADO');
CREATE TYPE shipment_event_type AS ENUM ('CREADO', 'SALIDA', 'ESCALA', 'ADUANA', 'INCIDENCIA', 'ENTREGA', 'UBICACION');
CREATE TYPE notification_channel AS ENUM ('APP', 'EMAIL', 'PUSH');

CREATE TABLE roles (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT
);

CREATE TABLE permissions (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL
);

CREATE TABLE role_permissions (
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  parent_id BIGINT REFERENCES categories(id),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE suppliers (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  commercial_name VARCHAR(150) NOT NULL,
  tax_id VARCHAR(30) UNIQUE NOT NULL,
  country VARCHAR(80) NOT NULL,
  category_id BIGINT NOT NULL REFERENCES categories(id),
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id BIGINT NOT NULL REFERENCES roles(id),
  supplier_id BIGINT REFERENCES suppliers(id),
  language VARCHAR(2) NOT NULL DEFAULT 'es' CHECK (language IN ('es', 'en', 'pt')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts SMALLINT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  license_number VARCHAR(50),
  license_expiry DATE,
  last_access TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE supplier_ratings (
  id BIGSERIAL PRIMARY KEY,
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id),
  evaluator_id BIGINT NOT NULL REFERENCES users(id),
  punctuality NUMERIC(2,1) NOT NULL CHECK (punctuality BETWEEN 1 AND 5),
  quality NUMERIC(2,1) NOT NULL CHECK (quality BETWEEN 1 AND 5),
  price NUMERIC(2,1) NOT NULL CHECK (price BETWEEN 1 AND 5),
  weighted_score NUMERIC(3,2) GENERATED ALWAYS AS ((punctuality * 0.4 + quality * 0.4 + price * 0.2)) STORED,
  comments TEXT,
  period_start DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  category_id BIGINT NOT NULL REFERENCES categories(id),
  minimum_stock INTEGER NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  maximum_stock INTEGER NOT NULL DEFAULT 0 CHECK (maximum_stock >= minimum_stock),
  unit_of_measure VARCHAR(30) NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE warehouses (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(80) NOT NULL,
  country VARCHAR(80) NOT NULL,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE stocks (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id),
  warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
  current_quantity INTEGER NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0 AND reserved_quantity <= current_quantity),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, warehouse_id)
);

CREATE TABLE inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id),
  warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  movement_type inventory_movement_type NOT NULL,
  reason VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  previous_quantity INTEGER NOT NULL,
  resulting_quantity INTEGER NOT NULL,
  reference_type VARCHAR(50),
  reference_id BIGINT,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_transfers (
  id BIGSERIAL PRIMARY KEY,
  origin_warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
  destination_warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
  created_by BIGINT NOT NULL REFERENCES users(id),
  received_by BIGINT REFERENCES users(id),
  status transfer_status NOT NULL DEFAULT 'EN_TRANSITO',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  CHECK (origin_warehouse_id <> destination_warehouse_id)
);

CREATE TABLE stock_transfer_items (
  transfer_id BIGINT NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (transfer_id, product_id)
);

CREATE TABLE purchase_orders (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(30) UNIQUE NOT NULL,
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id),
  status purchase_order_status NOT NULL DEFAULT 'BORRADOR',
  automatic BOOLEAN NOT NULL DEFAULT FALSE,
  generated_by BIGINT REFERENCES users(id),
  approved_by BIGINT REFERENCES users(id),
  expected_delivery_date DATE,
  supplier_confirmed_at TIMESTAMPTZ,
  supplier_document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
  purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  PRIMARY KEY (purchase_order_id, product_id)
);

CREATE TABLE routes (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  origin_name VARCHAR(150) NOT NULL,
  origin_country VARCHAR(80) NOT NULL,
  origin_latitude NUMERIC(10,7) NOT NULL,
  origin_longitude NUMERIC(10,7) NOT NULL,
  destination_name VARCHAR(150) NOT NULL,
  destination_country VARCHAR(80) NOT NULL,
  destination_latitude NUMERIC(10,7) NOT NULL,
  destination_longitude NUMERIC(10,7) NOT NULL,
  stops JSONB NOT NULL DEFAULT '[]'::jsonb,
  transport_mode transport_mode NOT NULL,
  estimated_distance_km NUMERIC(12,2) NOT NULL,
  estimated_duration_hours NUMERIC(10,2) NOT NULL,
  customs_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_template BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vehicles (
  id BIGSERIAL PRIMARY KEY,
  plate VARCHAR(30) UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL,
  transport_mode transport_mode NOT NULL,
  capacity_kg NUMERIC(12,2) NOT NULL CHECK (capacity_kg > 0),
  capacity_m3 NUMERIC(12,2) NOT NULL CHECK (capacity_m3 > 0),
  current_location VARCHAR(150),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE shipments (
  id BIGSERIAL PRIMARY KEY,
  tracking_code VARCHAR(30) UNIQUE NOT NULL,
  route_id BIGINT NOT NULL REFERENCES routes(id),
  purchase_order_id BIGINT REFERENCES purchase_orders(id),
  vehicle_id BIGINT REFERENCES vehicles(id),
  driver_id BIGINT REFERENCES users(id),
  origin VARCHAR(150) NOT NULL,
  destination VARCHAR(150) NOT NULL,
  status shipment_status NOT NULL DEFAULT 'PREPARANDO',
  total_weight_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_volume_m3 NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_latitude NUMERIC(10,7),
  current_longitude NUMERIC(10,7),
  departure_at TIMESTAMPTZ,
  eta_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shipment_items (
  shipment_id BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (shipment_id, product_id)
);

CREATE TABLE shipment_events (
  id BIGSERIAL PRIMARY KEY,
  shipment_id BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id),
  event_type shipment_event_type NOT NULL,
  status shipment_status NOT NULL,
  description TEXT NOT NULL,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  evidence_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  channel notification_channel NOT NULL DEFAULT 'APP',
  event_code VARCHAR(80),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_preferences (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_code VARCHAR(80) NOT NULL,
  app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, event_code)
);

CREATE TABLE monthly_sales (
  id BIGSERIAL PRIMARY KEY,
  month DATE NOT NULL,
  country VARCHAR(80) NOT NULL,
  category_id BIGINT REFERENCES categories(id),
  amount NUMERIC(16,2) NOT NULL CHECK (amount >= 0),
  UNIQUE (month, country, category_id)
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (LOWER(email));
CREATE INDEX idx_suppliers_search ON suppliers (LOWER(commercial_name), country, category_id);
CREATE INDEX idx_products_search ON products (LOWER(name), sku, category_id);
CREATE INDEX idx_stocks_warehouse ON stocks (warehouse_id, product_id);
CREATE INDEX idx_movements_created ON inventory_movements (created_at DESC);
CREATE INDEX idx_shipments_status ON shipments (status, eta_at);
CREATE INDEX idx_shipment_events_timeline ON shipment_events (shipment_id, created_at);
CREATE INDEX idx_notifications_user ON notifications (user_id, read_at, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON suppliers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER shipments_updated_at BEFORE UPDATE ON shipments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION prevent_immutable_changes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de auditoría y movimientos son inmutables';
END;
$$;

CREATE TRIGGER inventory_movements_immutable
BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_changes();
CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_changes();

CREATE OR REPLACE VIEW supplier_scores AS
SELECT
  s.id AS supplier_id,
  COALESCE(ROUND(AVG(r.weighted_score), 2), 0) AS score,
  COUNT(r.id)::INTEGER AS rating_count
FROM suppliers s
LEFT JOIN supplier_ratings r ON r.supplier_id = s.id
GROUP BY s.id;
