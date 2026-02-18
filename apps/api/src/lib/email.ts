import nodemailer from 'nodemailer';
import { logger } from './logger.js';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: false,
  ...(process.env.SMTP_USER
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
    : {}),
});

const FROM = process.env.EMAIL_FROM ?? 'Notebook.md <noreply@notebookmd.io>';
const BASE_URL = process.env.APP_URL ?? 'http://localhost:5173';

export async function sendMagicLink(email: string, token: string): Promise<void> {
  const url = `${BASE_URL}/auth/magic-link?token=${encodeURIComponent(token)}`;
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Sign in to Notebook.md',
    text: `Click this link to sign in:\n\n${url}\n\nThis link expires in 15 minutes. If you didn't request this, you can safely ignore it.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1a1a1a;">Sign in to Notebook.md</h2>
        <p>Click the button below to sign in:</p>
        <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Sign In</a>
        <p style="color: #666; font-size: 14px; margin-top: 24px;">This link expires in 15 minutes. If you didn't request this, you can safely ignore it.</p>
      </div>
    `,
  });
  logger.info('Magic link email sent', { email });
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const url = `${BASE_URL}/auth/verify-email?token=${encodeURIComponent(token)}`;
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Verify your Notebook.md email',
    text: `Click this link to verify your email:\n\n${url}\n\nThis link expires in 24 hours.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1a1a1a;">Verify your email</h2>
        <p>Click the button below to verify your email address:</p>
        <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Verify Email</a>
        <p style="color: #666; font-size: 14px; margin-top: 24px;">This link expires in 24 hours.</p>
      </div>
    `,
  });
  logger.info('Verification email sent', { email });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const url = `${BASE_URL}/auth/reset-password?token=${encodeURIComponent(token)}`;
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Reset your Notebook.md password',
    text: `Click this link to reset your password:\n\n${url}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore it.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1a1a1a;">Reset your password</h2>
        <p>Click the button below to reset your password:</p>
        <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Reset Password</a>
        <p style="color: #666; font-size: 14px; margin-top: 24px;">This link expires in 1 hour. If you didn't request this, you can safely ignore it.</p>
      </div>
    `,
  });
  logger.info('Password reset email sent', { email });
}
