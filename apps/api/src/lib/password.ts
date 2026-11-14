import { randomInt } from 'node:crypto';

// No look-alike characters (0/O, 1/l/I) so the admin can read the password to the instructor.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generateTempPassword(length = 14): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET.charAt(randomInt(ALPHABET.length));
  return out;
}
