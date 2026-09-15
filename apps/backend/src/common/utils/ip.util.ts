import * as dns from 'dns';
import * as net from 'net';
import { BadRequestException } from '@nestjs/common';

/**
 * Hardcoded allowed domains for proxying images
 */
export const ALLOWED_PROXY_DOMAINS: readonly string[] = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'locketcamera.com',
];

/**
 * Checks if a hostname belongs to the approved whitelist:
 * - firebasestorage.googleapis.com
 * - storage.googleapis.com
 * - locketcamera.com or any *.locketcamera.com subdomain
 */
export function isWhitelistedHost(hostname: string): boolean {
  if (!hostname || typeof hostname !== 'string') {
    return false;
  }

  const normalized = hostname.trim().toLowerCase();

  // Strip trailing dot if present (FQDN)
  const cleanHost = normalized.endsWith('.') ? normalized.slice(0, -1) : normalized;

  if (cleanHost === 'firebasestorage.googleapis.com' || cleanHost === 'storage.googleapis.com') {
    return true;
  }

  if (cleanHost === 'locketcamera.com' || cleanHost.endsWith('.locketcamera.com')) {
    return true;
  }

  return false;
}

/**
 * Determines whether an IP address belongs to private, loopback, link-local,
 * multicast, or reserved ranges (SSRF defense).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') {
    return true; // Treat invalid as reserved/blocked
  }

  const cleanIp = ip.trim().toLowerCase();
  const ipVersion = net.isIP(cleanIp);

  if (ipVersion === 0) {
    return true; // Invalid IP format is treated as blocked
  }

  // Handle IPv4-mapped IPv6 addresses (e.g. ::ffff:192.168.1.1)
  if (ipVersion === 6 && cleanIp.startsWith('::ffff:')) {
    const v4Part = cleanIp.slice(7);
    if (net.isIPv4(v4Part)) {
      return isPrivateOrReservedIp(v4Part);
    }
  }

  // IPv4 Checks
  if (ipVersion === 4) {
    const parts = cleanIp.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }

    const [a, b, c, d] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;

    // 10.0.0.0/8 (Private network)
    if (a === 10) return true;

    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;

    // 100.64.0.0/10 (Shared address space / Carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;

    // 169.254.0.0/16 (Link-local, including Cloud Metadata 169.254.169.254)
    if (a === 169 && b === 254) return true;

    // 172.16.0.0/12 (Private network: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 0) return true;

    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && c === 2) return true;

    // 192.168.0.0/16 (Private network)
    if (a === 192 && b === 168) return true;

    // 198.18.0.0/15 (Network benchmark testing)
    if (a === 198 && (b === 18 || b === 19)) return true;

    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) return true;

    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) return true;

    // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
    if (a >= 224 && a <= 239) return true;

    // 240.0.0.0/4 (Reserved for future use & Broadcast 255.255.255.255)
    if (a >= 240) return true;

    return false;
  }

  // IPv6 Checks
  if (ipVersion === 6) {
    // ::1 (Loopback)
    if (cleanIp === '::1' || cleanIp === '0:0:0:0:0:0:0:1') return true;

    // :: (Unspecified)
    if (cleanIp === '::' || cleanIp === '0:0:0:0:0:0:0:0') return true;

    // fc00::/7 (Unique Local Address - ULA: fc00:: - fdff::)
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true;

    // fe80::/10 (Link-Local unicast: fe80:: - febf::)
    const firstSegment = cleanIp.split(':')[0];
    if (
      firstSegment.startsWith('fe8') ||
      firstSegment.startsWith('fe9') ||
      firstSegment.startsWith('fea') ||
      firstSegment.startsWith('feb')
    ) {
      return true;
    }

    // ff00::/8 (Multicast)
    if (cleanIp.startsWith('ff')) return true;

    // 2001:db8::/32 (Documentation)
    if (cleanIp.startsWith('2001:db8') || cleanIp.startsWith('2001:0db8')) return true;

    return false;
  }

  return true;
}

/**
 * Validates a proxy URL for SSRF vulnerabilities:
 * 1. Checks valid HTTP/HTTPS protocol
 * 2. Enforces strict domain whitelist
 * 3. Resolves DNS to all IP addresses and ensures none are private or reserved
 *
 * @throws BadRequestException if the URL or resolved IP is invalid/untrusted
 */
export async function validateProxyUrl(imageUrl: string): Promise<URL> {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new BadRequestException('Image URL is required');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl.trim());
  } catch {
    throw new BadRequestException('Invalid image URL format');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new BadRequestException('Invalid protocol: only HTTP and HTTPS are permitted');
  }

  const hostname = parsedUrl.hostname;
  if (!isWhitelistedHost(hostname)) {
    throw new BadRequestException(
      `Domain "${hostname}" is not permitted for proxying. Allowed domains are firebasestorage.googleapis.com, storage.googleapis.com, and *.locketcamera.com`,
    );
  }

  // Resolve all DNS records for the hostname
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch (err: any) {
    throw new BadRequestException(`DNS resolution failed for host "${hostname}": ${err.message}`);
  }

  if (!addresses || addresses.length === 0) {
    throw new BadRequestException(`No DNS records found for host "${hostname}"`);
  }

  for (const addr of addresses) {
    if (isPrivateOrReservedIp(addr.address)) {
      throw new BadRequestException(
        `Host "${hostname}" resolved to private or reserved IP (${addr.address}) which is forbidden`,
      );
    }
  }

  return parsedUrl;
}
