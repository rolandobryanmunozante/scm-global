import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { AppError } from "./errors.js";

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: string;
  supplierId: number | null;
  permissions: string[];
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(user, config.JWT_SECRET, {
    expiresIn: "30m",
    issuer: "scm-global",
    audience: "scm-web",
  });
}

export function authenticate(request: Request, _response: Response, next: NextFunction): void {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    next(new AppError(401, "Debe iniciar sesión"));
    return;
  }

  try {
    request.user = jwt.verify(token, config.JWT_SECRET, {
      issuer: "scm-global",
      audience: "scm-web",
    }) as AuthUser;
    next();
  } catch {
    next(new AppError(401, "La sesión expiró o no es válida"));
  }
}

export function optionalAuthenticate(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    next();
    return;
  }
  try {
    request.user = jwt.verify(token, config.JWT_SECRET, {
      issuer: "scm-global",
      audience: "scm-web",
    }) as AuthUser;
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
