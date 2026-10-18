import { Injectable, BadRequestException } from '@nestjs/common';
import { hmacSha256 } from '@pactintel/shared-utils';

@Injectable()
export class HubspotOAuthService {
  private readonly secret = process.env.APP_SECRET || 'pactintel_oauth_secret_phase1_sprint4';

  generateState(orgId: string): string {
    const payload = JSON.stringify({ orgId, ts: Date.now() });
    const signature = hmacSha256(this.secret, payload);
    return Buffer.from(JSON.stringify({ payload, signature })).toString('base64url');
  }

  verifyState(state: string): { orgId: string } {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      const expectedSignature = hmacSha256(this.secret, decoded.payload);

      if (expectedSignature !== decoded.signature) {
        throw new BadRequestException('Invalid OAuth state signature.');
      }

      const parsedPayload = JSON.parse(decoded.payload);
      // Reject states older than 15 minutes
      if (Date.now() - parsedPayload.ts > 15 * 60 * 1000) {
        throw new BadRequestException('OAuth state has expired. Please re-initiate connection.');
      }

      return { orgId: parsedPayload.orgId };
    } catch (err: any) {
      throw new BadRequestException(`OAuth state verification failed: ${err.message}`);
    }
  }
}
