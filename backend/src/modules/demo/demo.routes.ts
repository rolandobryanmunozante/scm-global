import { Router } from "express";
import { config } from "../../config.js";
import {
  authenticate,
  requirePermission,
  signAccessToken,
  type AuthUser,
} from "../../shared/auth.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { audit } from "../../shared/audit.js";
import { pool } from "../../shared/db.js";
import { AppError } from "../../shared/errors.js";

const router = Router();
router.use(authenticate, requirePermission("users.manage"));

const fixedAccounts: Record<string, string> = {
  ADMIN: "admin@scm.local",
  PURCHASE_MANAGER: "compras@scm.local",
  INVENTORY_MANAGER: "inventario@scm.local",
  LOGISTICS_MANAGER: "logistica@scm.local",
  MANAGER: "gerente@scm.local",
  CLIENT: "cliente@scm.local",
  SUPPLIER: "proveedor@scm.local",
  AUDITOR: "auditor@scm.local",
};

router.get(
  "/estado",
  asyncHandler(async (_request, response) => {
    response.json({
      enabled: config.DEMO_MODE,
      isolated: config.DEMO_MODE,
      mode: config.DEMO_MODE ? "OPERATIVA_AISLADA" : "DESACTIVADA",
      message: config.DEMO_MODE
        ? "La demostración usa una base de datos aislada."
        : "La automatización está bloqueada en la instalación operativa.",
    });
  }),
);

router.post(
  "/sesiones",
  asyncHandler(async (request, response) => {
    if (!config.DEMO_MODE) {
      throw new AppError(
        403,
        "La demo operativa sólo puede ejecutarse en el entorno aislado iniciado con iniciar-demo-en-vivo.ps1",
      );
    }
    if (request.user!.role !== "ADMIN") {
      throw new AppError(403, "Sólo un administrador puede iniciar la demostración operativa");
    }

    const fixedUsers = await pool.query(
      `SELECT u.id,u.email,u.full_name,u.supplier_id,u.auth_version,r.code AS role,
              COALESCE(
                array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL),
                '{}'
              ) AS permissions
       FROM users u
       JOIN roles r ON r.id=u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id=r.id
       LEFT JOIN permissions p ON p.id=rp.permission_id
       WHERE u.active AND u.email=ANY($1::TEXT[])
       GROUP BY u.id,r.code`,
      [Object.values(fixedAccounts)],
    );
    const driver = await pool.query(
      `SELECT u.id,u.email,u.full_name,u.supplier_id,u.auth_version,r.code AS role,
              COALESCE(
                array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL),
                '{}'
              ) AS permissions
       FROM users u
       JOIN roles r ON r.id=u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id=r.id
       LEFT JOIN permissions p ON p.id=rp.permission_id
       WHERE u.active
         AND r.code='DRIVER'
         AND u.license_expiry>=CURRENT_DATE
         AND NOT EXISTS(
           SELECT 1 FROM shipments shipment
           WHERE shipment.driver_id=u.id
             AND shipment.status IN (
               'ASIGNADO','EN_TRANSITO','EN_ADUANA','RETRASADO',
               'INCIDENCIA','PENDIENTE_RECEPCION'
             )
         )
       GROUP BY u.id,r.code
       ORDER BY (u.email LIKE 'transportista.libre%@scm.local') DESC,u.email
       LIMIT 1`,
    );
    if (fixedUsers.rowCount !== Object.keys(fixedAccounts).length || !driver.rowCount) {
      throw new AppError(
        409,
        "El escenario no tiene todas las cuentas requeridas o no existe un transportista libre",
      );
    }

    const users = [...fixedUsers.rows, driver.rows[0]].map(toAuthUser);
    const sessions = Object.fromEntries(
      users.map((user) => [
        user.role,
        {
          token: signAccessToken(user),
          user,
        },
      ]),
    );
    await audit(request, {
      action: "START_LIVE_DEMO",
      entityType: "demo_scenario",
      details: {
        roles: Object.keys(sessions),
        isolated: true,
      },
    });
    response.json({
      isolated: true,
      issuedAt: new Date().toISOString(),
      sessions,
    });
  }),
);

export default router;

function toAuthUser(row: Record<string, unknown>): AuthUser {
  return {
    id: Number(row.id),
    email: String(row.email),
    fullName: String(row.full_name),
    role: String(row.role),
    supplierId: row.supplier_id ? Number(row.supplier_id) : null,
    permissions: row.permissions as string[],
    authVersion: Number(row.auth_version),
  };
}
