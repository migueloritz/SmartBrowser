import { v4 as uuidv4 } from 'uuid';
import { 
  Task, 
  TaskResult, 
  TaskStatus, 
  UserGoal,
  SmartBrowserError 
} from '@/types';
import logger from '@/core/utils/logger';

export interface ExecutionContext {
  userId: string;
  sessionId: string;
  goal?: UserGoal;
  currentUrl?: string;
  browserContext?: any;
}

export interface ExecutorConfig {
  timeout: number;
  retries: number;
  concurrency: number;
}

export abstract class BaseExecutor {
  protected readonly name: string;
  protected readonly config: ExecutorConfig;

  constructor(name: string, config: Partial<ExecutorConfig> = {}) {
    this.name = name;
    this.config = {
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      concurrency: config.concurrency || 1
    };
  }

  public abstract canHandle(task: Task): boolean;
  protected abstract executeImpl(task: Task, context: ExecutionContext): Promise<any>;

  public async execute(task: Task, context: ExecutionContext): Promise<TaskResult> {
    const startTime = Date.now();
    const executionId = uuidv4();

    logger.info('Starting task execution', {
      executionId,
      taskId: task.id,
      taskType: task.type,
      executor: this.name,
      userId: context.userId
    });

    try {
      // Validate task
      this.validateTask(task);

      // Check if this executor can handle the task
      if (!this.canHandle(task)) {
        throw new SmartBrowserError(
          `Executor ${this.name} cannot handle task type ${task.type}`,
          'EXECUTOR_MISMATCH',
          400
        );
      }

      // Execute with timeout
      const result = await this.executeWithTimeout(task, context);

      const executionTime = Date.now() - startTime;

      logger.info('Task execution completed successfully', {
        executionId,
        taskId: task.id,
        executor: this.name,
        executionTime,
        resultType: typeof result
      });

      return {
        taskId: task.id,
        success: true,
        data: result,
        metadata: {
          executor: this.name,
          executionId,
          startTime: new Date(startTime),
          endTime: new Date()
        },
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error('Task execution failed', {
        executionId,
        taskId: task.id,
        executor: this.name,
        executionTime,
        error: error.message,
        stack: error.stack
      });

      return {
        taskId: task.id,
        success: false,
        error: error.message,
        metadata: {
          executor: this.name,
          executionId,
          startTime: new Date(startTime),
          endTime: new Date(),
          errorType: error.constructor.name
        },
        executionTime
      };
    }
  }

  public async executeBatch(
    tasks: Task[], 
    context: ExecutionContext
  ): Promise<TaskResult[]> {
    logger.info('Starting batch execution', {
      executor: this.name,
      taskCount: tasks.length,
      userId: context.userId
    });

    // Filter tasks this executor can handle
    const compatibleTasks = tasks.filter(task => this.canHandle(task));
    
    if (compatibleTasks.length === 0) {
      logger.warn('No compatible tasks found for batch execution', {
        executor: this.name,
        totalTasks: tasks.length
      });
      return [];
    }

    // Execute in batches based on concurrency limit
    const results: TaskResult[] = [];
    const batchSize = this.config.concurrency;

    for (let i = 0; i < compatibleTasks.length; i += batchSize) {
      const batch = compatibleTasks.slice(i, i + batchSize);
      
      const batchPromises = batch.map(task => 
        this.execute(task, context)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Create error result for failed promise
          results.push({
            taskId: batch[index]!.id,
            success: false,
            error: result.reason?.message || 'Unknown error',
            metadata: {
              executor: this.name,
              batchIndex: i + index
            },
            executionTime: 0
          });
        }
      });
    }

    logger.info('Batch execution completed', {
      executor: this.name,
      totalTasks: compatibleTasks.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });

    return results;
  }

  protected validateTask(task: Task): void {
    if (!task.id) {
      throw new SmartBrowserError('Task ID is required', 'VALIDATION_ERROR', 400);
    }

    if (!task.type) {
      throw new SmartBrowserError('Task type is required', 'VALIDATION_ERROR', 400);
    }

    if (!task.userId) {
      throw new SmartBrowserError('User ID is required', 'VALIDATION_ERROR', 400);
    }

    if (task.status === 'cancelled') {
      throw new SmartBrowserError('Task is cancelled', 'TASK_CANCELLED', 400);
    }
  }

  protected async executeWithTimeout(
    task: Task, 
    context: ExecutionContext
  ): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new SmartBrowserError(
          `Task execution timed out after ${this.config.timeout}ms`,
          'EXECUTION_TIMEOUT',
          408
        ));
      }, this.config.timeout);

      try {
        const result = await this.executeImpl(task, context);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  protected async retry<T>(
    operation: () => Promise<T>,
    taskId: string,
    maxRetries: number = this.config.retries
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        logger.warn('Operation failed, retrying', {
          taskId,
          executor: this.name,
          attempt,
          maxRetries,
          error: error.message
        });

        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await this.sleep(delay);
      }
    }

    throw new SmartBrowserError(
      `Operation failed after ${maxRetries} attempts: ${lastError!.message}`,
      'MAX_RETRIES_EXCEEDED',
      500
    );
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected logProgress(
    taskId: string, 
    step: string, 
    progress: number,
    metadata?: any
  ): void {
    logger.debug('Task progress update', {
      taskId,
      executor: this.name,
      step,
      progress: `${Math.round(progress * 100)}%`,
      ...metadata
    });
  }

  public getName(): string {
    return this.name;
  }

  public getConfig(): ExecutorConfig {
    return { ...this.config };
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // Override in subclasses for specific health checks
      return true;
    } catch (error) {
      logger.error('Executor health check failed', {
        executor: this.name,
        error: error.message
      });
      return false;
    }
  }

  public getStats(): {
    name: string;
    config: ExecutorConfig;
    isHealthy: boolean;
  } {
    return {
      name: this.name,
      config: this.config,
      isHealthy: true // This could be enhanced with real health status
    };
  }
}

export default BaseExecutor;