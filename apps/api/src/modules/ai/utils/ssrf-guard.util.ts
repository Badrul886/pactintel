import { BadRequestException } from '@nestjs/common';
import * as dns from 'dns';
import * as net from 'net';

/**
 * Checks whether an IPv4 address is in a private, loopback, link-local or reserved range.
 */
export function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // malformed, treat as unsafe
  }

  const [a, b, c] = parts;

  // 0.0.0.0/8
  if (a === 0) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 10.0.0.0/8 (RFC 1918)
  if (a === 10) return true;

  // 172.16.0.0/12 (RFC 1918: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 (RFC 1918)
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 (Link-local & GCP / AWS / Azure Cloud Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (Documentation / TEST-NET)
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future use & Broadcast)
  if (a >= 240) return true;

  return false;
}

/**
 * Checks whether an IPv6 address is loopback, unique local, link-local, or unspecified.
 */
export function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // ::1 (Loopback)
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;

  // :: (Unspecified)
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;

  // fc00::/7 (Unique local address)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  // fe80::/10 (Link-local)
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true;
  }

  // IPv4-mapped IPv6 address (::ffff:127.0.0.1 etc)
  if (normalized.startsWith('::ffff:')) {
    const ipv4 = normalized.replace('::ffff:', '');
    if (net.isIPv4(ipv4)) {
      return isPrivateOrReservedIpv4(ipv4);
    }
  }

  return false;
}

/**
 * Validates a target URL against SSRF attacks.
 * Resolves DNS and checks against all private/internal network ranges.
 */
export async function validateSafeUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid URL format');
  }

  // Only http and https protocols allowed
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException(`Disallowed URL protocol: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname;

  // Literal IP address check
  if (net.isIP(hostname)) {
    if (net.isIPv4(hostname) && isPrivateOrReservedIpv4(hostname)) {
      throw new BadRequestException('Access to private or local IP ranges is prohibited');
    }
    if (net.isIPv6(hostname) && isPrivateOrReservedIpv6(hostname)) {
      throw new BadRequestException('Access to private or local IP ranges is prohibited');
    }
    return parsed;
  }

  // Block localhost and internal names directly
  if (
    hostname.toLowerCase() === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new BadRequestException('Access to internal hostnames is prohibited');
  }

  // Resolve hostname via DNS
  try {
    const lookupResult = await dns.promises.lookup(hostname, { all: true });
    for (const record of lookupResult) {
      if (record.family === 4 && isPrivateOrReservedIpv4(record.address)) {
        throw new BadRequestException(
          'Target hostname resolves to a private or restricted network address',
        );
      }
      if (record.family === 6 && isPrivateOrReservedIpv6(record.address)) {
        throw new BadRequestException(
          'Target hostname resolves to a private or restricted network address',
        );
      }
    }
  } catch (err: any) {
    if (err instanceof BadRequestException) {
      throw err;
    }
    throw new BadRequestException(`Unable to resolve host ${hostname}: ${err.message}`);
  }

  return parsed;
}

/**
 * Fetches the URL safely with timeout and max size cap (2MB).
 */
export async function fetchSafeUrl(
  rawUrl: string,
  timeoutMs = 5000,
  maxBytes = 2 * 1024 * 1024,
): Promise<{ text: string; status: number; contentType: string }> {
  const validUrl = await validateSafeUrl(rawUrl);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(validUrl.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PactIntelProposalBot/1.0; +https://pactintel.com)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new BadRequestException(`Target URL responded with HTTP status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > maxBytes) {
      throw new BadRequestException('Content exceeds maximum permitted size (2MB)');
    }

    const text = await response.text();
    if (text.length > maxBytes) {
      return {
        text: text.slice(0, maxBytes),
        status: response.status,
        contentType,
      };
    }

    return { text, status: response.status, contentType };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new BadRequestException('Request timed out fetching target URL');
    }
    if (err instanceof BadRequestException) {
      throw err;
    }
    throw new BadRequestException(`Failed to fetch URL: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}
