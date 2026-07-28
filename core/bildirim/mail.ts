// SMTP mail gönderimi (nodemailer).
import nodemailer from 'nodemailer';
import { config } from '../config.js';

let _transport: nodemailer.Transporter | null = null;

function transport(): nodemailer.Transporter {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.port === 465, // 465 → SSL, 587 → STARTTLS
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
    });
  }
  return _transport;
}

export async function mailGonder(alicilar: string[], konu: string, html: string): Promise<void> {
  await transport().sendMail({
    from: config.mail.from,
    to: alicilar.join(', '),
    subject: konu,
    html,
  });
}
