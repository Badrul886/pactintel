import * as crypto from 'crypto';

/**
 * Calculates SHA-256 hash of a string (hex encoded).
 * Used for content hashing, document snapshot verification, and API key lookups.
 */
export const sha256 = (input: string): string => {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
};

/**
 * Calculates HMAC-SHA256 signature of a payload using a secret.
 * Used for webhook signature verification.
 */
export const hmacSha256 = (secret: string, payload: string): string => {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
};

/**
 * Recursively canonicalizes an object by sorting all dictionary keys alphabetically.
 * Ensures deterministic JSON representation for document version content hashing (RULE SIG-002).
 */
export const canonicalJson = (obj: unknown): string => {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJson(item)).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sortedKeys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + canonicalJson(val);
  });

  return '{' + pairs.join(',') + '}';
};

/**
 * Returns cryptographically secure random bytes.
 */
export const secureRandom = (bytes: number): Buffer => {
  return crypto.randomBytes(bytes);
};

/**
 * Generates an API key with prefix and SHA-256 hash (RULE AUTH-002).
 * Formats: pk_live_40chars or pk_test_40chars.
 */
export const generateApiKey = (
  envPrefix: 'pk_live_' | 'pk_test_' = 'pk_live_',
): { plaintextKey: string; keyPrefix: string; keyHash: string } => {
  const randomChars = crypto.randomBytes(20).toString('hex'); // 40 hex chars
  const plaintextKey = `${envPrefix}${randomChars}`;
  const keyPrefix = plaintextKey.slice(0, 8);
  const keyHash = sha256(plaintextKey);

  return {
    plaintextKey,
    keyPrefix,
    keyHash,
  };
};

/**
 * Encrypts plaintext using AES-256-GCM.
 * Output format: [12 bytes IV] + [16 bytes Auth Tag] + [Ciphertext]
 */
export const aesGcmEncrypt = (plaintext: string | Buffer, key: Buffer): Buffer => {
  if (key.length !== 32) {
    throw new Error('AES-256 key must be exactly 32 bytes.');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const bufferPlaintext =
    typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
  const encrypted = Buffer.concat([cipher.update(bufferPlaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
};

/**
 * Decrypts ciphertext encrypted with aesGcmEncrypt using AES-256-GCM.
 */
export const aesGcmDecrypt = (ciphertextPayload: Buffer, key: Buffer): Buffer => {
  if (key.length !== 32) {
    throw new Error('AES-256 key must be exactly 32 bytes.');
  }
  if (ciphertextPayload.length < 28) {
    throw new Error('Invalid ciphertext payload: insufficient length for IV and tag.');
  }
  const iv = ciphertextPayload.subarray(0, 12);
  const tag = ciphertextPayload.subarray(12, 28);
  const ciphertext = ciphertextPayload.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};
