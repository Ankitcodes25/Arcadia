/*
 * Verified support email shown in the Help & Support modal's Contact Support
 * section.
 *
 * Set it without touching code: add this line to the project's .env file and
 * restart the dev server (rebuild for production):
 *
 *   VITE_SUPPORT_EMAIL=your-real-support-address@yourdomain.com
 *
 * While the variable is missing or is not a valid address, SUPPORT_EMAIL is an
 * empty string and no mail link is rendered. Nothing is invented in its place.
 */

const raw = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  ?.VITE_SUPPORT_EMAIL;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const SUPPORT_EMAIL: string = raw && EMAIL_PATTERN.test(raw.trim()) ? raw.trim() : "";