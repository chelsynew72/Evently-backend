import * as bcrypt from 'bcrypt';

const OTP_LENGTH = 6;
const SALT_ROUNDS = 10;

/** Generates a random 6-digit numeric OTP as a string, e.g. "042817". */
export function generateOtp(): string {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

/** Hashes an OTP before it's stored — never persist the raw code. */
export async function hashOtp(code: string): Promise<string> {
  return bcrypt.hash(code, SALT_ROUNDS);
}

/** Compares a submitted OTP against its stored hash. */
export async function compareOtp(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
