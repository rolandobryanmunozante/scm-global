import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      message: "Los datos enviados no son válidos",
      errors: error.issues,
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.status).json({ message: error.message, details: error.details });
    return;
  }

  const pgError = error as { code?: string; constraint?: string };
  if (pgError.code === "23505") {
    response.status(409).json({
      message: "Ya existe un registro con los mismos datos únicos",
      constraint: pgError.constraint,
    });
    return;
  }
  if (pgError.code === "23503") {
    response.status(409).json({ message: "El registro está relacionado con otros datos" });
    return;
  }
  if (pgError.code === "23514") {
    response.status(400).json({ message: "El dato no cumple las reglas del negocio" });
    return;
  }

  console.error(error);
  response.status(500).json({ message: "Ocurrió un error interno" });
};
