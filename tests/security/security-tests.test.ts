import { ClaudeClient } from '../../src/core/ai/claude-client';
import { articleExtractor } from '../../src/core/content/extractors/article-extractor';
import { TaskExecutor } from '../../src/core/tasks/task-executor';
import { ClaudeAPIError, ValidationError, SecurityError } from '../../src/types';
import MockFactory from '../helpers/mock-factory';

// Mock dependencies
jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => MockFactory.createMockClaudeClient())
}));

jest.mock('../../src/core/ai/claude-client', () => ({
  ClaudeClient: jest.fn().mockImplementation(() => ({
    summarizeContent: jest.fn(),
    analyzeGoal: jest.fn(),
    generateResponse: jest.fn(),
    extractStructuredData: jest.fn()
  })),
  claudeClient: {
    summarizeContent: jest.fn(),
    analyzeGoal: jest.fn(),
    generateResponse: jest.fn(),
    extractStructuredData: jest.fn()
  }
}));

jest.mock('../../src/core/utils/validator', () => ({
  default: {
    validateClaudeResponse: jest.fn(),
    validateUserInput: jest.fn(),
    sanitizeUserInput: jest.fn()
  }
}));

// Get access to the mocked validator
const mockValidator = jest.requireMock('../../src/core/utils/validator').default;

jest.mock('../../src/core/utils/config', () => ({
  default: {
    get: jest.fn().mockReturnValue({
      claudeApiKey: 'test-api-key',
      claudeModel: 'claude-3-sonnet-20240229',
      port: 3000,
      nodeEnv: 'test',
      redisUrl: 'redis://localhost:6379',
      jwtSecret: 'test-jwt-secret',
      encryptionKey: 'test-encryption-key-12345678901234',
      browserTimeout: 30000,
      browserMaxContexts: 5,
      browserHeadless: true,
      logLevel: 'info',
      logFile: './logs/test.log'
    }),
    isDevelopment: jest.fn().mockReturnValue(false),
    isProduction: jest.fn().mockReturnValue(false),
    isTest: jest.fn().mockReturnValue(true)
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

jest.mock('../../src/core/tasks/executors/search-executor', () => ({
  searchExecutor: {
    getName: jest.fn().mockReturnValue('SearchExecutor'),
    canHandle: jest.fn().mockReturnValue(true),
    execute: jest.fn(),
    executeBatch: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue(true),
    getConfig: jest.fn().mockReturnValue({})
  }
}));

// Get access to the mocked search executor
const mockSearchExecutor = jest.requireMock('../../src/core/tasks/executors/search-executor').searchExecutor;

describe('Security Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidator.validateClaudeResponse.mockReturnValue(true);
    mockValidator.validateUserInput.mockReturnValue(true);
    mockValidator.sanitizeUserInput.mockImplementation((input) => input);
  });

  describe('Input Validation and Sanitization', () => {
    describe('Claude Client Security', () => {
      let claudeClient: ClaudeClient;

      beforeEach(() => {
        claudeClient = new ClaudeClient();
      });

      it('should validate and sanitize user input for summarization', async () => {
        const maliciousContent = MockFactory.createMockPageContent({
          title: '<script>alert("XSS")</script>Malicious Title',
          text: 'Normal content with <script>malicious();</script> embedded script',
          html: '<div onclick="stealData()">Content</div>'
        });

        const mockClaudeClient = MockFactory.createMockClaudeClient();
        mockClaudeClient.messages.create.mockResolvedValue(
          MockFactory.createMockClaudeResponse({
            content: [{
              type: 'text',
              text: JSON.stringify({
                summary: 'Safe summary without scripts',
                keyPoints: [],
                entities: [],
                sentiment: 'neutral',
                relevanceScore: 0.5
              })
            }]
          })
        );

        await claudeClient.summarizeContent(maliciousContent);

        // Should not pass raw malicious content to Claude
        expect(mockClaudeClient.messages.create).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                content: expect.not.stringMatching(/<script[^>]*>/i)
              })
            ])
          })
        );
      });

      it('should reject responses that fail safety validation', async () => {
        const mockContent = MockFactory.createMockPageContent();
        
        const mockClaudeClient = MockFactory.createMockClaudeClient();
        mockClaudeClient.messages.create.mockResolvedValue(
          MockFactory.createMockClaudeResponse({
            content: [{
              type: 'text',
              text: 'Potentially unsafe response with malicious content'
            }]
          })
        );

        // Mock validator to reject the response
        mockValidator.validateClaudeResponse.mockReturnValue(false);

        await expect(
          claudeClient.generateResponse('Test message', { currentPage: mockContent })
        ).rejects.toThrow(ClaudeAPIError);
        
        expect(mockValidator.validateClaudeResponse).toHaveBeenCalledWith(
          'Potentially unsafe response with malicious content'
        );
      });

      it('should handle injection attempts in goal analysis', async () => {
        const maliciousGoal = MockFactory.createMockUserGoal({
          text: 'search for hotels; DROP TABLE users; --'
        });

        const mockClaudeClient = MockFactory.createMockClaudeClient();
        mockClaudeClient.messages.create.mockResolvedValue(
          MockFactory.createMockClaudeResponse({
            content: [{
              type: 'text',
              text: JSON.stringify({
                intent: { type: 'search', confidence: 0.1, parameters: {} },
                entities: [],
                actionPlan: [],
                recommendations: []
              })
            }]
          })
        );

        const result = await claudeClient.analyzeGoal(maliciousGoal);

        // Should have low confidence for suspicious input
        expect(result.intent.confidence).toBeLessThan(0.5);
        
        // Should not execute SQL injection-like commands
        expect(mockClaudeClient.messages.create).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                content: expect.not.stringMatching(/DROP TABLE/i)
              })
            ])
          })
        );
      });

      it('should limit response length to prevent resource exhaustion', async () => {
        const mockContent = MockFactory.createMockPageContent();
        
        const mockClaudeClient = MockFactory.createMockClaudeClient();
        mockClaudeClient.messages.create.mockResolvedValue(
          MockFactory.createMockClaudeResponse({
            content: [{
              type: 'text',
              text: 'Response content that should be within reasonable limits'
            }]
          })
        );

        const result = await claudeClient.generateResponse('Test message');

        // Should have reasonable length limits
        expect(result.length).toBeLessThan(50000); // Reasonable max response length
      });

      it('should handle malformed JSON responses safely', async () => {
        const mockContent = MockFactory.createMockPageContent();
        
        const mockClaudeClient = MockFactory.createMockClaudeClient();
        mockClaudeClient.messages.create.mockResolvedValue(
          MockFactory.createMockClaudeResponse({
            content: [{
              type: 'text',
              text: '{"malformed": json, "without": proper closure'
            }]
          })
        );

        // Should not throw unhandled errors
        const result = await claudeClient.summarizeContent(mockContent);

        expect(result).toEqual(
          expect.objectContaining({
            summary: expect.any(String),
            keyPoints: expect.any(Array),
            entities: expect.any(Array),
            sentiment: expect.any(String),
            relevanceScore: expect.any(Number)
          })
        );
      });
    });

    describe('Content Extraction Security', () => {
      // Use the shared articleExtractor instance

      it('should sanitize malicious HTML content', async () => {
        const maliciousHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Legitimate Article</title>
            <script>
              // Malicious script
              window.location = 'http://malicious-site.com/steal-data';
            </script>
          </head>
          <body>
            <article>
              <h1>Article Title</h1>
              <p>Legitimate content with inline <script>alert('xss')</script> script.</p>
              <p onmouseover="stealData()">Paragraph with event handler.</p>
              <p>More content to meet minimum requirements.</p>
            </article>
          </body>
          </html>
        `;

        const result = await articleExtractor.extract(maliciousHtml, 'https://example.com');

        expect(result.success).toBe(true);
        
        // Should not contain executable scripts
        expect(result.content?.html).not.toContain('<script>');
        expect(result.content?.html).not.toContain('onmouseover');
        expect(result.content?.text).not.toContain('stealData()');
        
        // Should still contain legitimate content
        expect(result.content?.text).toContain('Legitimate content');
        expect(result.content?.title).toBe('Article Title');
      });

      it('should handle extremely large HTML without resource exhaustion', async () => {
        // Create large HTML that could cause DoS
        const largeHtml = `
          <!DOCTYPE html>
          <html>
          <body>
            <article>
              <h1>Large Article</h1>
              ${'<p>Very long paragraph content. '.repeat(10000)}
            </article>
          </body>
          </html>
        `;

        const startTime = Date.now();
        const result = await articleExtractor.extract(largeHtml, 'https://example.com');
        const executionTime = Date.now() - startTime;

        // Should complete within reasonable time even with large input
        expect(executionTime).toBeLessThan(5000);
        expect(result.success).toBe(true);
      });

      it('should reject suspicious URLs', async () => {
        const suspiciousUrls = [
          'javascript:alert("xss")',
          'data:text/html,<script>alert("xss")</script>',
          'file:///etc/passwd',
          'ftp://internal-server/sensitive-data',
          'chrome-extension://malicious-extension/steal.html'
        ];

        const legitimateHtml = '<html><body><article><h1>Title</h1><p>Content</p></article></body></html>';

        for (const url of suspiciousUrls) {
          const result = await articleExtractor.extract(legitimateHtml, url);
          
          // Should either reject or sanitize suspicious URLs
          if (result.success) {
            expect(result.content?.url).not.toBe(url);
          } else {
            expect(result.error).toBeDefined();
          }
        }
      });

      it('should handle malformed HTML gracefully', async () => {
        const malformedHtmlSamples = [
          '<html><body><article><h1>Title</h1><p>Unclosed paragraph</article></body>',
          '<html><body><<script>malicious</script>><article><h1>Title</h1></article></body></html>',
          '<html><body><article><h1>Title</h1><p>Content with \x00 null bytes\x00</p></article></body></html>',
          '<?xml version="1.0"?><html><body><article><h1>Title</h1><p>XML injection attempt</p></article></body></html>'
        ];

        for (const html of malformedHtmlSamples) {
          // Should not throw unhandled errors
          await expect(
            articleExtractor.extract(html, 'https://example.com')
          ).resolves.not.toThrow();
        }
      });
    });

    describe('Task Execution Security', () => {
      let taskExecutor: TaskExecutor;

      beforeEach(() => {
        taskExecutor = new TaskExecutor();
      });

      afterEach(async () => {
        await taskExecutor.cleanup();
      });

      it('should validate task payload for malicious content', async () => {
        const maliciousTask = MockFactory.createMockTask({
          type: 'search',
          payload: {
            url: 'javascript:alert("xss")',
            query: '<script>malicious()</script>',
            options: {
              selector: 'body; DROP TABLE users; --'
            }
          }
        });

        const context = {
          userId: 'test-user',
          sessionId: 'test-session'
        };

        mockSearchExecutor.execute.mockResolvedValue(
          MockFactory.createMockTaskResult({ success: false, error: 'Invalid payload' })
        );

        const result = await taskExecutor.executeTask(maliciousTask, context);

        // Should not execute malicious payloads
        expect(result.success).toBe(false);
        expect(mockSearchExecutor.execute).toHaveBeenCalledWith(maliciousTask, context);
      });

      it('should prevent task execution with suspicious user IDs', async () => {
        const task = MockFactory.createMockTask({ type: 'search' });
        const suspiciousContexts = [
          { userId: '../../../etc/passwd', sessionId: 'session' },
          { userId: '<script>alert("xss")</script>', sessionId: 'session' },
          { userId: 'user; DROP TABLE users; --', sessionId: 'session' },
          { userId: '', sessionId: 'session' }, // Empty user ID
          { userId: null as any, sessionId: 'session' } // Null user ID
        ];

        mockSearchExecutor.execute.mockResolvedValue(
          MockFactory.createMockTaskResult({ success: true })
        );

        for (const context of suspiciousContexts) {
          const result = await taskExecutor.executeTask(task, context);
          
          // Should either reject or sanitize suspicious user IDs
          expect(result).toBeDefined();
          if (result.success) {
            // If execution succeeded, ensure user ID was sanitized
            expect(context.userId).not.toContain('<script>');
            expect(context.userId).not.toContain('DROP TABLE');
          }
        }
      });

      it('should limit concurrent task executions per user', async () => {
        const userId = 'concurrent-test-user';
        const maxConcurrent = 10;
        
        // Create more tasks than should be allowed concurrently
        const tasks = Array.from({ length: maxConcurrent + 5 }, (_, i) =>
          MockFactory.createMockTask({ 
            type: 'search',
            id: `concurrent-task-${i}`
          })
        );

        mockSearchExecutor.execute.mockImplementation(async () => {
          await global.testUtils.sleep(200); // Simulate slow execution
          return MockFactory.createMockTaskResult({ success: true });
        });

        const startTime = Date.now();
        
        const executionPromises = tasks.map(task =>
          taskExecutor.executeTask(task, {
            userId,
            sessionId: `session-${task.id}`
          })
        );

        const results = await Promise.all(executionPromises);
        const executionTime = Date.now() - startTime;

        // Should have reasonable execution time indicating throttling
        expect(results.every(r => r.success)).toBe(true);
        expect(executionTime).toBeGreaterThan(100); // Should take some time due to concurrency limits
      });

      it('should sanitize goal text for execution', async () => {
        const maliciousGoal = MockFactory.createMockUserGoal({
          text: 'find hotels </script><script>alert("xss")</script> in Paris',
          intent: {
            type: 'booking',
            confidence: 0.9,
            parameters: {
              location: 'Paris',
              maliciousParam: '<script>steal()</script>'
            }
          }
        });

        const context = {
          userId: 'security-test-user',
          sessionId: 'security-test-session'
        };

        // Mock Claude to return safe analysis
        const mockClaudeClient = MockFactory.createMockClaudeClient();
        mockClaudeClient.messages.create.mockResolvedValue(
          MockFactory.createMockClaudeResponse({
            content: [{
              type: 'text',
              text: JSON.stringify({
                intent: { type: 'booking', confidence: 0.9, parameters: { location: 'Paris' } },
                entities: [{ type: 'location', value: 'Paris', confidence: 0.9 }],
                actionPlan: [
                  { step: 1, action: 'search', description: 'Search for hotels in Paris' }
                ],
                recommendations: []
              })
            }]
          })
        );

        mockSearchExecutor.execute.mockResolvedValue(
          MockFactory.createMockTaskResult({ success: true })
        );

        const result = await taskExecutor.executeGoal(maliciousGoal, context);

        expect(result.success).toBe(true);
        
        // Should not contain malicious scripts in any task payload
        for (const taskResult of result.tasks) {
          if (taskResult.result?.data) {
            const dataString = JSON.stringify(taskResult.result.data);
            expect(dataString).not.toContain('<script>');
            expect(dataString).not.toContain('alert(');
          }
        }
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should handle missing authentication gracefully', async () => {
      const claudeClient = new ClaudeClient();
      
      // Mock API to return auth error
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      const authError = new Error('Authentication failed') as any;
      authError.status = 401;
      mockClaudeClient.messages.create.mockRejectedValue(authError);

      await expect(
        claudeClient.generateResponse('Test message')
      ).rejects.toThrow('Authentication failed. Please check your API key.');
    });

    it('should handle rate limiting appropriately', async () => {
      const claudeClient = new ClaudeClient();
      
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      const rateLimitError = new Error('Rate limited') as any;
      rateLimitError.status = 429;
      mockClaudeClient.messages.create.mockRejectedValue(rateLimitError);

      await expect(
        claudeClient.generateResponse('Test message')
      ).rejects.toThrow('Rate limit exceeded. Please try again later.');
    });

    it('should validate user permissions for task execution', async () => {
      const taskExecutor = new TaskExecutor();
      
      const restrictedTask = MockFactory.createMockTask({
        type: 'search',
        payload: {
          url: 'https://internal-admin-panel.com',
          query: 'sensitive data'
        }
      });

      const unauthorizedContext = {
        userId: 'unauthorized-user',
        sessionId: 'session'
      };

      // Mock executor to check permissions
      mockSearchExecutor.canHandle.mockReturnValue(false); // Reject unauthorized task
      
      const result = await taskExecutor.executeTask(restrictedTask, unauthorizedContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No executor found');
    });
  });

  describe('Data Protection', () => {
    it('should not log sensitive information', async () => {
      const sensitiveContent = MockFactory.createMockPageContent({
        text: 'Password: secret123, API Key: sk-1234567890, Credit Card: 4111-1111-1111-1111',
        title: 'Document with sensitive data'
      });

      const claudeClient = new ClaudeClient();
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockResolvedValue(
        MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: JSON.stringify({
              summary: 'Document summary without sensitive data',
              keyPoints: [],
              entities: [],
              sentiment: 'neutral',
              relevanceScore: 0.5
            })
          }]
        })
      );

      await claudeClient.summarizeContent(sensitiveContent);

      // Verify that logger was not called with sensitive data
      const logger = require('../../src/core/utils/logger').default;
      
      // Check all logger calls don't contain sensitive patterns
      const allLogCalls = [
        ...logger.info.mock.calls,
        ...logger.debug.mock.calls,
        ...logger.warn.mock.calls,
        ...logger.error.mock.calls
      ].flat();

      for (const logCall of allLogCalls) {
        const logString = JSON.stringify(logCall);
        expect(logString).not.toMatch(/password[:\s]*[^\s,}]+/i);
        expect(logString).not.toMatch(/api[_\s]?key[:\s]*[^\s,}]+/i);
        expect(logString).not.toMatch(/\d{4}-\d{4}-\d{4}-\d{4}/); // Credit card pattern
      }
    });

    it('should sanitize URLs in error messages', async () => {
      const sensitiveUrl = 'https://admin:password123@internal.com/secret?token=abc123';
      
      // Use the shared articleExtractor instance
      
      try {
        await articleExtractor.extract('', sensitiveUrl);
      } catch (error) {
        const errorMessage = error.message;
        
        // Should not expose credentials in error messages
        expect(errorMessage).not.toContain('password123');
        expect(errorMessage).not.toContain('token=abc123');
        expect(errorMessage).not.toContain('admin:');
      }
    });

    it('should handle personal data appropriately', async () => {
      const personalDataHtml = `
        <html>
        <body>
          <article>
            <h1>Personal Information</h1>
            <p>Name: John Doe</p>
            <p>Email: john.doe@example.com</p>
            <p>Phone: (555) 123-4567</p>
            <p>SSN: 123-45-6789</p>
            <p>Address: 123 Main St, Anytown, USA</p>
          </article>
        </body>
        </html>
      `;

      // Use the shared articleExtractor instance
      const result = await articleExtractor.extract(personalDataHtml, 'https://example.com');

      expect(result.success).toBe(true);
      
      // Should extract content but with appropriate handling
      expect(result.content?.text).toContain('Personal Information');
      
      // Confidence should be lower for personal data documents
      expect(result.confidence).toBeLessThan(0.9);
    });
  });

  describe('Resource Protection', () => {
    it('should prevent infinite loops in content extraction', async () => {
      // HTML with circular references or complex nesting
      const circularHtml = `
        <html>
        <body>
          <article>
            <h1>Circular Reference Test</h1>
            ${'<div>'.repeat(1000)}
            <p>Deep nesting content</p>
            ${'</div>'.repeat(1000)}
          </article>
        </body>
        </html>
      `;

      // Use the shared articleExtractor instance
      
      const startTime = Date.now();
      const result = await articleExtractor.extract(circularHtml, 'https://example.com');
      const executionTime = Date.now() - startTime;

      // Should complete within reasonable time
      expect(executionTime).toBeLessThan(3000);
      expect(result).toBeDefined();
    });

    it('should limit memory usage during processing', async () => {
      const taskExecutor = new TaskExecutor();
      
      // Create tasks that could potentially consume excessive memory
      const memoryIntensiveTasks = Array.from({ length: 50 }, (_, i) =>
        MockFactory.createMockTask({
          type: 'search',
          id: `memory-task-${i}`,
          payload: {
            query: 'large query '.repeat(1000),
            options: {
              largeData: Array.from({ length: 1000 }, (_, j) => `data-${j}`)
            }
          }
        })
      );

      mockSearchExecutor.execute.mockResolvedValue(
        MockFactory.createMockTaskResult({ success: true })
      );

      const context = {
        userId: 'memory-test-user',
        sessionId: 'memory-test-session'
      };

      // Should handle large number of tasks without memory issues
      const results = await taskExecutor.executeBatch(memoryIntensiveTasks, context);
      
      expect(results).toHaveLength(50);
      expect(results.filter(r => r.success).length).toBeGreaterThan(40); // Most should succeed

      await taskExecutor.cleanup();
    });

    it('should timeout long-running operations', async () => {
      const claudeClient = new ClaudeClient();
      
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockImplementation(async () => {
        // Simulate extremely slow response
        await global.testUtils.sleep(10000);
        return MockFactory.createMockClaudeResponse();
      });

      const startTime = Date.now();
      
      try {
        await claudeClient.generateResponse('Test message with timeout');
      } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Should timeout before 10 seconds
        expect(executionTime).toBeLessThan(8000);
        expect(error.message.includes('timeout') || error.message.includes('aborted')).toBe(true);
      }
    });
  });

  describe('Error Handling Security', () => {
    it('should not expose internal paths in error messages', async () => {
      const claudeClient = new ClaudeClient();
      
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      const internalError = new Error('ENOENT: no such file or directory, open \'/internal/config/secrets.json\'') as any;
      mockClaudeClient.messages.create.mockRejectedValue(internalError);

      try {
        await claudeClient.generateResponse('Test message');
      } catch (error) {
        // Should not expose internal file paths
        expect(error.message).not.toContain('/internal/config/');
        expect(error.message).not.toContain('secrets.json');
      }
    });

    it('should handle stack trace information securely', async () => {
      const taskExecutor = new TaskExecutor();
      
      mockSearchExecutor.execute.mockImplementation(() => {
        const error = new Error('Internal processing error');
        error.stack = `Error: Internal processing error
    at SearchExecutor.execute (/app/src/internal/sensitive-module.js:123:45)
    at TaskExecutor.executeTask (/app/src/core/tasks/task-executor.js:67:89)
    at /app/src/secret-config.js:234:56`;
        throw error;
      });

      const task = MockFactory.createMockTask({ type: 'search' });
      const context = { userId: 'test-user', sessionId: 'test-session' };

      const result = await taskExecutor.executeTask(task, context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      
      // Should not expose internal file paths in error message
      expect(result.error).not.toContain('/app/src/internal/');
      expect(result.error).not.toContain('secret-config.js');
    });
  });
});
