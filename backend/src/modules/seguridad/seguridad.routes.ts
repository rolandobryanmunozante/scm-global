import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config } from "../../config.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { authenticate, requirePermission, signAccessToken } from "../../shared/auth.js";
import { audit } from "../../shared/audit.js";
import { pool } from "../../shared/db.js";
import { AppError } from "../../shared/errors.js";
import { sendMail } from "../../shared/mailer.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (request, response) => {
    const input = loginSchema.parse(request.body);
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.password_hash, u.supplier_id, u.active,
              u.failed_attempts, u.locked_until, r.code AS role,
              COALESCE(array_agg(p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE LOWER(u.email) = $1
       GROUP BY u.id, r.code`,
      [input.email],
    );
    const user = result.rows[0];
    const invalid = new AppError(401, "Correo o contraseña incorrectos");

    if (!user || !user.active) {
      throw invalid;
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new AppError(423, "La cuenta está bloqueada temporalmente. Intente más tarde.");
    }

    const matches = await bcrypt.compare(input.password, user.password_hash);
    if (!matches) {
      const attempts = Number(user.failed_attempts) + 1;
      await pool.query(
        `UPDATE users
         SET failed_attempts = CASE WHEN $2 >= 5 THEN 0 ELSE $2 END,
             locked_until = CASE WHEN $2 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
         WHERE id = $1`,
        [user.id, attempts],
      );
      throw invalid;
    }

    await pool.query(
      "UPDATE users SET failed_attempts = 0, locked_until = NULL, last_access = NOW() WHERE id = $1",
      [user.id],
    );

    const authUser = {
      id: Number(user.id),
      email: user.email as string,
      fullName: user.full_name as string,
      role: user.role as string,
      supplierId: user.supplier_id ? Number(user.supplier_id) : null,
      permissions: user.permissions as string[],
    };

    const token = signAccessToken(authUser);
    request.user = authUser;
    await audit(request, { action: "LOGIN", entityType: "user", entityId: user.id });
    response.json({ token, expiresIn: 1800, user: authUser });
  }),
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (request, response) => {
    response.json({ user: request.user });
  }),
);

router.post(
  "/forgot-password",
  loginLimiter,
  asyncHandler(async (request, response) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(request.body);
    const result = await pool.query("SELECT id, full_name FROM users WHERE LOWER(email) = $1 AND active", [
      email,
    ]);
    const user = result.rows[0];
    let developmentToken: string | undefined;

    if (user) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [user.id, tokenHash],
      );
      await sendMail(
        email,
        "Recuperación de contraseña",
        `<p>Hola ${user.full_name},</p><p>Use este código dentro de la próxima hora:</p><p style="font-size:20px;font-weight:700">${token}</p>`,
      );
      if (config.NODE_ENV !== "production" && !config.SMTP_HOST) {
        developmentToken = token;
      }
    }

    response.json({
      message: "Si el correo existe, se enviaron las instrucciones de recuperación.",
      ...(developmentToken ? { developmentToken } : {}),
    });
  }),
);

router.post(
  "/reset-password",
  loginLimiter,
  asyncHandler(async (request, response) => {
    const { token, password } = z
      .object({
        token: z.string().length(64),
        password: z.string().min(10).max(128),
      })
      .parse(request.body);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const result = await pool.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash],
    );
    const reset = result.rows[0];
    if (!reset) {
      throw new AppError(400, "El enlace de recuperación expiró o ya fue utilizado");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE users SET password_hash = $2, failed_attempts = 0, locked_until = NULL WHERE id = $1",
        [reset.user_id, passwordHash],
      );
      await client.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1", [reset.id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    response.json({ message: "Contraseña actualizada correctamente" });
  }),
);

router.get(
  "/roles",
  authenticate,
  requirePermission("users.manage"),
  asyncHandler(async (_request, response) => {
    const result = await pool.query("SELECT id, code, name, description FROM roles ORDER BY name");
    response.json(result.rows);
  }),
);

router.get(
  "/usuarios",
  authenticate,
  requirePermission("users.manage"),
  asyncHandler(async (_request, response) => {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.active, u.language, u.last_access,
              r.id AS role_id, r.code AS role, r.name AS role_name, s.commercial_name AS supplier
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN suppliers s ON s.id = u.supplier_id
       ORDER BY u.full_name`,
    );
    response.json(result.rows);
  }),
);

router.post(
  "/usuarios",
  authenticate,
  requirePermission("users.manage"),
  asyncHandler(async (request, response) => {
    const input = z
      .object({
        full_name: z.string().trim().min(3).max(120),
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(10).max(128),
        role_id: z.coerce.number().int().positive(),
        supplier_id: z.coerce.number().int().positive().nullable().optional(),
        language: z.enum(["es", "en", "pt"]).default("es"),
        license_number: z.string().trim().max(50).nullable().optional(),
        license_expiry: z.string().date().nullable().optional(),
      })
      .parse(request.body);
    const hash = await bcrypt.hash(input.password, 12);
    const result = await pool.query(
      `INSERT INTO users
        (full_name, email, password_hash, role_id, supplier_id, language, license_number, license_expiry)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, full_name, email, active, language`,
      [
        input.full_name,
        input.email,
        hash,
        input.role_id,
        input.supplier_id ?? null,
        input.language,
        input.license_number ?? null,
        input.license_expiry ?? null,
      ],
    );
    await audit(request, {
      action: "CREATE",
      entityType: "user",
      entityId: result.rows[0].id,
      details: { email: input.email },
    });
    response.status(201).json(result.rows[0]);
  }),
);

router.patch(
  "/usuarios/:id",
  authenticate,
  requirePermission("users.manage"),
  asyncHandler(async (request, response) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const input = z
      .object({
        full_name: z.string().trim().min(3).max(120).optional(),
        role_id: z.coerce.number().int().positive().optional(),
        active: z.boolean().optional(),
        language: z.enum(["es", "en", "pt"]).optional(),
      })
      .refine((value) => Object.keys(value).length > 0)
      .parse(request.body);
    const result = await pool.query(
      `UPDATE users SET
         full_name = COALESCE($2, full_name),
         role_id = COALESCE($3, role_id),
         active = COALESCE($4, active),
         language = COALESCE($5, language)
       WHERE id = $1
       RETURNING id, full_name, email, active, language`,
      [id, input.full_name ?? null, input.role_id ?? null, input.active ?? null, input.language ?? null],
    );
    if (!result.rowCount) throw new AppError(404, "Usuario no encontrado");
    await audit(request, { action: "UPDATE", entityType: "user", entityId: id, details: input });
    response.json(result.rows[0]);
  }),
);

export default router;
