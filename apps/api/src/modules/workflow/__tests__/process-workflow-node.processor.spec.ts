import { ProcessWorkflowNodeProcessor } from '../processors/process-workflow-node.processor';
import { WorkflowEngineService } from '../workflow-engine.service';
import { ClsService } from 'nestjs-cls';

describe('ProcessWorkflowNodeProcessor (Unit Tests)', () => {
  let processor: ProcessWorkflowNodeProcessor;
  let mockEngine: any;
  let mockCls: any;

  beforeEach(() => {
    mockEngine = {
      processNode: jest.fn().mockResolvedValue(undefined),
    };
    mockCls = {
      set: jest.fn(),
    };
    processor = new ProcessWorkflowNodeProcessor(
      mockEngine as unknown as WorkflowEngineService,
      mockCls as unknown as ClsService,
    );
  });

  it('instantiates processor cleanly and executes lifecycle hooks', async () => {
    expect(processor).toBeDefined();
    await processor.onModuleInit();
    await processor.onModuleDestroy();
  });
});
