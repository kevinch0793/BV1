// Password hashing with Node's scrypt. Pure crypto only — NO "server-only" and
// NO next/headers imports, so it can be used from the seed script and runtime.
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEYLEN = 64;
const SALT_BYTES = 16;

const b64url = (b: Buffer) => b.toString("base64url");
const fromB64url = (s: string) => Buffer.from(s, "base64url");

/** Returns "scrypt$<saltB64url>$<hashB64url>". */
export function hashPassword(pw: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(pw, salt, KEYLEN, PARAMS);
  return `scrypt$${b64url(salt)}$${b64url(hash)}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const salt = fromB64url(saltB64);
  const expected = fromB64url(hashB64);
  const actual = scryptSync(pw, salt, expected.length, PARAMS);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
