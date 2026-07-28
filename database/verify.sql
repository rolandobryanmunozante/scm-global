\set ON_ERROR_STOP on

DO $$
DECLARE
  violations INTEGER;
BEGIN
  SELECT COUNT(*) INTO violations
  FROM users u JOIN roles r ON r.id=u.role_id
  WHERE r.code='SUPPLIER' AND u.active
    AND (u.supplier_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM suppliers s WHERE s.id=u.supplier_id AND s.active
    ));
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % usuarios proveedor sin vínculo activo válido', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM users u JOIN roles r ON r.id=u.role_id
  WHERE r.code='DRIVER' AND u.active
    AND (u.license_number IS NULL OR u.license_expiry IS NULL OR u.license_expiry<CURRENT_DATE);
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % transportistas activos sin licencia vigente', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM role_permissions rp
  JOIN roles r ON r.id=rp.role_id
  JOIN permissions p ON p.id=rp.permission_id
  WHERE r.code='CLIENT' AND p.code='shipments.read';
  IF violations > 0 THEN
    RAISE EXCEPTION 'El rol CLIENT conserva acceso interno a todos los envíos';
  END IF;

  SELECT COUNT(*) INTO violations
  FROM roles r
  WHERE r.code='CLIENT' AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
    WHERE rp.role_id=r.id AND p.code='tracking.read'
  );
  IF violations > 0 THEN
    RAISE EXCEPTION 'El rol CLIENT no tiene permiso de rastreo';
  END IF;

  SELECT COUNT(*) INTO violations
  FROM purchase_orders po
  WHERE NOT EXISTS (
    SELECT 1 FROM purchase_order_items i WHERE i.purchase_order_id=po.id
  );
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % órdenes de compra sin detalle', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM shipments s
  WHERE NOT EXISTS (SELECT 1 FROM shipment_items i WHERE i.shipment_id=s.id);
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % envíos sin productos', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM purchase_orders po
  WHERE po.status='RECIBIDA'
    AND (po.received_at IS NULL OR po.received_by IS NULL OR po.received_warehouse_id IS NULL);
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % órdenes recibidas sin trazabilidad de recepción', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM stocks
  WHERE current_quantity<0 OR reserved_quantity<0 OR reserved_quantity>current_quantity;
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % registros de stock inconsistentes', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM shipments s
  WHERE s.status IN ('EN_TRANSITO','EN_ADUANA','INCIDENCIA','RETRASADO')
    AND (s.vehicle_id IS NULL OR s.driver_id IS NULL);
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % envíos activos sin transporte o conductor', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM (
    SELECT vehicle_id
    FROM shipments
    WHERE status IN ('EN_TRANSITO','EN_ADUANA','INCIDENCIA','RETRASADO')
    GROUP BY vehicle_id HAVING COUNT(*)>1
  ) conflicts;
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % vehículos asignados a más de un envío activo', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM (
    SELECT driver_id
    FROM shipments
    WHERE status IN ('EN_TRANSITO','EN_ADUANA','INCIDENCIA','RETRASADO')
    GROUP BY driver_id HAVING COUNT(*)>1
  ) conflicts;
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % transportistas asignados a más de un envío activo', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM shipments s
  JOIN vehicles v ON v.id=s.vehicle_id
  WHERE s.status IN ('EN_TRANSITO','EN_ADUANA','INCIDENCIA','RETRASADO')
    AND (v.current_latitude IS NULL OR v.current_longitude IS NULL OR v.last_position_at IS NULL);
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % vehículos activos sin observabilidad de posición', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM shipments s
  WHERE s.purchase_order_id IS NOT NULL
    AND EXISTS (
      (SELECT product_id,quantity FROM purchase_order_items WHERE purchase_order_id=s.purchase_order_id
       EXCEPT
       SELECT product_id,quantity FROM shipment_items WHERE shipment_id=s.id)
      UNION ALL
      (SELECT product_id,quantity FROM shipment_items WHERE shipment_id=s.id
       EXCEPT
       SELECT product_id,quantity FROM purchase_order_items WHERE purchase_order_id=s.purchase_order_id)
    );
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % envíos de compra cuyo detalle no coincide con su orden', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM shipments s
  WHERE (s.flow_type='ENTRADA_COMPRA' AND (
           s.purchase_order_id IS NULL
           OR s.origin_warehouse_id IS NOT NULL
           OR s.destination_warehouse_id IS NULL
         ))
     OR (s.flow_type='SALIDA_DISTRIBUCION' AND (
           s.purchase_order_id IS NOT NULL
           OR s.origin_warehouse_id IS NULL
         ));
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % envíos cuya relación compra/distribución es inconsistente', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM shipments s
  JOIN routes r ON r.id=s.route_id
  WHERE r.purpose<>'AMBOS' AND r.purpose::TEXT<>s.flow_type::TEXT;
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % envíos asociados a una ruta con propósito incompatible', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM shipments s
  JOIN purchase_orders po ON po.id=s.purchase_order_id
  WHERE s.flow_type='ENTRADA_COMPRA'
    AND (
      (s.status='ENTREGADO' AND (po.status<>'RECIBIDA' OR s.inventory_received_at IS NULL))
      OR
      (s.status<>'ENTREGADO' AND po.status='RECIBIDA')
    );
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % compras entrantes con estados de orden y envío contradictorios', violations;
  END IF;
END $$;

SELECT
  (SELECT COUNT(*) FROM users WHERE active) AS active_users,
  (SELECT COUNT(*) FROM suppliers WHERE active) AS active_suppliers,
  (SELECT COUNT(*) FROM products WHERE active) AS active_products,
  (SELECT COUNT(*) FROM warehouses WHERE active) AS active_warehouses,
  (SELECT COUNT(*) FROM purchase_orders) AS purchase_orders,
  (SELECT COUNT(*) FROM shipments) AS shipments,
  (SELECT COUNT(*) FROM shipments WHERE flow_type='ENTRADA_COMPRA') AS inbound_shipments,
  (SELECT COUNT(*) FROM shipments WHERE flow_type='SALIDA_DISTRIBUCION') AS outbound_shipments,
  (SELECT COUNT(*) FROM inventory_movements) AS inventory_movements;
