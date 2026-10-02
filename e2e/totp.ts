import { createHmac } from "node:crypto";

/**
 * RFC 6238 TOTP, mirroring the backend's TotpService exactly: HMAC-SHA1 over the 8-byte
 * big-endian time step, a 30-second step, 6 digits, and a base32 (RFC 4648) secret. The server
 * accepts the previous/current/next step, so a code computed a moment before submission is valid.
 */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(secret: string): Buffer {
  const clean = secret.trim().toUpperCase().replace(/=+$/, "");
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const c of clean) {
    const v = BASE32.indexOf(c);
    if (v < 0) throw new Error(`Not base32: ${c}`);
    buffer = ((buffer << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The code for one explicit time step (RFC 4226 dynamic truncation). */
export function totpAt(secret: string, timeStep: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const hash = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const off = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[off] & 0x7f) << 24) | ((hash[off + 1] & 0xff) << 16) | ((hash[off + 2] & 0xff) << 8) | (hash[off + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** The code valid right now (floor(now / 30s)). */
export function totp(secret: string, nowMs = Date.now(), stepSeconds = 30): string {
  return totpAt(secret, Math.floor(nowMs / 1000 / stepSeconds));
}
