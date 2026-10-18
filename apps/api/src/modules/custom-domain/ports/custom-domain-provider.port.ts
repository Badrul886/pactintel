export interface VerificationRecord {
  type: string;
  name: string;
  value: string;
}

export interface ProvisionHostnameResult {
  hostnameId: string;
  sslStatus: string;
  verificationRecord: VerificationRecord;
}

export interface HostnameStatusResult {
  sslStatus: 'pending' | 'active' | 'error' | 'pending_validation';
  isActive: boolean;
}

export interface CustomDomainProviderPort {
  provisionHostname(domain: string, orgId: string): Promise<ProvisionHostnameResult>;
  getHostnameStatus(hostnameId: string): Promise<HostnameStatusResult>;
  deleteHostname(hostnameId: string): Promise<void>;
}
