import * as crypto from 'crypto';

export class CryptoUtil {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96 bits for GCM
  private static readonly AUTH_TAG_LENGTH = 16; // 128 bits

  /**
   * Derive a 32-byte key from a string secret using SHA-256
   */
  private static deriveKey(secret: string): Buffer {
    return crypto.createHash('sha256').update(secret).digest();
  }

  /**
   * Encrypt arbitrary string data with AES-256-GCM
   * Returns base64url encoded: iv.ciphertext.authTag
   */
  static encrypt(plainText: string, secret: string): string {
    const key = this.deriveKey(secret);
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return [
      iv.toString('base64url'),
      encrypted.toString('base64url'),
      authTag.toString('base64url'),
    ].join('.');
  }

  /**
   * Decrypt AES-256-GCM string
   * Throws error if payload was tampered with or corrupted
   */
  static decrypt(cipherPayload: string, secret: string): string {
    const parts = cipherPayload.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid cipher payload format');
    }

    const [ivB64, encryptedB64, authTagB64] = parts;
    const iv = Buffer.from(ivB64, 'base64url');
    const encrypted = Buffer.from(encryptedB64, 'base64url');
    const authTag = Buffer.from(authTagB64, 'base64url');

    if (iv.length !== this.IV_LENGTH || authTag.length !== this.AUTH_TAG_LENGTH) {
      throw new Error('Invalid IV or AuthTag length');
    }

    const key = this.deriveKey(secret);
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
