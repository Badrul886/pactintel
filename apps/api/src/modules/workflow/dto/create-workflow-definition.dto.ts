import {
  CreateWorkflowDefinitionDto,
  CreateWorkflowDefinitionDtoSchema,
  WorkflowDag,
} from '@pactintel/shared-types';

export class CreateWorkflowDefinitionDtoClass implements CreateWorkflowDefinitionDto {
  workspaceId!: string;
  name!: string;
  description?: string | null;
  triggerEvent!: string;
  dag!: WorkflowDag;
  maxInstances?: number;

  static validate(data: unknown): CreateWorkflowDefinitionDto {
    return CreateWorkflowDefinitionDtoSchema.parse(data);
  }
}
