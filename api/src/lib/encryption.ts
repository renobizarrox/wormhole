import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const hex = config.ENCRYPTION_KEY;
  if (hex) {
    return Buffer.from(hex, 'hex');
  }
  if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
    return scryptSync('wormhole-dev-only-do-not-use-in-production', 'salt', KEY_LENGTH);
  }
  throw new Error('ENCRYPTION_KEY is required in production for connection secrets');
}

/**
 * Encrypt a plaintext string (e.g. JSON stringified credentials).
 * Returns buffer: salt (16) + iv (16) + tag (16) + ciphertext.
 * Replace with KMS/Vault in production.
 */
export function encrypt(plaintext: string): Buffer {
  const key = getKey();
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, encrypted]);
}

/**
 * Decrypt a buffer produced by encrypt().
 */
export function decrypt(cipherBuffer: Buffer): string {
  const key = getKey();
  const iv = cipherBuffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = cipherBuffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = cipherBuffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
