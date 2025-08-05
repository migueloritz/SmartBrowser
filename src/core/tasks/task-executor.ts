import { v4 as uuidv4 } from 'uuid';
import { 
  Task, 
  TaskResult, 
  TaskType, 
  TaskStatus, 
  UserGoal,
  SmartBrowserError 
} from '@/types';
import { BaseExecutor, ExecutionContext } from './executors/base-executor';
import { searchExecutor } from './executors/search-executor';
import { claudeClient } from '@/core/ai/claude-client';
import logger from '@/core/utils/logger';

export interface TaskExecutionOptions {
  timeout?: number;
  retries?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  result?: TaskResult;
  error?: string;
  executionTime: number;
  executor?: string;
}

class TaskExecutor {
  private executors: Map<TaskType, BaseExecutor> = new Map();
  private runningTasks: Map<string, Promise<TaskResult>> = new Map();
  private taskHistory: Map<string, TaskResult[]> = new Map();

  constructor() {
    this.registerExecutors();
    logger.info('Task executor initialized', { 
      executorCount: this.executors.size 
    });
  }

  private registerExecutors(): void {
    // Register all available executors
    this.executors.set('search', searchExecutor);
    
    // TODO: Add more executors as they are implemented
    // this.executors.set('navigate', navigationExecutor);
    // this.executors.set('extract_content', contentExtractor);
    // this.executors.set('summarize', summarizeExecutor);
    // this.executors.set('book_hotel', hotelBookingExecutor);
    // this.executors.set('find_product', productSearchExecutor);

    logger.info('Executors registered', { 
      types: Array.from(this.executors.keys()) 
    });
  }

  public async executeTask(
    task: Task,
    context: ExecutionContext,
    options: TaskExecutionOptions = {}
  ): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    
    logger.info('Task execution requested', {
      taskId: task.id,
      taskType: task.type,
      userId: context.userId,
      priority: task.priority
    });

    try {
      // Check if task is already running
      if (this.runningTasks.has(task.id)) {
        logger.warn('Task already running', { taskId: task.id });
        const existingResult = await this.runningTasks.get(task.id)!;
        return {
          taskId: task.id,
          success: existingResult.success,
          result: existingResult,
          executionTime: Date.now() - startTime
        };
      }

      // Find appropriate executor
      const executor = this.findExecutor(task);
      if (!executor) {
        throw new SmartBrowserError(
          `No executor found for task type: ${task.type}`,
          'NO_EXECUTOR_FOUND',
          400
        );
      }

      // Create execution promise
      const executionPromise = this.executeWithExecutor(
        task, 
        context, 
        executor, 
        options
      );

      // Track running task
      this.runningTasks.set(task.id, executionPromise);

      // Execute task
      const result = await executionPromise;

      // Store in history
      this.addToHistory(context.userId, result);

      const executionTime = Date.now() - startTime;

      logger.info('Task execution completed', {
        taskId: task.id,
        success: result.success,
        executor: executor.getName(),
        executionTime
      });

      return {
        taskId: task.id,
        success: result.success,
        result,
        executionTime,
        executor: executor.getName()
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logger.error('Task execution failed', {
        taskId: task.id,
        error: error.message,
        executionTime
      });

      return {
        taskId: task.id,
        success: false,
        error: error.message,
        executionTime
      };
    } finally {
      // Clean up running task tracking
      this.runningTasks.delete(task.id);
    }
  }

  public async executeGoal(
    goal: UserGoal,
    context: ExecutionContext,
    options: TaskExecutionOptions = {}
  ): Promise<{
    goalId: string;
    success: boolean;
    tasks: TaskExecutionResult[];
    summary: string;
    executionTime: number;
  }> {
    const startTime = Date.now();
    
    logger.info('Goal execution started', {
      goalId: goal.id,
      goalText: goal.text,
      userId: context.userId
    });

    try {
      // Analyze goal and create action plan
      const analysis = await claudeClient.analyzeGoal(goal, {
        currentPage: context.currentUrl ? {
          url: context.currentUrl,
          title: '',
          text: '',
          html: '',
          metadata: {},
          extractedAt: new Date(),
          extractorUsed: 'context'
        } : undefined
      }, {
        includeSteps: true,
        includeRecommendations: true,
        maxSteps: 5
      });

      logger.info('Goal analysis completed', {
        goalId: goal.id,
        intent: analysis.intent.type,
        stepsCount: analysis.actionPlan.length
      });

      // Convert action plan to tasks
      const tasks = this.createTasksFromActionPlan(
        goal,
        analysis.actionPlan,
        context
      );

      logger.info('Tasks created from goal', {
        goalId: goal.id,
        taskCount: tasks.length
      });

      // Execute tasks sequentially (for now)
      const taskResults: TaskExecutionResult[] = [];
      
      for (const task of tasks) {
        try {
          const result = await this.executeTask(task, context, options);
          taskResults.push(result);
          
          // If a critical task fails, stop execution
          if (!result.success && task.priority === 'critical') {
            logger.warn('Critical task failed, stopping goal execution', {
              goalId: goal.id,
              taskId: task.id
            });
            break;
          }
        } catch (error) {
          logger.error('Task failed during goal execution', {
            goalId: goal.id,
            taskId: task.id,
            error: error.message
          });
          
          taskResults.push({
            taskId: task.id,
            success: false,
            error: error.message,
            executionTime: 0
          });
        }
      }

      // Generate summary
      const summary = await this.generateGoalSummary(
        goal,
        taskResults,
        analysis.recommendations
      );

      const executionTime = Date.now() - startTime;
      const successfulTasks = taskResults.filter(r => r.success).length;

      logger.info('Goal execution completed', {
        goalId: goal.id,
        totalTasks: taskResults.length,
        successfulTasks,
        executionTime
      });

      return {
        goalId: goal.id,
        success: successfulTasks > 0,
        tasks: taskResults,
        summary,
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logger.error('Goal execution failed', {
        goalId: goal.id,
        error: error.message,
        executionTime
      });

      return {
        goalId: goal.id,
        success: false,
        tasks: [],
        summary: `Goal execution failed: ${error.message}`,
        executionTime
      };
    }
  }

  public async executeBatch(
    tasks: Task[],
    context: ExecutionContext,
    options: TaskExecutionOptions = {}
  ): Promise<TaskExecutionResult[]> {
    logger.info('Batch execution started', {
      taskCount: tasks.length,
      userId: context.userId
    });

    const results: TaskExecutionResult[] = [];
    
    // Group tasks by executor type for efficient batch processing
    const tasksByExecutor = new Map<BaseExecutor, Task[]>();
    
    for (const task of tasks) {
      const executor = this.findExecutor(task);
      if (executor) {
        if (!tasksByExecutor.has(executor)) {
          tasksByExecutor.set(executor, []);
        }
        tasksByExecutor.get(executor)!.push(task);
      } else {
        results.push({
          taskId: task.id,
          success: false,
          error: `No executor found for task type: ${task.type}`,
          executionTime: 0
        });
      }
    }

    // Execute batches in parallel
    const batchPromises = Array.from(tasksByExecutor.entries()).map(
      async ([executor, executorTasks]) => {
        try {
          const batchResults = await executor.executeBatch(executorTasks, context);
          return batchResults.map(result => ({
            taskId: result.taskId,
            success: result.success,
            result,
            error: result.error,
            executionTime: result.executionTime,
            executor: executor.getName()
          }));
        } catch (error) {
          logger.error('Batch execution failed for executor', {
            executor: executor.getName(),
            taskCount: executorTasks.length,
            error: error.message
          });
          
          return executorTasks.map(task => ({
            taskId: task.id,
            success: false,
            error: error.message,
            executionTime: 0,
            executor: executor.getName()
          }));
        }
      }
    );

    const batchResults = await Promise.all(batchPromises);
    
    // Flatten results
    for (const batch of batchResults) {
      results.push(...batch);
    }

    logger.info('Batch execution completed', {
      totalTasks: tasks.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });

    return results;
  }

  public getTaskHistory(userId: string): TaskResult[] {
    return this.taskHistory.get(userId) || [];
  }

  public getRunningTasks(): string[] {
    return Array.from(this.runningTasks.keys());
  }

  public async cancelTask(taskId: string): Promise<boolean> {
    if (this.runningTasks.has(taskId)) {
      // In a real implementation, we'd need a way to cancel the promise
      // For now, just remove from tracking
      this.runningTasks.delete(taskId);
      logger.info('Task cancelled', { taskId });
      return true;
    }
    return false;
  }

  public getAvailableExecutors(): string[] {
    return Array.from(this.executors.keys());
  }

  public async healthCheck(): Promise<{
    healthy: boolean;
    executors: Array<{
      name: string;
      type: TaskType;
      healthy: boolean;
    }>;
  }> {
    const executorChecks = Array.from(this.executors.entries()).map(
      async ([type, executor]) => ({
        name: executor.getName(),
        type,
        healthy: await executor.healthCheck()
      })
    );

    const executorResults = await Promise.all(executorChecks);
    const allHealthy = executorResults.every(result => result.healthy);

    return {
      healthy: allHealthy,
      executors: executorResults
    };
  }

  private findExecutor(task: Task): BaseExecutor | null {
    const executor = this.executors.get(task.type);
    if (executor && executor.canHandle(task)) {
      return executor;
    }
    return null;
  }

  private async executeWithExecutor(
    task: Task,
    context: ExecutionContext,
    executor: BaseExecutor,
    options: TaskExecutionOptions
  ): Promise<TaskResult> {
    // Apply options to executor config if needed
    const executorConfig = executor.getConfig();
    
    if (options.timeout) {
      // In a real implementation, we'd create a new executor instance with modified config
    }

    return executor.execute(task, context);
  }

  private createTasksFromActionPlan(
    goal: UserGoal,
    actionPlan: any[],
    context: ExecutionContext
  ): Task[] {
    const tasks: Task[] = [];

    for (const [index, step] of actionPlan.entries()) {
      const task: Task = {
        id: uuidv4(),
        type: this.mapActionToTaskType(step.action),
        userId: context.userId,
        goalId: goal.id,
        payload: {
          url: step.url,
          query: step.description,
          options: {
            step: index + 1,
            totalSteps: actionPlan.length,
            selector: step.selector
          }
        },
        status: 'pending',
        priority: goal.priority,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      tasks.push(task);
    }

    return tasks;
  }

  private mapActionToTaskType(action: string): TaskType {
    const actionMap: Record<string, TaskType> = {
      'navigate': 'navigate',
      'search': 'search',
      'extract': 'extract_content',
      'summarize': 'summarize',
      'click': 'navigate', // For now, map click actions to navigate
      'fill': 'navigate'   // For now, map fill actions to navigate
    };

    return actionMap[action.toLowerCase()] || 'navigate';
  }

  private async generateGoalSummary(
    goal: UserGoal,
    taskResults: TaskExecutionResult[],
    recommendations: string[]
  ): Promise<string> {
    try {
      const successfulTasks = taskResults.filter(r => r.success);
      const failedTasks = taskResults.filter(r => !r.success);

      const contextMessage = `
Goal: ${goal.text}
Total tasks executed: ${taskResults.length}
Successful tasks: ${successfulTasks.length}
Failed tasks: ${failedTasks.length}

Task results summary:
${taskResults.map(r => `- ${r.taskId}: ${r.success ? 'Success' : 'Failed - ' + r.error}`).join('\n')}

Recommendations:
${recommendations.join('\n')}

Please provide a brief summary of what was accomplished and any next steps.`;

      const summary = await claudeClient.generateResponse(
        contextMessage,
        { taskHistory: taskResults.map(r => r.taskId) }
      );

      return summary;
    } catch (error) {
      logger.error('Failed to generate goal summary', error);
      
      const successCount = taskResults.filter(r => r.success).length;
      return `Goal execution completed. ${successCount} out of ${taskResults.length} tasks completed successfully.`;
    }
  }

  private addToHistory(userId: string, result: TaskResult): void {
    if (!this.taskHistory.has(userId)) {
      this.taskHistory.set(userId, []);
    }

    const history = this.taskHistory.get(userId)!;
    history.push(result);

    // Keep only last 100 results per user
    if (history.length > 100) {
      history.shift();
    }
  }

  public async cleanup(): Promise<void> {
    logger.info('Cleaning up task executor');
    
    // Cancel all running tasks
    for (const taskId of this.runningTasks.keys()) {
      await this.cancelTask(taskId);
    }

    // Clear history
    this.taskHistory.clear();
    
    logger.info('Task executor cleanup completed');
  }
}

export { TaskExecutor };
export const taskExecutor = new TaskExecutor();
export default taskExecutor;