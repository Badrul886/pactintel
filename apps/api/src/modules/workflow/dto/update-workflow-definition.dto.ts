import {
  UpdateWorkflowDefinitionDto,
  UpdateWorkflowDefinitionDtoSchema,
  WorkflowDag,
  WorkflowDefinitionStatus,
} from '@pactintel/shared-types';

export class UpdateWorkflowDefinitionDtoClass implements UpdateWorkflowDefinitionDto {
  name?: string;
  description?: string | null;
  triggerEvent?: string;
  dag?: WorkflowDag;
  status?: WorkflowDefinitionStatus;
  maxInstances?: number;

  static validate(data: unknown): UpdateWorkflowDefinitionDto {
    return UpdateWorkflowDefinitionDtoSchema.parse(data);
  }
}
