import {
  ResumeWorkflowInstanceDto,
  ResumeWorkflowInstanceDtoSchema,
} from '@pactintel/shared-types';

export class ResumeWorkflowInstanceDtoClass implements ResumeWorkflowInstanceDto {
  action!: 'resume' | 'halt' | 'skip';
  nodeId?: string;

  static validate(data: unknown): ResumeWorkflowInstanceDto {
    return ResumeWorkflowInstanceDtoSchema.parse(data);
  }
}
