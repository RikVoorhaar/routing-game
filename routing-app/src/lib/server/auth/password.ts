import { hash, verify } from '@node-rs/argon2';

/**
 * Hash a password using Argon2id
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 65536, // 64MB
    timeCost: 3, // iterations
    parallelism: 1, // threads
    outputLen: 32, // bytes
    type: 'argon2id' // Argon2id variant - recommended for password hashing
  });
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await verify(hash, password);
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
} 