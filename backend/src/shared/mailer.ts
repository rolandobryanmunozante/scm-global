import nodemailer from "nodemailer";
import { config } from "../config.js";

const transporter = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth:
        config.SMTP_USER && config.SMTP_PASS
          ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
          : undefined,
    })
  : null;

export async function sendMail(
  to: string,
  subject: string,
  body: string,
): Promise<{ delivered: boolean }> {
  if (!transporter) {
    console.info(`[mail-preview] to=${to} subject=${subject}`);
    return { delivered: false };
  }

  await transporter.sendMail({
    from: config.SMTP_FROM,
    to,
    subject,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <div style="background:#2563EB;color:white;padding:20px 24px;font-weight:700">SCM Global</div>
        <div style="padding:24px;color:#0f172a">${body}</div>
        <div style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:12px">Sistema Global de Gestión de la Cadena de Suministro</div>
      </div>`,
  });
  return { delivered: true };
}
