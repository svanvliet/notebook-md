import nodemailer from 'nodemailer';
import { logger } from './logger.js';

const smtpPort = Number(process.env.SMTP_PORT ?? 1025);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: smtpPort,
  secure: smtpPort === 465,
  ...(process.env.SMTP_USER
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
    : {}),
});

const FROM = process.env.SMTP_FROM ?? process.env.EMAIL_FROM ?? 'Notebook.md <noreply@notebookmd.io>';
const BASE_URL = process.env.APP_URL ?? 'http://localhost:5173';

export async function sendMagicLink(email: string, token: string): Promise<void> {
  const url = `${BASE_URL}/app/magic-link?token=${encodeURIComponent(token)}`;
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
  const url = `${BASE_URL}/app/verify-email?token=${encodeURIComponent(token)}`;
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

export async function send2faCode(email: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Your Notebook.md verification code',
    text: `Your verification code is: ${code}\n\nThis code expires in 5 minutes. If you didn't request this, please secure your account.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1a1a1a;">Your verification code</h2>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; text-align: center; padding: 24px; background: #f3f4f6; border-radius: 8px; margin: 16px 0;">${code}</div>
        <p style="color: #666; font-size: 14px;">This code expires in 5 minutes. If you didn't request this, please secure your account.</p>
      </div>
    `,
  });
  logger.info('2FA code email sent', { email });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const url = `${BASE_URL}/app/reset-password?token=${encodeURIComponent(token)}`;
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
