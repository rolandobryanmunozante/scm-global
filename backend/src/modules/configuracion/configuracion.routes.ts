import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/async-handler.js";
import { authenticate } from "../../shared/auth.js";
import { pool } from "../../shared/db.js";
import { AppError } from "../../shared/errors.js";

const router = Router();
router.use(authenticate);

router.get(
  "/notificaciones",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [request.user!.id],
    );
    response.json(result.rows);
  }),
);

router.patch(
  "/notificaciones/:id/leer",
  asyncHandler(async (request, response) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const result = await pool.query(
      "UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING *",
      [id, request.user!.id],
    );
    if (!result.rowCount) throw new AppError(404, "Notificación no encontrada");
    response.json(result.rows[0]);
  }),
);

router.get(
  "/preferencias",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT * FROM notification_preferences WHERE user_id=$1 ORDER BY event_code`,
      [request.user!.id],
    );
    response.json(result.rows);
  }),
);

router.put(
  "/preferencias",
  asyncHandler(async (request, response) => {
    const input = z
      .array(
        z.object({
          event_code: z.string().trim().min(2).max(80),
          app_enabled: z.boolean(),
          email_enabled: z.boolean(),
          push_enabled: z.boolean(),
        }),
      )
      .max(30)
      .parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const preference of input) {
        await client.query(
          `INSERT INTO notification_preferences(user_id,event_code,app_enabled,email_enabled,push_enabled)
           VALUES($1,$2,$3,$4,$5)
           ON CONFLICT(user_id,event_code) DO UPDATE SET
             app_enabled=EXCLUDED.app_enabled,email_enabled=EXCLUDED.email_enabled,push_enabled=EXCLUDED.push_enabled`,
          [
            request.user!.id,
            preference.event_code,
            preference.app_enabled,
            preference.email_enabled,
            preference.push_enabled,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    response.json({ updated: input.length });
  }),
);

router.patch(
  "/idioma",
  asyncHandler(async (request, response) => {
    const { language } = z.object({ language: z.enum(["es", "en", "pt"]) }).parse(request.body);
    await pool.query("UPDATE users SET language=$2 WHERE id=$1", [request.user!.id, language]);
    response.json({ language });
  }),
);

export default router;
