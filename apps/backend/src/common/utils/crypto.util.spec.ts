import { CryptoUtil } from './crypto.util';

describe('CryptoUtil', () => {
  const secret = 'test_secret_key_with_sufficient_length_12345';
  const originalText = JSON.stringify({
    userId: 'user123',
    email: 'test@example.com',
    token: 'jwt-token-sample',
  });

  it('should successfully encrypt and decrypt a string', () => {
    const encrypted = CryptoUtil.encrypt(originalText, secret);
    expect(encrypted).toBeDefined();
    expect(encrypted).not.toEqual(originalText);
    expect(encrypted.split('.').length).toBe(3);

    const decrypted = CryptoUtil.decrypt(encrypted, secret);
    expect(decrypted).toEqual(originalText);
  });

  it('should fail decryption when using wrong secret', () => {
    const encrypted = CryptoUtil.encrypt(originalText, secret);
    const wrongSecret = 'different_secret_key_wrong_one!';

    expect(() => {
      CryptoUtil.decrypt(encrypted, wrongSecret);
    }).toThrow();
  });

  it('should fail decryption if ciphertext is tampered', () => {
    const encrypted = CryptoUtil.encrypt(originalText, secret);
    const parts = encrypted.split('.');
    // Tamper with ciphertext
    parts[1] = parts[1].substring(0, parts[1].length - 2) + 'AA';
    const tampered = parts.join('.');

    expect(() => {
      CryptoUtil.decrypt(tampered, secret);
    }).toThrow();
  });
});
