export class CreateCustomDomainDto {
  domain!: string;
}

export function validateDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') return false;
  const clean = domain.trim().toLowerCase();
  // Standard domain name regex (RFC 1035 / RFC 1123)
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return domainRegex.test(clean);
}
