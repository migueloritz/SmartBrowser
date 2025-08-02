import { jest } from '@jest/globals';
import { TaskExecutor } from '../../src/core/tasks/task-executor';
import { ClaudeClient } from '../../src/core/ai/claude-client';
import { ArticleExtractor } from '../../src/core/content/extractors/article-extractor';
import { PlaywrightManager } from '../../src/core/browser/playwright-manager';
import MockFactory from '../helpers/mock-factory';

// Mock external dependencies for performance testing
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(MockFactory.createMockPlaywrightBrowser())
  }
}));

jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => MockFactory.createMockClaudeClient())
}));

const mockSearchExecutor = {
  getName: jest.fn().mockReturnValue('SearchExecutor'),
  canHandle: jest.fn().mockReturnValue(true),
  execute: jest.fn(),
  executeBatch: jest.fn(),
  healthCheck: jest.fn().mockResolvedValue(true),
  getConfig: jest.fn().mockReturnValue({})
};

jest.mock('../../src/core/tasks/executors/search-executor', () => ({
  searchExecutor: mockSearchExecutor
}));

jest.mock('../../src/core/utils/config', () => ({
  default: {
    get: jest.fn().mockReturnValue({
      claudeApiKey: 'test-api-key',
      claudeModel: 'claude-3-sonnet-20240229',
      browserMaxContexts: 10,
      browserTimeout: 30000,
      browserHeadless: true
    })
  }
}));

jest.mock('../../src/core/utils/logger', () => ({
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('../../src/core/utils/validator', () => ({
  default: {
    validateClaudeResponse: jest.fn().mockReturnValue(true)
  }
}));

describe('Performance Tests', () => {
  describe('Browser Automation Performance', () => {
    let playwrightManager: PlaywrightManager;

    beforeEach(async () => {
      playwrightManager = new PlaywrightManager();
      await playwrightManager.initialize();
    });

    afterEach(async () => {
      await playwrightManager.cleanup();
    });

    it('should create contexts within performance threshold', async () => {
      const contextCount = 10;
      const startTime = Date.now();

      const contextPromises = Array.from({ length: contextCount }, (_, i) =>
        playwrightManager.createContext(`user-${i}`, `session-${i}`)
      );

      const contextIds = await Promise.all(contextPromises);
      const executionTime = Date.now() - startTime;

      expect(contextIds).toHaveLength(contextCount);
      expect(executionTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(executionTime / contextCount).toBeLessThan(200); // Average < 200ms per context

      const stats = playwrightManager.getStats();
      expect(stats.contextsCount).toBeLessThanOrEqual(10); // Respecting max contexts limit
    });

    it('should handle concurrent page operations efficiently', async () => {
      const contextId = await playwrightManager.createContext('test-user', 'test-session');
      const pageCount = 5;
      
      const startTime = Date.now();

      // Create pages concurrently
      const pagePromises = Array.from({ length: pageCount }, () =>
        playwrightManager.createPage(contextId)
      );

      const pageIds = await Promise.all(pagePromises);
      
      // Navigate all pages concurrently
      const navigationPromises = pageIds.map(pageId =>
        playwrightManager.navigateToUrl(pageId, `https://example.com/page-${pageId}`)
      );

      await Promise.all(navigationPromises);
      const executionTime = Date.now() - startTime;

      expect(pageIds).toHaveLength(pageCount);
      expect(executionTime).toBeLessThan(3000); // Should complete within 3 seconds
      expect(executionTime / pageCount).toBeLessThan(600); // Average < 600ms per page
    });

    it('should manage memory usage within limits', async () => {
      const initialStats = playwrightManager.getStats();
      const contextIds: string[] = [];

      // Create many contexts to test memory management
      for (let i = 0; i < 15; i++) {
        const contextId = await playwrightManager.createContext(`user-${i}`, `session-${i}`);
        contextIds.push(contextId);
        
        // Add some pages to increase memory usage
        const pageId = await playwrightManager.createPage(contextId);
        await playwrightManager.navigateToUrl(pageId, `https://example.com/test-${i}`);
      }

      const finalStats = playwrightManager.getStats();
      
      // Should not exceed maximum contexts due to cleanup
      expect(finalStats.contextsCount).toBeLessThanOrEqual(10);
      expect(finalStats.browserActive).toBe(true);

      // Memory should be managed (contexts cleaned up)
      expect(finalStats.contextsCount).toBeLessThan(15);
    });
  });

  describe('Content Extraction Performance', () => {
    let articleExtractor: ArticleExtractor;

    beforeEach(() => {
      articleExtractor = new ArticleExtractor();
    });

    it('should extract content from large articles efficiently', async () => {
      // Generate large article content
      const largeContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Large Article Performance Test</title>
        </head>
        <body>
          <article>
            <h1>Performance Test Article</h1>
            ${Array.from({ length: 100 }, (_, i) => 
              `<p>This is paragraph ${i + 1} with substantial content to test extraction performance. ` +
              `It contains meaningful text that should be processed efficiently by the article extractor. ` +
              `The paragraph includes various elements and content to simulate real-world articles.</p>`
            ).join('\n')}
          </article>
        </body>
        </html>
      `;

      const startTime = Date.now();
      const result = await articleExtractor.extract(largeContent, 'https://example.com/large-article');
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.content?.text.length).toBeGreaterThan(10000);
      expect(executionTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle concurrent extractions efficiently', async () => {
      const extractionCount = 10;
      const htmlSamples = Array.from({ length: extractionCount }, (_, i) => `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Article ${i + 1}</title>
        </head>
        <body>
          <article>
            <h1>Test Article ${i + 1}</h1>
            <p>This is the content for article ${i + 1} with sufficient text for extraction.</p>
            <p>Additional paragraph to ensure minimum content requirements are met.</p>
            <p>Third paragraph with more content to test extraction capabilities.</p>
          </article>
        </body>
        </html>
      `);

      const startTime = Date.now();

      const extractionPromises = htmlSamples.map((html, index) =>
        articleExtractor.extract(html, `https://example.com/article-${index}`)
      );

      const results = await Promise.all(extractionPromises);
      const executionTime = Date.now() - startTime;

      expect(results).toHaveLength(extractionCount);
      expect(results.every(r => r.success)).toBe(true);
      expect(executionTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(executionTime / extractionCount).toBeLessThan(200); // Average < 200ms per extraction
    });

    it('should maintain performance with complex DOM structures', async () => {
      // Generate complex nested HTML structure
      const complexHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Complex DOM Structure Test</title>
        </head>
        <body>
          <article>
            <h1>Complex Article</h1>
            ${Array.from({ length: 50 }, (_, i) => `
              <div class="section-${i}">
                <h2>Section ${i + 1}</h2>
                <div class="content">
                  <p>Content paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
                  <ul>
                    <li>List item 1 with <a href="#">link</a></li>
                    <li>List item 2 with nested <span>spans</span></li>
                  </ul>
                  <blockquote>
                    <p>Quote with nested <code>code elements</code> and formatting.</p>
                  </blockquote>
                </div>
              </div>
            `).join('\n')}
          </article>
        </body>
        </html>
      `;

      const startTime = Date.now();
      const result = await articleExtractor.extract(complexHtml, 'https://example.com/complex');
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.content?.text.length).toBeGreaterThan(5000);
      expect(executionTime).toBeLessThan(1500); // Should handle complexity within 1.5 seconds
    });
  });

  describe('Claude API Performance', () => {
    let claudeClient: ClaudeClient;

    beforeEach(() => {
      claudeClient = new ClaudeClient();
    });

    it('should process content summarization within time limits', async () => {
      const mockContent = MockFactory.createMockPageContent({
        text: 'Large content text that needs to be summarized. '.repeat(500)
      });

      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockImplementation(async () => {
        // Simulate realistic API response time
        await global.testUtils.sleep(300);
        return MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: JSON.stringify({
              summary: 'Processed summary of the large content',
              keyPoints: ['Point 1', 'Point 2'],
              entities: [],
              sentiment: 'neutral',
              relevanceScore: 0.8
            })
          }]
        });
      });

      const startTime = Date.now();
      const result = await claudeClient.summarizeContent(mockContent);
      const executionTime = Date.now() - startTime;

      expect(result.summary).toBeDefined();
      expect(executionTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should handle concurrent API requests efficiently', async () => {
      const requestCount = 5;
      const mockContents = Array.from({ length: requestCount }, (_, i) =>
        MockFactory.createMockPageContent({
          title: `Article ${i + 1}`,
          text: `Content for article ${i + 1} that needs summarization.`
        })
      );

      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockImplementation(async () => {
        await global.testUtils.sleep(200); // Simulate API latency
        return MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: JSON.stringify({
              summary: 'Concurrent summarization result',
              keyPoints: [],
              entities: [],
              sentiment: 'neutral',
              relevanceScore: 0.7
            })
          }]
        });
      });

      const startTime = Date.now();

      const summaryPromises = mockContents.map(content =>
        claudeClient.summarizeContent(content)
      );

      const results = await Promise.all(summaryPromises);
      const executionTime = Date.now() - startTime;

      expect(results).toHaveLength(requestCount);
      expect(results.every(r => r.summary)).toBe(true);
      expect(executionTime).toBeLessThan(1000); // Concurrent requests should be faster
    });

    it('should maintain performance with large context', async () => {
      const largeContext = {
        currentPage: MockFactory.createMockPageContent({
          text: 'Very large page content. '.repeat(1000)
        }),
        recentPages: Array.from({ length: 10 }, (_, i) =>
          MockFactory.createMockPageContent({
            title: `Recent Page ${i + 1}`,
            text: `Content for recent page ${i + 1}. `.repeat(100)
          })
        ),
        userHistory: Array.from({ length: 50 }, (_, i) => `Action ${i + 1}`)
      };

      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockImplementation(async () => {
        await global.testUtils.sleep(400); // Simulate processing time for large context
        return MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: 'Response with large context processed efficiently'
          }]
        });
      });

      const startTime = Date.now();
      const result = await claudeClient.generateResponse('Summarize the current context', largeContext);
      const executionTime = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(executionTime).toBeLessThan(3000); // Should handle large context within 3 seconds
    });
  });

  describe('Task Execution Performance', () => {
    let taskExecutor: TaskExecutor;

    beforeEach(() => {
      taskExecutor = new TaskExecutor();
    });

    afterEach(async () => {
      await taskExecutor.cleanup();
    });

    it('should execute single tasks efficiently', async () => {
      const task = MockFactory.createMockTask({ type: 'search' });
      const context = {
        userId: 'perf-user',
        sessionId: 'perf-session'
      };

      mockSearchExecutor.execute.mockImplementation(async () => {
        await global.testUtils.sleep(100); // Simulate task execution
        return MockFactory.createMockTaskResult({ success: true });
      });

      const startTime = Date.now();
      const result = await taskExecutor.executeTask(task, context);
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(500); // Should complete within 500ms
      expect(result.executionTime).toBeWithinTimeRange(90, 200);
    });

    it('should handle batch execution efficiently', async () => {
      const batchSize = 10;
      const tasks = Array.from({ length: batchSize }, (_, i) =>
        MockFactory.createMockTask({ 
          type: 'search',
          id: `batch-task-${i}` 
        })
      );

      const context = {
        userId: 'batch-user',
        sessionId: 'batch-session'
      };

      mockSearchExecutor.executeBatch.mockImplementation(async (tasksToExecute) => {
        await global.testUtils.sleep(200); // Simulate batch processing
        return tasksToExecute.map(task => 
          MockFactory.createMockTaskResult({ 
            taskId: task.id,
            success: true 
          })
        );
      });

      const startTime = Date.now();
      const results = await taskExecutor.executeBatch(tasks, context);
      const executionTime = Date.now() - startTime;

      expect(results).toHaveLength(batchSize);
      expect(results.every(r => r.success)).toBe(true);
      expect(executionTime).toBeLessThan(1000); // Batch should be faster than individual execution
    });

    it('should execute goals with multiple tasks efficiently', async () => {
      const goal = MockFactory.createMockUserGoal({
        text: 'complex goal with multiple steps'
      });

      const context = {
        userId: 'goal-user',
        sessionId: 'goal-session'
      };

      // Mock Claude analysis
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create
        .mockResolvedValueOnce(
          MockFactory.createMockClaudeResponse({
            content: [{
              type: 'text',
              text: JSON.stringify({
                intent: { type: 'search', confidence: 0.9, parameters: {} },
                entities: [],
                actionPlan: Array.from({ length: 5 }, (_, i) => ({
                  step: i + 1,
                  action: 'search',
                  description: `Step ${i + 1} description`
                })),
                recommendations: []
              })
            }]
          })
        )
        .mockResolvedValueOnce(
          MockFactory.createMockClaudeResponse({
            content: [{
              type: 'text',
              text: 'Goal execution completed successfully with all steps'
            }]
          })
        );

      mockSearchExecutor.execute.mockImplementation(async () => {
        await global.testUtils.sleep(50); // Quick task execution
        return MockFactory.createMockTaskResult({ success: true });
      });

      const startTime = Date.now();
      const result = await taskExecutor.executeGoal(goal, context);
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(5);
      expect(executionTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should maintain performance under concurrent load', async () => {
      const concurrentGoals = 5;
      const goals = Array.from({ length: concurrentGoals }, (_, i) =>
        MockFactory.createMockUserGoal({
          text: `concurrent goal ${i + 1}`,
          id: `goal-${i}`
        })
      );

      const contexts = goals.map((_, index) => ({
        userId: `user-${index}`,
        sessionId: `session-${index}`
      }));

      // Setup mocks
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockResolvedValue(
        MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: JSON.stringify({
              intent: { type: 'search', confidence: 0.8, parameters: {} },
              entities: [],
              actionPlan: [
                { step: 1, action: 'search', description: 'Quick search' }
              ],
              recommendations: []
            })
          }]
        })
      );

      mockSearchExecutor.execute.mockImplementation(async () => {
        await global.testUtils.sleep(100);
        return MockFactory.createMockTaskResult({ success: true });
      });

      const startTime = Date.now();

      const goalPromises = goals.map((goal, index) =>
        taskExecutor.executeGoal(goal, contexts[index])
      );

      const results = await Promise.all(goalPromises);
      const executionTime = Date.now() - startTime;

      expect(results).toHaveLength(concurrentGoals);
      expect(results.every(r => r.success)).toBe(true);
      expect(executionTime).toBeLessThan(3000); // Concurrent execution should be efficient
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not leak memory during extended operations', async () => {
      const playwrightManager = new PlaywrightManager();
      await playwrightManager.initialize();

      const initialStats = playwrightManager.getStats();
      
      // Perform many operations that could potentially leak memory
      for (let i = 0; i < 20; i++) {
        const contextId = await playwrightManager.createContext(`user-${i}`, `session-${i}`);
        const pageId = await playwrightManager.createPage(contextId);
        await playwrightManager.navigateToUrl(pageId, `https://example.com/page-${i}`);
        
        // Close some contexts to test cleanup
        if (i % 3 === 0) {
          await playwrightManager.closeContext(contextId);
        }
      }

      const finalStats = playwrightManager.getStats();
      
      // Should have managed memory properly
      expect(finalStats.contextsCount).toBeLessThan(20); // Some should be cleaned up
      expect(finalStats.contextsCount).toBeGreaterThan(0); // But some should remain
      
      await playwrightManager.cleanup();
      
      const cleanupStats = playwrightManager.getStats();
      expect(cleanupStats.contextsCount).toBe(0);
      expect(cleanupStats.pagesCount).toBe(0);
    });

    it('should handle task history efficiently', async () => {
      const taskExecutor = new TaskExecutor();
      const userId = 'history-test-user';
      
      // Simulate many task executions
      mockSearchExecutor.execute.mockResolvedValue(
        MockFactory.createMockTaskResult({ success: true })
      );

      for (let i = 0; i < 150; i++) {
        const task = MockFactory.createMockTask({ 
          type: 'search',
          id: `history-task-${i}` 
        });
        
        await taskExecutor.executeTask(task, {
          userId,
          sessionId: `session-${i}`
        });
      }

      const history = taskExecutor.getTaskHistory(userId);
      
      // Should limit history to prevent memory issues
      expect(history.length).toBeLessThanOrEqual(100);
      
      await taskExecutor.cleanup();
    });
  });

  describe('Stress Tests', () => {
    it('should handle high-frequency requests', async () => {
      const requestCount = 50;
      const claudeClient = new ClaudeClient();
      
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockImplementation(async () => {
        await global.testUtils.sleep(50); // Fast response simulation
        return MockFactory.createMockClaudeResponse();
      });

      const startTime = Date.now();
      
      const requests = Array.from({ length: requestCount }, (_, i) =>
        claudeClient.generateResponse(`Request ${i + 1}`)
      );

      const results = await Promise.all(requests);
      const executionTime = Date.now() - startTime;

      expect(results).toHaveLength(requestCount);
      expect(results.every(r => typeof r === 'string')).toBe(true);
      expect(executionTime).toBeLessThan(5000); // Should handle high frequency within 5 seconds
    });

    it('should maintain stability under resource pressure', async () => {
      const playwrightManager = new PlaywrightManager();
      const taskExecutor = new TaskExecutor();
      
      await playwrightManager.initialize();

      try {
        // Create resource pressure
        const operations = [];
        
        // Browser operations
        for (let i = 0; i < 10; i++) {
          operations.push(async () => {
            const contextId = await playwrightManager.createContext(`stress-user-${i}`, `stress-session-${i}`);
            const pageId = await playwrightManager.createPage(contextId);
            await playwrightManager.navigateToUrl(pageId, `https://example.com/stress-${i}`);
            return contextId;
          });
        }

        // Task operations
        mockSearchExecutor.execute.mockResolvedValue(
          MockFactory.createMockTaskResult({ success: true })
        );

        for (let i = 0; i < 20; i++) {
          operations.push(async () => {
            const task = MockFactory.createMockTask({ type: 'search' });
            return taskExecutor.executeTask(task, {
              userId: `stress-user-${i}`,
              sessionId: `stress-session-${i}`
            });
          });
        }

        const startTime = Date.now();
        const results = await Promise.allSettled(operations.map(op => op()));
        const executionTime = Date.now() - startTime;

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        // Should handle most operations successfully even under pressure
        expect(successful).toBeGreaterThan(failed);
        expect(successful / results.length).toBeGreaterThan(0.8); // At least 80% success rate
        expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds

      } finally {
        await taskExecutor.cleanup();
        await playwrightManager.cleanup();
      }
    });
  });
});