import {
  WorkflowInstanceResponseDto,
  WorkflowInstanceStatus,
  WorkflowNodeExecutionDto,
  WorkflowNodeExecutionStatus,
  WorkflowMetricsDto,
} from '@pactintel/shared-types';

export class WorkflowInstanceResponseDtoClass implements WorkflowInstanceResponseDto {
  id!: string;
  organizationId!: string;
  workflowId!: string;
  triggerPayload!: Record<string, unknown>;
  currentNodeId?: string | null;
  status!: WorkflowInstanceStatus;
  chainDepth!: number;
  visitedNodes!: string[];
  errorMessage?: string | null;
  startedAt!: Date | string;
  completedAt?: Date | string | null;
  updatedAt!: Date | string;
  workflowName?: string;
}

export class WorkflowNodeExecutionDtoClass implements WorkflowNodeExecutionDto {
  id!: string;
  organizationId!: string;
  instanceId!: string;
  nodeId!: string;
  nodeType!: string;
  input!: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  status!: WorkflowNodeExecutionStatus;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  errorMessage?: string | null;
  createdAt!: Date | string;
}

export class WorkflowMetricsDtoClass implements WorkflowMetricsDto {
  totalTriggered!: number;
  totalCompleted!: number;
  totalFailed!: number;
  totalHalted!: number;
  activeWorkflowsCount!: number;
}
