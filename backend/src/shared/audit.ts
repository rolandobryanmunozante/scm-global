import type { Request } from "express";
import type { PoolClient } from "pg";
import { pool } from "./db.js";

interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | number;
  details?: Record<string, unknown>;
}

export async function audit(
  request: Request,
  input: AuditInput,
  client?: PoolClient,
): Promise<void> {
  const executor = client ?? pool;
  await executor.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      request.user?.id ?? null,
      input.action,
      input.entityType,
      input.entityId?.toString() ?? null,
      JSON.stringify(input.details ?? {}),
      request.ip,
    ],
  );
}
