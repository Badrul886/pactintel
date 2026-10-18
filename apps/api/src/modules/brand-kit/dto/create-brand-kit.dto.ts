import { CreateBrandKitDtoSchema } from '@pactintel/shared-types';

export class CreateBrandKitDto {
  static schema = CreateBrandKitDtoSchema;

  name!: string;
  workspaceId?: string;
  primaryColor!: string;
  secondaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  fontHeading?: string;
  fontBody?: string;
  customCss?: string;
  emailFromName?: string;
  emailFromDomain?: string;
  removeBadge?: boolean;
  isDefault?: boolean;
}
