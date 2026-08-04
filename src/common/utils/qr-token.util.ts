import * as crypto from 'crypto';

/**
 * Ticket QR codes encode a signed token, not just a raw ticket ID — this
 * lets the check-in scanner verify authenticity offline-first (signature
 * check) before hitting the database, and makes forged/tampered QR codes
 * detectable immediately instead of only failing a DB lookup.
 */
export function signQrToken(ticketId: string, secret: string): string {
  const signature = crypto.createHmac('sha256', secret).update(ticketId).digest('hex');
  return `${ticketId}.${signature}`;
}

export function verifyQrToken(
  token: string,
  secret: string,
): { valid: boolean; ticketId?: string } {
  const [ticketId, signature] = token.split('.');
  if (!ticketId || !signature) return { valid: false };

  const expected = crypto.createHmac('sha256', secret).update(ticketId).digest('hex');
  const valid =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

  return valid ? { valid: true, ticketId } : { valid: false };
}
