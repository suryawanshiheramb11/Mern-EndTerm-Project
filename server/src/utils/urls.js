import { env } from '../config/env.js';

const matches = (host, pattern) => (pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1 : host === pattern);

/**
 * Attachment URLs must be https, carry no credentials, and point at an allow-listed host.
 * This is the swap point for real uploads: signed-URL hosts get added to ATTACHMENT_ALLOWED_HOSTS.
 */
export const isAllowedAttachmentUrl = (value, hosts = env.ATTACHMENT_ALLOWED_HOSTS) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  return hosts.some((pattern) => matches(url.hostname.toLowerCase(), pattern));
};
