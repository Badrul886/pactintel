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
