import * as bcrypt from 'bcrypt';

const CODE_LENGTH = 6;
const SALT_ROUNDS = 10;

/** Generates a random 6-digit numeric code as a string, e.g. "042817". */
export function generateCode(): string {
  const min = 10 ** (CODE_LENGTH - 1);
  const max = 10 ** CODE_LENGTH - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

/** Hashes a code before it's stored — never persist the raw code. */
export async function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, SALT_ROUNDS);
}

/** Compares a submitted code against its stored hash. */
export async function compareCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}