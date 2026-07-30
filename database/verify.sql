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
  FROM suppliers supplier
  WHERE supplier.active
    AND NOT EXISTS (
      SELECT 1
      FROM users user_account
      JOIN roles role_record ON role_record.id=user_account.role_id
      WHERE user_account.supplier_id=supplier.id
        AND user_account.active
        AND role_record.code='SUPPLIER'
    );
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % proveedores activos sin usuario de portal', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM users u JOIN roles r ON r.id=u.role_id
  WHERE r.code='DRIVER' AND u.active
    AND (u.license_number IS NULL OR u.license_expiry IS NULL OR u.license_expiry<CURRENT_DATE);
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % transportistas activos sin licencia vigente', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM roles role_record
  WHERE (
    SELECT COUNT(*)
    FROM users user_account
    WHERE user_account.role_id=role_record.id
      AND user_account.active
  ) < 2;
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % roles sin al menos dos cuentas activas de respaldo', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM users user_account
  JOIN roles role_record ON role_record.id=user_account.role_id
  WHERE role_record.code='DRIVER'
    AND user_account.active;
  IF violations < 10 THEN
    RAISE EXCEPTION 'La instalación demostrativa requiere al menos 10 transportistas activos; existen %', violations;
  END IF;

  SELECT COUNT(DISTINCT transport_mode) INTO violations
  FROM vehicles
  WHERE active;
  IF violations <> 3 THEN
    RAISE EXCEPTION 'La flota activa no cubre los tres modos de transporte';
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
  FROM purchase_orders purchase_order
  JOIN purchase_order_items item ON item.purchase_order_id=purchase_order.id
  WHERE NOT EXISTS (
    SELECT 1
    FROM supplier_products catalog
    WHERE catalog.supplier_id=purchase_order.supplier_id
      AND catalog.product_id=item.product_id
  );
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % productos de órdenes fuera del catálogo histórico del proveedor', violations;
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
  FROM purchase_orders purchase_order
  WHERE purchase_order.status='RECIBIDA'
    AND NOT EXISTS (
      SELECT 1
      FROM shipments shipment
      WHERE shipment.purchase_order_id=purchase_order.id
        AND shipment.flow_type='ENTRADA_COMPRA'
        AND shipment.status='ENTREGADO'
    );
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % órdenes recibidas que omitieron el flujo logístico', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM stocks
  WHERE current_quantity<0 OR reserved_quantity<0 OR reserved_quantity>current_quantity;
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % registros de stock inconsistentes', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM stocks stock
  LEFT JOIN (
    SELECT
      shipment.origin_warehouse_id AS warehouse_id,
      item.product_id,
      SUM(item.quantity)::INTEGER AS reserved_quantity
    FROM shipments shipment
    JOIN shipment_items item ON item.shipment_id=shipment.id
    WHERE shipment.flow_type='SALIDA_DISTRIBUCION'
      AND shipment.status IN ('PREPARANDO','ASIGNADO')
      AND shipment.inventory_reserved_at IS NOT NULL
      AND shipment.inventory_dispatched_at IS NULL
    GROUP BY shipment.origin_warehouse_id,item.product_id
  ) expected
    ON expected.warehouse_id=stock.warehouse_id
   AND expected.product_id=stock.product_id
  WHERE stock.reserved_quantity<>COALESCE(expected.reserved_quantity,0);
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % reservas de stock sin un envío preparado que las justifique', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM shipments s
  WHERE s.status IN ('ASIGNADO','EN_TRANSITO','EN_ADUANA','INCIDENCIA','RETRASADO','PENDIENTE_RECEPCION')
    AND (s.vehicle_id IS NULL OR s.driver_id IS NULL);
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % envíos activos sin transporte o conductor', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM shipments shipment
  JOIN routes route ON route.id=shipment.route_id
  JOIN vehicles vehicle ON vehicle.id=shipment.vehicle_id
  WHERE route.transport_mode<>vehicle.transport_mode;
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % envíos cuyo vehículo no coincide con el modo de la ruta', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM (
    SELECT vehicle_id
    FROM shipments
    WHERE status IN ('ASIGNADO','EN_TRANSITO','EN_ADUANA','INCIDENCIA','RETRASADO','PENDIENTE_RECEPCION')
    GROUP BY vehicle_id HAVING COUNT(*)>1
  ) conflicts;
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % vehículos asignados a más de un envío activo', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM (
    SELECT driver_id
    FROM shipments
    WHERE status IN ('ASIGNADO','EN_TRANSITO','EN_ADUANA','INCIDENCIA','RETRASADO','PENDIENTE_RECEPCION')
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
  FROM routes route
  WHERE (route.purpose='ENTRADA_COMPRA' AND route.destination_warehouse_id IS NULL)
     OR (route.purpose='SALIDA_DISTRIBUCION' AND route.origin_warehouse_id IS NULL)
     OR (
       route.purpose='AMBOS'
       AND (route.origin_warehouse_id IS NULL OR route.destination_warehouse_id IS NULL)
     );
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % rutas cuyo propósito no coincide con sus almacenes extremos', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM routes route
  CROSS JOIN LATERAL jsonb_array_elements(route.stops) stop
  WHERE NULLIF(BTRIM(stop->>'country'),'') IS NULL;
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % paradas de ruta sin país', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM shipments s
  JOIN purchase_orders po ON po.id=s.purchase_order_id
  WHERE s.flow_type='ENTRADA_COMPRA'
    AND (
      po.supplier_confirmed_at IS NULL
      OR
      (s.status IN ('PREPARANDO','ASIGNADO') AND po.status<>'CONFIRMADA')
      OR
      (
        s.status IN ('EN_TRANSITO','EN_ADUANA','INCIDENCIA','RETRASADO','PENDIENTE_RECEPCION')
        AND po.status<>'ENVIADA'
      )
      OR
      (s.status='ENTREGADO' AND (po.status<>'RECIBIDA' OR s.inventory_received_at IS NULL))
    );
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % compras entrantes con estados de orden y envío contradictorios', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM shipments
  WHERE status='ASIGNADO'
    AND (vehicle_id IS NULL OR driver_id IS NULL OR departure_at IS NOT NULL);
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % envíos asignados que ya salieron o no tienen recursos', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM shipments
  WHERE status='PENDIENTE_RECEPCION'
    AND (
      destination_warehouse_id IS NULL
      OR delivered_at IS NOT NULL
      OR inventory_received_at IS NOT NULL
    );
  IF violations > 0 THEN
    RAISE EXCEPTION 'Hay % arribos que omitieron la confirmación de Inventario', violations;
  END IF;
END $$;

SELECT
  (SELECT COUNT(*) FROM users WHERE active) AS active_users,
  (SELECT COUNT(*) FROM suppliers WHERE active) AS active_suppliers,
  (SELECT COUNT(*) FROM products WHERE active) AS active_products,
  (SELECT COUNT(*) FROM supplier_products WHERE active) AS active_catalog_items,
  (SELECT COUNT(*) FROM warehouses WHERE active) AS active_warehouses,
  (SELECT COUNT(*) FROM purchase_orders) AS purchase_orders,
  (SELECT COUNT(*) FROM shipments) AS shipments,
  (SELECT COUNT(*) FROM shipments WHERE flow_type='ENTRADA_COMPRA') AS inbound_shipments,
  (SELECT COUNT(*) FROM shipments WHERE flow_type='SALIDA_DISTRIBUCION') AS outbound_shipments,
  (SELECT COUNT(*) FROM inventory_movements) AS inventory_movements;
