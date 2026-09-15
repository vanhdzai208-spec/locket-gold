import * as dns from 'dns';
import {
  isPrivateOrReservedIp,
  isWhitelistedHost,
  validateProxyUrl,
} from './ip.util';

jest.mock('dns', () => ({
  promises: {
    lookup: jest.fn(),
  },
}));

describe('ip.util (SSRF Protection)', () => {
  describe('isWhitelistedHost', () => {
    it('should allow valid whitelisted domains', () => {
      expect(isWhitelistedHost('firebasestorage.googleapis.com')).toBe(true);
      expect(isWhitelistedHost('storage.googleapis.com')).toBe(true);
      expect(isWhitelistedHost('locketcamera.com')).toBe(true);
      expect(isWhitelistedHost('api.locketcamera.com')).toBe(true);
      expect(isWhitelistedHost('cdn.locketcamera.com')).toBe(true);
      expect(isWhitelistedHost('sub.dev.locketcamera.com')).toBe(true);
      // Case insensitive
      expect(isWhitelistedHost('FIREBASESTORAGE.GOOGLEAPIS.COM')).toBe(true);
      // FQDN with trailing dot
      expect(isWhitelistedHost('firebasestorage.googleapis.com.')).toBe(true);
    });

    it('should reject domains not in whitelist', () => {
      expect(isWhitelistedHost('evil.com')).toBe(false);
      expect(isWhitelistedHost('notlocketcamera.com')).toBe(false);
      expect(isWhitelistedHost('fakelocketcamera.com')).toBe(false);
      expect(isWhitelistedHost('google.com')).toBe(false);
      expect(isWhitelistedHost('example.com')).toBe(false);
      expect(isWhitelistedHost('169.254.169.254')).toBe(false);
      expect(isWhitelistedHost('localhost')).toBe(false);
      expect(isWhitelistedHost('')).toBe(false);
    });
  });

  describe('isPrivateOrReservedIp', () => {
    it('should identify private and loopback IPv4 addresses', () => {
      // Loopback
      expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('127.1.2.3')).toBe(true);
      // 10.0.0.0/8
      expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('10.255.255.255')).toBe(true);
      // 172.16.0.0/12
      expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
      expect(isPrivateOrReservedIp('172.20.10.5')).toBe(true);
      // Non-private 172.x should not be blocked
      expect(isPrivateOrReservedIp('172.15.0.1')).toBe(false);
      expect(isPrivateOrReservedIp('172.32.0.1')).toBe(false);
      // 192.168.0.0/16
      expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
      expect(isPrivateOrReservedIp('192.168.254.254')).toBe(true);
    });

    it('should identify cloud metadata IP (169.254.169.254) and link-local', () => {
      expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
      expect(isPrivateOrReservedIp('169.254.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('169.254.255.255')).toBe(true);
    });

    it('should identify CGNAT, multicast, reserved, and invalid IPs', () => {
      // 0.0.0.0/8
      expect(isPrivateOrReservedIp('0.0.0.0')).toBe(true);
      // CGNAT 100.64.0.0/10
      expect(isPrivateOrReservedIp('100.64.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('100.127.255.255')).toBe(true);
      expect(isPrivateOrReservedIp('100.128.0.1')).toBe(false);
      // Multicast 224.0.0.0/4
      expect(isPrivateOrReservedIp('224.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('239.255.255.255')).toBe(true);
      // Reserved 240.0.0.0/4 and Broadcast
      expect(isPrivateOrReservedIp('240.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('255.255.255.255')).toBe(true);
      // Invalid format
      expect(isPrivateOrReservedIp('not-an-ip')).toBe(true);
      expect(isPrivateOrReservedIp('')).toBe(true);
    });

    it('should allow legitimate public IPv4 addresses', () => {
      expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
      expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false);
      expect(isPrivateOrReservedIp('142.250.190.46')).toBe(false);
    });

    it('should identify private/reserved IPv6 addresses', () => {
      // Loopback
      expect(isPrivateOrReservedIp('::1')).toBe(true);
      // Unspecified
      expect(isPrivateOrReservedIp('::')).toBe(true);
      // Unique Local Address fc00::/7
      expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
      expect(isPrivateOrReservedIp('fd12:3456:789a::1')).toBe(true);
      // Link-local fe80::/10
      expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
      // Multicast ff00::/8
      expect(isPrivateOrReservedIp('ff02::1')).toBe(true);
      // IPv4 mapped IPv6 containing private IP
      expect(isPrivateOrReservedIp('::ffff:192.168.1.1')).toBe(true);
      expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('::ffff:169.254.169.254')).toBe(true);
    });
  });

  describe('validateProxyUrl', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should allow valid URL with whitelisted domain resolving to public IP', async () => {
      (dns.promises.lookup as jest.Mock).mockResolvedValue([
        { address: '142.250.190.46', family: 4 },
      ]);

      const url = await validateProxyUrl('https://firebasestorage.googleapis.com/v0/b/bucket/image.jpg');
      expect(url.hostname).toBe('firebasestorage.googleapis.com');
    });

    it('should reject URLs with non-whitelisted domains', async () => {
      await expect(validateProxyUrl('https://evil.com/image.jpg')).rejects.toThrow(
        'not permitted for proxying',
      );
      await expect(validateProxyUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
        'not permitted for proxying',
      );
    });

    it('should reject invalid protocol (e.g. ftp:, file:)', async () => {
      await expect(validateProxyUrl('ftp://firebasestorage.googleapis.com/test')).rejects.toThrow(
        'Invalid protocol',
      );
      await expect(validateProxyUrl('file:///etc/passwd')).rejects.toThrow(
        'Invalid protocol',
      );
    });

    it('should reject if DNS resolves to private or loopback IP', async () => {
      (dns.promises.lookup as jest.Mock).mockResolvedValue([
        { address: '127.0.0.1', family: 4 },
      ]);

      await expect(
        validateProxyUrl('https://api.locketcamera.com/test.jpg'),
      ).rejects.toThrow('resolved to private or reserved IP');
    });

    it('should reject if DNS resolves to cloud metadata IP (169.254.169.254)', async () => {
      (dns.promises.lookup as jest.Mock).mockResolvedValue([
        { address: '169.254.169.254', family: 4 },
      ]);

      await expect(
        validateProxyUrl('https://firebasestorage.googleapis.com/metadata'),
      ).rejects.toThrow('resolved to private or reserved IP (169.254.169.254)');
    });
  });
});
