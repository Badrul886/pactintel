import { Injectable, Logger } from '@nestjs/common';
import { WorkflowEngineService } from '../workflow-engine.service';

@Injectable()
export class WorkflowTriggerListener {
  private readonly logger = new Logger(WorkflowTriggerListener.name);

  constructor(private readonly engine: WorkflowEngineService) {}

  /**
   * Processes domain events and triggers all matching active workflows.
   */
  async handleDomainEvent(
    organizationId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<string[]> {
    this.logger.log(
      `[WorkflowTriggerListener] Received event '${eventType}' for org ${organizationId}. Evaluating workflows...`,
    );

    return this.engine.triggerWorkflow(eventType, organizationId, payload);
  }
}
