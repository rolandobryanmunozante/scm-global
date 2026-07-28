import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { pool } from "./db.js";
import { AppError } from "./errors.js";

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: string;
  supplierId: number | null;
  permissions: string[];
  authVersion: number;
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(user, config.JWT_SECRET, {
    expiresIn: "30m",
    issuer: "scm-global",
    audience: "scm-web",
  });
}

export async function authenticate(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    next(new AppError(401, "Debe iniciar sesión"));
    return;
  }

  try {
    const claims = jwt.verify(token, config.JWT_SECRET, {
      issuer: "scm-global",
      audience: "scm-web",
    }) as AuthUser;
    request.user = await loadCurrentUser(claims);
    next();
  } catch {
    next(new AppError(401, "La sesión expiró o no es válida"));
  }
}

export async function optionalAuthenticate(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    next();
    return;
  }
  try {
    const claims = jwt.verify(token, config.JWT_SECRET, {
      issuer: "scm-global",
      audience: "scm-web",
    }) as AuthUser;
    request.user = await loadCurrentUser(claims);
  } catch {
    request.user = undefined;
  }
  next();
}

export function requirePermission(...permissions: string[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const allowed = permissions.some((permission) => request.user?.permissions.includes(permission));
    if (!allowed) {
      next(new AppError(403, "No tiene permiso para realizar esta acción"));
      return;
    }
    next();
  };
}

async function loadCurrentUser(claims: AuthUser): Promise<AuthUser> {
  const result = await pool.query(
    `SELECT u.id,u.email,u.full_name,u.supplier_id,u.auth_version,r.code AS role,
            COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL),'{}') AS permissions
     FROM users u
     JOIN roles r ON r.id=u.role_id
     LEFT JOIN role_permissions rp ON rp.role_id=r.id
     LEFT JOIN permissions p ON p.id=rp.permission_id
     WHERE u.id=$1 AND u.active
       AND (r.code<>'SUPPLIER' OR EXISTS (
         SELECT 1 FROM suppliers s WHERE s.id=u.supplier_id AND s.active
       ))
     GROUP BY u.id,r.code`,
    [claims.id],
  );
  const user = result.rows[0];
  if (!user || Number(user.auth_version) !== Number(claims.authVersion)) {
    throw new AppError(401, "La sesión fue revocada");
  }
  return {
    id: Number(user.id),
    email: String(user.email),
    fullName: String(user.full_name),
    role: String(user.role),
    supplierId: user.supplier_id ? Number(user.supplier_id) : null,
    permissions: user.permissions as string[],
    authVersion: Number(user.auth_version),
  };
}
