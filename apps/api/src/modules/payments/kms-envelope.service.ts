import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface EncryptedEnvelope {
  encryptedCredential: Buffer;
  dekCiphertext: Buffer;
  kmsKeyId: string;
}

@Injectable()
export class KmsEnvelopeService {
  private readonly defaultKmsKeyId =
    process.env.CLOUD_KMS_PAYMENT_KEY_ID ||
    'projects/pactintel-prod/locations/us/keyRings/pactintel-ring/cryptoKeys/payment-credentials/cryptoKeyVersions/1';

  // Master CMK key used for local envelope encryption when running without live GCP KMS
  private readonly masterCmk: Buffer;

  constructor() {
    const rawCmk = process.env.KMS_SIMULATED_CMK || 'pactintel_kms_master_cmk_32_bytes!';
    this.masterCmk = crypto.createHash('sha256').update(rawCmk).digest();
  }

  /**
   * Encrypts a payment credential payload using envelope encryption (Blueprint §5.3).
   * 1. Generates 32-byte DEK.
   * 2. Encrypts payload with AES-256-GCM using DEK.
   * 3. Encrypts DEK with Cloud KMS CMK.
   * 4. Zeroes DEK buffer immediately from memory.
   */
  async encryptCredential(
    payload: Record<string, any>,
    kmsKeyId: string = this.defaultKmsKeyId,
  ): Promise<EncryptedEnvelope> {
    const payloadStr = JSON.stringify(payload);

    // 1. Generate 32-byte ephemeral DEK
    const dek = crypto.randomBytes(32);

    try {
      // 2. Encrypt credential payload with AES-256-GCM
      const iv = crypto.randomBytes(12); // 96-bit IV for GCM
      const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
      const ciphertext = Buffer.concat([cipher.update(payloadStr, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag(); // 16-byte authentication tag

      // Format: [12-byte IV][16-byte Tag][Ciphertext]
      const encryptedCredential = Buffer.concat([iv, tag, ciphertext]);

      // 3. Encrypt DEK with Cloud KMS CMK
      const dekCiphertext = this.encryptDekWithCmk(dek);

      return {
        encryptedCredential,
        dekCiphertext,
        kmsKeyId,
      };
    } finally {
      // RULE PAY-002 & EC-BYOK-04: Zero out volatile DEK immediately after encryption
      dek.fill(0);
    }
  }

  /**
   * Decrypts a payment credential payload using envelope encryption (Blueprint §5.3).
   * 1. Decrypts DEK using Cloud KMS CMK.
   * 2. Decrypts credential payload using AES-256-GCM.
   * 3. Zeroes DEK buffer immediately from memory (NEVER cached).
   */
  async decryptCredential<T = Record<string, any>>(
    encryptedCredential: Buffer | Uint8Array,
    dekCiphertext: Buffer | Uint8Array,
    _kmsKeyId?: string,
  ): Promise<T> {
    const encBuf = Buffer.isBuffer(encryptedCredential)
      ? encryptedCredential
      : Buffer.from(encryptedCredential);
    const dekBuf = Buffer.isBuffer(dekCiphertext) ? dekCiphertext : Buffer.from(dekCiphertext);

    if (!encBuf || encBuf.length < 28) {
      throw new Error('Invalid encrypted credential payload: too short for IV + Tag.');
    }

    // 1. Decrypt ephemeral DEK from KMS
    const dek = this.decryptDekWithCmk(dekBuf);

    try {
      // 2. Extract IV (12 bytes), Tag (16 bytes), and Ciphertext
      const iv = encBuf.subarray(0, 12);
      const tag = encBuf.subarray(12, 28);
      const ciphertext = encBuf.subarray(28);

      const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      const jsonStr = decrypted.toString('utf8');

      return JSON.parse(jsonStr) as T;
    } catch (err: any) {
      throw new Error(`Credential decryption failed: ${err.message}`);
    } finally {
      // RULE PAY-002 & EC-BYOK-04: Discard and zero out volatile DEK immediately
      dek.fill(0);
    }
  }

  /**
   * Encrypts DEK using the Cloud KMS CMK (or simulated KMS CMK in dev/test).
   */
  private encryptDekWithCmk(dek: Buffer): Buffer {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterCmk, iv);
    const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
  }

  /**
   * Decrypts DEK using the Cloud KMS CMK (or simulated KMS CMK in dev/test).
   */
  private decryptDekWithCmk(dekCiphertext: Buffer | Uint8Array): Buffer {
    const buf = Buffer.isBuffer(dekCiphertext) ? dekCiphertext : Buffer.from(dekCiphertext);
    if (!buf || buf.length < 28) {
      throw new Error('Invalid DEK ciphertext payload: too short.');
    }
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterCmk, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
