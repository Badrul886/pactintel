import {
  WorkflowDefinitionResponseDto,
  WorkflowDag,
  WorkflowDefinitionStatus,
} from '@pactintel/shared-types';

export class WorkflowDefinitionResponseDtoClass implements WorkflowDefinitionResponseDto {
  id!: string;
  organizationId!: string;
  workspaceId!: string;
  name!: string;
  description?: string | null;
  triggerEvent!: string;
  dag!: WorkflowDag;
  status!: WorkflowDefinitionStatus;
  version!: number;
  maxInstances!: number;
  createdBy!: string;
  createdAt!: Date | string;
  updatedAt!: Date | string;
}
