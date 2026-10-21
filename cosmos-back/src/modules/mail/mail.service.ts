import { Injectable } from '@nestjs/common'
import * as nodemailer from 'nodemailer'

export interface PasswordResetMailParams {
  toEmail: string
  code: string
  appName?: string
  logoUrl?: string
}

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter

  constructor() {
    const userEmail = process.env.USER_EMAIL
    const passwordEmail = process.env.PASSWORD_EMAIL

    if (userEmail && passwordEmail) {
      // Configuración directa para Gmail
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: userEmail,
          pass: passwordEmail, // recomendado usar App Password en cuentas con 2FA
        },
      })
    } else {
      // Fallback genérico por si se usan otras credenciales SMTP
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Boolean(process.env.SMTP_SECURE === 'true'),
        auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        } : undefined,
      })
    }
  }

  async sendPasswordResetCode(params: PasswordResetMailParams): Promise<void> {
    // El correo se compone sobre fondo oscuro, así que la marca va en su versión
    // blanca. Se usa el isotipo y no el logotipo completo porque en la cabecera
    // acompaña al nombre de la aplicación, que ya aparece como texto al lado.
    // La imagen la sirve el frontend desde `public/images`.
    const { toEmail, code, appName = 'Cosmos', logoUrl = 'https://checkin.cosmos.com.pe/images/cosmos-isotipo-blanco.png' } = params
    const subject = `${appName} - Código de verificación`
    const html = this.buildPasswordResetHtml({ code, appName, logoUrl })
    await this.transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.USER_EMAIL || `no-reply@${new URL(logoUrl).hostname}`,
      to: toEmail,
      subject,
      html,
    })
  }

  private buildPasswordResetHtml({ code, appName, logoUrl }: { code: string, appName: string, logoUrl: string }): string {
    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${appName} - Código de verificación</title>
  <style>
    body { background:#002736; margin:0; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#e5e7eb; }
    .container { max-width:600px; margin:0 auto; padding:24px; }
    .card { background:#111827; border:1px solid #1f2937; border-radius:16px; overflow:hidden; }
    .header { display:flex; align-items:center; gap:12px; padding:20px; border-bottom:1px solid #1f2937; }
    .logo { height:40px; }
    .title { font-size:18px; font-weight:600; color:#f3f4f6; }
    .content { padding:24px; }
    .lead { font-size:16px; color:#d1d5db; line-height:1.6; }
    /* El codigo va sobre un recuadro oscuro, asi que usa un tono claro de la
       rampa corporativa (8.6:1) y no el tono medio, que se quedaria en 4.4:1. */
    .code { margin:24px 0; font-size:32px; letter-spacing:8px; font-weight:700; text-align:center; padding:16px; background:#0f172a; border:1px dashed #374151; border-radius:12px; color:#4cc1eb; }
    .muted { color:#9ca3af; font-size:14px; }
    .footer { padding:16px 24px 24px; color:#6b7280; font-size:12px; }
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  </head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <img class="logo" src="${logoUrl}" alt="${appName} logo" />
        <div class="title">${appName}</div>
      </div>
      <div class="content">
        <p class="lead">Tu código de verificación es:</p>
        <div class="code">${code}</div>
        <p class="muted">Este código expira en 10 minutos. Si no solicitaste este cambio, ignora este mensaje.</p>
      </div>
      <div class="footer">&copy; ${new Date().getFullYear()} ${appName}. Todos los derechos reservados.</div>
    </div>
  </div>
</body>
</html>
    `
  }
}


