import { jest } from '@jest/globals';
import { TaskExecutor } from '../../../../src/core/tasks/task-executor';
import { SmartBrowserError } from '../../../../src/types';
import MockFactory from '../../../helpers/mock-factory';

// Mock dependencies
const mockSearchExecutor = {
  getName: jest.fn().mockReturnValue('SearchExecutor'),
  canHandle: jest.fn().mockReturnValue(true),
  execute: jest.fn(),
  executeBatch: jest.fn(),
  healthCheck: jest.fn().mockResolvedValue(true),
  getConfig: jest.fn().mockReturnValue({})
};

const mockClaudeClient = {
  analyzeGoal: jest.fn(),
  generateResponse: jest.fn()
};

jest.mock('../../../../src/core/tasks/executors/search-executor', () => ({
  searchExecutor: mockSearchExecutor
}));

jest.mock('../../../../src/core/ai/claude-client', () => ({
  claudeClient: mockClaudeClient
}));

jest.mock('../../../../src/core/utils/logger', () => ({
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('TaskExecutor', () => {
  let taskExecutor: TaskExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    taskExecutor = new TaskExecutor();
  });

  afterEach(async () => {
    await taskExecutor.cleanup();
  });

  describe('executeTask', () => {
    const mockTask = MockFactory.createMockTask({ type: 'search' });
    const mockContext = {
      userId: 'test-user-id',
      sessionId: 'test-session-id',
      currentUrl: 'https://example.com'
    };

    it('should execute task successfully', async () => {
      const mockResult = MockFactory.createMockTaskResult({
        taskId: mockTask.id,
        success: true,
        data: { results: ['result1', 'result2'] }
      });

      mockSearchExecutor.execute.mockResolvedValue(mockResult);

      const result = await taskExecutor.executeTask(mockTask, mockContext);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe(mockTask.id);
      expect(result.result).toEqual(mockResult);
      expect(result.executor).toBe('SearchExecutor');
      expect(mockSearchExecutor.execute).toHaveBeenCalledWith(mockTask, mockContext);
    });

    it('should handle task execution failure', async () => {
      const mockResult = MockFactory.createMockTaskResult({
        taskId: mockTask.id,
        success: false,
        error: 'Execution failed'
      });

      mockSearchExecutor.execute.mockResolvedValue(mockResult);

      const result = await taskExecutor.executeTask(mockTask, mockContext);

      expect(result.success).toBe(false);
      expect(result.taskId).toBe(mockTask.id);
      expect(result.result?.error).toBe('Execution failed');
    });

    it('should return error if no executor found', async () => {
      const unsupportedTask = MockFactory.createMockTask({ type: 'unsupported' as any });

      const result = await taskExecutor.executeTask(unsupportedTask, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No executor found');
    });

    it('should handle already running task', async () => {
      const mockResult = MockFactory.createMockTaskResult();
      mockSearchExecutor.execute.mockResolvedValue(mockResult);

      // Start first execution
      const firstExecution = taskExecutor.executeTask(mockTask, mockContext);
      
      // Start second execution immediately
      const secondExecution = taskExecutor.executeTask(mockTask, mockContext);

      const [firstResult, secondResult] = await Promise.all([firstExecution, secondExecution]);

      expect(firstResult.success).toBe(true);
      expect(secondResult.success).toBe(true);
      expect(mockSearchExecutor.execute).toHaveBeenCalledTimes(1); // Should only execute once
    });

    it('should use custom execution options', async () => {
      const mockResult = MockFactory.createMockTaskResult();
      mockSearchExecutor.execute.mockResolvedValue(mockResult);

      const options = {
        timeout: 60000,
        retries: 5,
        priority: 'high' as const
      };

      const result = await taskExecutor.executeTask(mockTask, mockContext, options);

      expect(result.success).toBe(true);
      expect(mockSearchExecutor.execute).toHaveBeenCalledWith(mockTask, mockContext);
    });

    it('should track execution time', async () => {
      const mockResult = MockFactory.createMockTaskResult();
      mockSearchExecutor.execute.mockImplementation(async () => {
        await global.testUtils.sleep(50);
        return mockResult;
      });

      const result = await taskExecutor.executeTask(mockTask, mockContext);

      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.executionTime).toBeWithinTimeRange(40, 200);
    });

    it('should handle executor throwing error', async () => {
      mockSearchExecutor.execute.mockRejectedValue(new Error('Executor error'));

      const result = await taskExecutor.executeTask(mockTask, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Executor error');
    });
  });

  describe('executeGoal', () => {
    const mockGoal = MockFactory.createMockUserGoal();
    const mockContext = {
      userId: 'test-user-id',
      sessionId: 'test-session-id',
      currentUrl: 'https://example.com'
    };

    beforeEach(() => {
      mockClaudeClient.analyzeGoal.mockResolvedValue({
        intent: {
          type: 'search',
          confidence: 0.9,
          parameters: { location: 'Paris' }
        },
        entities: [
          { type: 'location', value: 'Paris', confidence: 0.95 }
        ],
        actionPlan: [
          { step: 1, action: 'search', description: 'Search for hotels', url: 'https://booking.com' },
          { step: 2, action: 'extract', description: 'Extract results', selector: '.results' }
        ],
        recommendations: ['Check reviews', 'Compare prices']
      });

      mockClaudeClient.generateResponse.mockResolvedValue(
        'Successfully found hotel options in Paris. Next steps: review the results and make a selection.'
      );
    });

    it('should execute goal successfully', async () => {
      const mockTaskResult = MockFactory.createMockTaskResult({ success: true });
      mockSearchExecutor.execute.mockResolvedValue(mockTaskResult);

      const result = await taskExecutor.executeGoal(mockGoal, mockContext);

      expect(result.success).toBe(true);
      expect(result.goalId).toBe(mockGoal.id);
      expect(result.tasks).toHaveLength(2);
      expect(result.summary).toContain('Successfully found hotel options');
      expect(mockClaudeClient.analyzeGoal).toHaveBeenCalledWith(
        mockGoal,
        expect.objectContaining({
          currentPage: expect.objectContaining({
            url: 'https://example.com'
          })
        }),
        expect.objectContaining({
          includeSteps: true,
          includeRecommendations: true,
          maxSteps: 5
        })
      );
    });

    it('should handle goal analysis failure', async () => {
      mockClaudeClient.analyzeGoal.mockRejectedValue(new Error('Analysis failed'));

      const result = await taskExecutor.executeGoal(mockGoal, mockContext);

      expect(result.success).toBe(false);
      expect(result.summary).toContain('Analysis failed');
      expect(result.tasks).toHaveLength(0);
    });

    it('should stop execution on critical task failure', async () => {
      const criticalTask = MockFactory.createMockTask({ 
        priority: 'critical',
        type: 'search'
      });
      
      mockSearchExecutor.execute
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({ success: false, error: 'Critical failure' }))
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({ success: true }));

      const result = await taskExecutor.executeGoal(mockGoal, mockContext);

      expect(result.tasks).toHaveLength(1); // Should stop after first critical failure
      expect(result.tasks[0].success).toBe(false);
    });

    it('should continue execution on non-critical task failure', async () => {
      mockSearchExecutor.execute
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({ success: false, error: 'Non-critical failure' }))
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({ success: true }));

      const result = await taskExecutor.executeGoal(mockGoal, mockContext);

      expect(result.tasks).toHaveLength(2); // Should continue after non-critical failure
      expect(result.tasks[0].success).toBe(false);
      expect(result.tasks[1].success).toBe(true);
      expect(result.success).toBe(true); // Overall success if at least one task succeeds
    });

    it('should handle task creation from action plan', async () => {
      const complexActionPlan = [
        { step: 1, action: 'navigate', description: 'Go to booking site', url: 'https://booking.com' },
        { step: 2, action: 'search', description: 'Search for hotels', selector: '#search' },
        { step: 3, action: 'extract', description: 'Extract results', selector: '.results' }
      ];

      mockClaudeClient.analyzeGoal.mockResolvedValue({
        intent: { type: 'booking', confidence: 0.9, parameters: {} },
        entities: [],
        actionPlan: complexActionPlan,
        recommendations: []
      });

      mockSearchExecutor.execute.mockResolvedValue(MockFactory.createMockTaskResult({ success: true }));

      const result = await taskExecutor.executeGoal(mockGoal, mockContext);

      expect(result.tasks).toHaveLength(3);
      expect(result.tasks[0].result?.data?.options?.step).toBe(1);
      expect(result.tasks[1].result?.data?.options?.step).toBe(2);
      expect(result.tasks[2].result?.data?.options?.step).toBe(3);
    });

    it('should generate fallback summary on error', async () => {
      mockClaudeClient.generateResponse.mockRejectedValue(new Error('Summary generation failed'));
      mockSearchExecutor.execute.mockResolvedValue(MockFactory.createMockTaskResult({ success: true }));

      const result = await taskExecutor.executeGoal(mockGoal, mockContext);

      expect(result.summary).toContain('Goal execution completed');
      expect(result.summary).toContain('out of');
      expect(result.summary).toContain('tasks completed successfully');
    });
  });

  describe('executeBatch', () => {
    const mockTasks = [
      MockFactory.createMockTask({ type: 'search', id: 'task-1' }),
      MockFactory.createMockTask({ type: 'search', id: 'task-2' }),
      MockFactory.createMockTask({ type: 'navigate', id: 'task-3' })
    ];
    const mockContext = {
      userId: 'test-user-id',
      sessionId: 'test-session-id'
    };

    it('should execute batch of tasks', async () => {
      const mockBatchResults = [
        MockFactory.createMockTaskResult({ taskId: 'task-1', success: true }),
        MockFactory.createMockTaskResult({ taskId: 'task-2', success: true })
      ];

      mockSearchExecutor.executeBatch.mockResolvedValue(mockBatchResults);

      const results = await taskExecutor.executeBatch(mockTasks.slice(0, 2), mockContext);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(mockSearchExecutor.executeBatch).toHaveBeenCalledWith(
        mockTasks.slice(0, 2),
        mockContext
      );
    });

    it('should handle tasks without executors', async () => {
      const results = await taskExecutor.executeBatch([mockTasks[2]], mockContext); // navigate task

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('No executor found');
    });

    it('should handle batch execution errors', async () => {
      mockSearchExecutor.executeBatch.mockRejectedValue(new Error('Batch execution failed'));

      const results = await taskExecutor.executeBatch(mockTasks.slice(0, 2), mockContext);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(false);
      expect(results[0].error).toBe('Batch execution failed');
    });

    it('should group tasks by executor type', async () => {
      const searchTasks = mockTasks.slice(0, 2);
      const mockBatchResults = searchTasks.map(task => 
        MockFactory.createMockTaskResult({ taskId: task.id, success: true })
      );

      mockSearchExecutor.executeBatch.mockResolvedValue(mockBatchResults);

      const results = await taskExecutor.executeBatch(mockTasks, mockContext);

      expect(mockSearchExecutor.executeBatch).toHaveBeenCalledWith(searchTasks, mockContext);
      expect(results.filter(r => r.success)).toHaveLength(2);
      expect(results.filter(r => !r.success)).toHaveLength(1); // navigate task without executor
    });
  });

  describe('task history and tracking', () => {
    it('should track task history per user', async () => {
      const mockTask = MockFactory.createMockTask({ type: 'search' });
      const mockContext = { userId: 'user1', sessionId: 'session1' };
      const mockResult = MockFactory.createMockTaskResult();

      mockSearchExecutor.execute.mockResolvedValue(mockResult);

      await taskExecutor.executeTask(mockTask, mockContext);

      const history = taskExecutor.getTaskHistory('user1');
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(mockResult);
    });

    it('should limit task history to 100 items per user', async () => {
      const mockContext = { userId: 'user1', sessionId: 'session1' };
      mockSearchExecutor.execute.mockResolvedValue(MockFactory.createMockTaskResult());

      // Execute 105 tasks
      for (let i = 0; i < 105; i++) {
        const task = MockFactory.createMockTask({ type: 'search', id: `task-${i}` });
        await taskExecutor.executeTask(task, mockContext);
      }

      const history = taskExecutor.getTaskHistory('user1');
      expect(history).toHaveLength(100); // Should be limited to 100
    });

    it('should track running tasks', async () => {
      const mockTask = MockFactory.createMockTask({ type: 'search' });
      const mockContext = { userId: 'user1', sessionId: 'session1' };

      // Make execution take some time
      mockSearchExecutor.execute.mockImplementation(async () => {
        await global.testUtils.sleep(100);
        return MockFactory.createMockTaskResult();
      });

      const executionPromise = taskExecutor.executeTask(mockTask, mockContext);
      
      // Check that task is tracked as running
      const runningTasks = taskExecutor.getRunningTasks();
      expect(runningTasks).toContain(mockTask.id);

      await executionPromise;

      // Check that task is no longer running
      const runningTasksAfter = taskExecutor.getRunningTasks();
      expect(runningTasksAfter).not.toContain(mockTask.id);
    });

    it('should cancel running tasks', async () => {
      const mockTask = MockFactory.createMockTask({ type: 'search' });
      const mockContext = { userId: 'user1', sessionId: 'session1' };

      mockSearchExecutor.execute.mockImplementation(async () => {
        await global.testUtils.sleep(200);
        return MockFactory.createMockTaskResult();
      });

      const executionPromise = taskExecutor.executeTask(mockTask, mockContext);
      
      // Cancel the task
      const cancelled = await taskExecutor.cancelTask(mockTask.id);
      expect(cancelled).toBe(true);

      // Task should no longer be running
      const runningTasks = taskExecutor.getRunningTasks();
      expect(runningTasks).not.toContain(mockTask.id);

      // Execution should still complete
      await executionPromise;
    });
  });

  describe('health check', () => {
    it('should perform health check on all executors', async () => {
      const healthResult = await taskExecutor.healthCheck();

      expect(healthResult.healthy).toBe(true);
      expect(healthResult.executors).toHaveLength(1);
      expect(healthResult.executors[0]).toEqual({
        name: 'SearchExecutor',
        type: 'search',
        healthy: true
      });
      expect(mockSearchExecutor.healthCheck).toHaveBeenCalled();
    });

    it('should report unhealthy if any executor is unhealthy', async () => {
      mockSearchExecutor.healthCheck.mockResolvedValue(false);

      const healthResult = await taskExecutor.healthCheck();

      expect(healthResult.healthy).toBe(false);
      expect(healthResult.executors[0].healthy).toBe(false);
    });
  });

  describe('utility methods', () => {
    it('should return available executors', () => {
      const executors = taskExecutor.getAvailableExecutors();
      expect(executors).toContain('search');
    });

    it('should handle task type mapping correctly', async () => {
      const mockGoal = MockFactory.createMockUserGoal();
      const mockContext = { userId: 'user1', sessionId: 'session1' };

      mockClaudeClient.analyzeGoal.mockResolvedValue({
        intent: { type: 'search', confidence: 0.9, parameters: {} },
        entities: [],
        actionPlan: [
          { action: 'navigate', description: 'Navigate to site' },
          { action: 'search', description: 'Search for items' },
          { action: 'extract', description: 'Extract data' },
          { action: 'unknown', description: 'Unknown action' }
        ],
        recommendations: []
      });

      mockSearchExecutor.execute.mockResolvedValue(MockFactory.createMockTaskResult());

      const result = await taskExecutor.executeGoal(mockGoal, mockContext);

      expect(result.tasks).toHaveLength(4);
      // Tasks should be mapped to appropriate types
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', async () => {
      const mockTask = MockFactory.createMockTask({ type: 'search' });
      const mockContext = { userId: 'user1', sessionId: 'session1' };
      
      mockSearchExecutor.execute.mockImplementation(async () => {
        await global.testUtils.sleep(100);
        return MockFactory.createMockTaskResult();
      });

      // Start a task
      const executionPromise = taskExecutor.executeTask(mockTask, mockContext);
      
      // Cleanup
      await taskExecutor.cleanup();

      // Should have cancelled running tasks
      const runningTasks = taskExecutor.getRunningTasks();
      expect(runningTasks).toHaveLength(0);

      // History should be cleared
      const history = taskExecutor.getTaskHistory('user1');
      expect(history).toHaveLength(0);

      await executionPromise;
    });
  });

  describe('error handling', () => {
    it('should handle executor not found gracefully', async () => {
      const unsupportedTask = MockFactory.createMockTask({ type: 'unsupported_type' as any });
      const mockContext = { userId: 'user1', sessionId: 'session1' };

      const result = await taskExecutor.executeTask(unsupportedTask, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No executor found for task type: unsupported_type');
    });

    it('should handle executor canHandle returning false', async () => {
      const mockTask = MockFactory.createMockTask({ type: 'search' });
      const mockContext = { userId: 'user1', sessionId: 'session1' };

      mockSearchExecutor.canHandle.mockReturnValue(false);

      const result = await taskExecutor.executeTask(mockTask, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No executor found');
    });
  });
});