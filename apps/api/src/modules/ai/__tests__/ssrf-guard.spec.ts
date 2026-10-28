import {
  isPrivateOrReservedIpv4,
  isPrivateOrReservedIpv6,
  validateSafeUrl,
} from '../utils/ssrf-guard.util';
import { BadRequestException } from '@nestjs/common';
import * as dns from 'dns';

describe('SSRF Guard Utility Unit Tests', () => {
  describe('isPrivateOrReservedIpv4', () => {
    it('identifies loopback addresses (127.0.0.0/8) as private/reserved', () => {
      expect(isPrivateOrReservedIpv4('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIpv4('127.255.255.254')).toBe(true);
    });

    it('identifies RFC 1918 Class A (10.0.0.0/8) as private/reserved', () => {
      expect(isPrivateOrReservedIpv4('10.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIpv4('10.254.1.1')).toBe(true);
    });

    it('identifies RFC 1918 Class B (172.16.0.0/12) as private/reserved', () => {
      expect(isPrivateOrReservedIpv4('172.16.0.1')).toBe(true);
      expect(isPrivateOrReservedIpv4('172.31.255.255')).toBe(true);
      // 172.32.0.1 is public
      expect(isPrivateOrReservedIpv4('172.32.0.1')).toBe(false);
    });

    it('identifies RFC 1918 Class C (192.168.0.0/16) as private/reserved', () => {
      expect(isPrivateOrReservedIpv4('192.168.0.1')).toBe(true);
      expect(isPrivateOrReservedIpv4('192.168.1.100')).toBe(true);
    });

    it('identifies cloud metadata and link-local (169.254.0.0/16) as private/reserved', () => {
      expect(isPrivateOrReservedIpv4('169.254.169.254')).toBe(true);
      expect(isPrivateOrReservedIpv4('169.254.1.1')).toBe(true);
    });

    it('allows valid public IPv4 addresses', () => {
      expect(isPrivateOrReservedIpv4('8.8.8.8')).toBe(false);
      expect(isPrivateOrReservedIpv4('1.1.1.1')).toBe(false);
      expect(isPrivateOrReservedIpv4('93.184.216.34')).toBe(false);
    });
  });

  describe('isPrivateOrReservedIpv6', () => {
    it('identifies loopback ::1 as private/reserved', () => {
      expect(isPrivateOrReservedIpv6('::1')).toBe(true);
      expect(isPrivateOrReservedIpv6('0:0:0:0:0:0:0:1')).toBe(true);
    });

    it('identifies unspecified :: as private/reserved', () => {
      expect(isPrivateOrReservedIpv6('::')).toBe(true);
      expect(isPrivateOrReservedIpv6('0:0:0:0:0:0:0:0')).toBe(true);
    });

    it('identifies unique local (fc00::/7) as private/reserved', () => {
      expect(isPrivateOrReservedIpv6('fc00::1')).toBe(true);
      expect(isPrivateOrReservedIpv6('fd12:3456:789a::1')).toBe(true);
    });

    it('identifies link-local (fe80::/10) as private/reserved', () => {
      expect(isPrivateOrReservedIpv6('fe80::1')).toBe(true);
    });
  });

  describe('validateSafeUrl', () => {
    it('rejects disallowed protocols such as file, gopher, and ftp', async () => {
      await expect(validateSafeUrl('file:///etc/passwd')).rejects.toThrow(BadRequestException);
      await expect(validateSafeUrl('gopher://127.0.0.1:70')).rejects.toThrow(BadRequestException);
      await expect(validateSafeUrl('ftp://example.com')).rejects.toThrow(BadRequestException);
    });

    it('rejects explicit internal hostnames (localhost, *.local, *.internal)', async () => {
      await expect(validateSafeUrl('http://localhost:3000')).rejects.toThrow(BadRequestException);
      await expect(validateSafeUrl('http://service.internal/api')).rejects.toThrow(
        BadRequestException,
      );
      await expect(validateSafeUrl('http://printer.local')).rejects.toThrow(BadRequestException);
    });

    it('rejects literal private IPs in URL', async () => {
      await expect(validateSafeUrl('http://127.0.0.1/admin')).rejects.toThrow(BadRequestException);
      await expect(validateSafeUrl('http://169.254.169.254/computeMetadata/v1/')).rejects.toThrow(
        BadRequestException,
      );
      await expect(validateSafeUrl('http://10.0.0.5:8080')).rejects.toThrow(BadRequestException);
      await expect(validateSafeUrl('http://[::1]:8080')).rejects.toThrow(BadRequestException);
    });

    it('accepts valid public HTTP/HTTPS URLs', async () => {
      const lookupSpy = jest
        .spyOn(dns.promises, 'lookup')
        .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as any);

      const parsed = await validateSafeUrl('https://example.com/pricing');
      expect(parsed.hostname).toBe('example.com');
      expect(parsed.protocol).toBe('https:');

      lookupSpy.mockRestore();
    });
  });
});
