import { jest } from '@jest/globals';
import { 
  Task, 
  PageContent, 
  UserGoal, 
  ClaudeResponse, 
  TaskResult,
  ContentSummary,
  BrowserContext
} from '../../src/types/index';

export class MockFactory {
  static createMockBrowserContext(overrides: Partial<BrowserContext> = {}): BrowserContext {
    return {
      id: 'test-context-id',
      userId: 'test-user-id',
      sessionId: 'test-session-id',
      created: new Date(),
      lastUsed: new Date(),
      pageCount: 1,
      memoryUsage: 50 * 1024 * 1024, // 50MB
      ...overrides
    };
  }

  static createMockTask(overrides: Partial<Task> = {}): Task {
    return {
      id: 'test-task-' + Math.random().toString(36).substr(2, 9),
      type: 'navigate',
      userId: 'test-user-id',
      goalId: 'test-goal-id',
      payload: { url: 'https://example.com' },
      status: 'pending',
      priority: 'medium',
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  static createMockPageContent(overrides: Partial<PageContent> = {}): PageContent {
    return {
      url: 'https://example.com/article',
      title: 'Test Article Title',
      text: 'This is a test article with meaningful content for testing content extraction and summarization capabilities.',
      html: '<html><head><title>Test Article Title</title></head><body><h1>Test Article Title</h1><p>This is a test article with meaningful content.</p></body></html>',
      metadata: {
        author: 'Test Author',
        publishDate: new Date('2024-01-15'),
        description: 'A test article for content extraction testing',
        keywords: ['test', 'article', 'content'],
        language: 'en',
        readingTime: 2,
        wordCount: 150
      },
      extractedAt: new Date(),
      extractorUsed: 'article-extractor',
      ...overrides
    };
  }

  static createMockUserGoal(overrides: Partial<UserGoal> = {}): UserGoal {
    return {
      id: 'test-goal-' + Math.random().toString(36).substr(2, 9),
      userId: 'test-user-id',
      text: 'find hotels in Paris for next weekend',
      intent: {
        type: 'booking',
        confidence: 0.95,
        parameters: {
          location: 'Paris',
          type: 'hotel',
          dateRange: 'next weekend'
        }
      },
      entities: [
        {
          type: 'location',
          value: 'Paris',
          confidence: 0.98,
          start: 15,
          end: 20
        }
      ],
      priority: 'medium',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  static createMockClaudeResponse(overrides: Partial<ClaudeResponse> = {}): ClaudeResponse {
    return {
      id: 'msg_test_' + Math.random().toString(36).substr(2, 9),
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'text',
        text: 'This is a test response from Claude for testing purposes.'
      }],
      model: 'claude-3-sonnet-20240229',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 50
      },
      ...overrides
    };
  }

  static createMockTaskResult(overrides: Partial<TaskResult> = {}): TaskResult {
    return {
      taskId: 'test-task-id',
      success: true,
      data: { result: 'test data' },
      executionTime: 1500,
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      },
      ...overrides
    };
  }

  static createMockContentSummary(overrides: Partial<ContentSummary> = {}): ContentSummary {
    return {
      id: 'summary-' + Math.random().toString(36).substr(2, 9),
      url: 'https://example.com/article',
      title: 'Test Article Summary',
      summary: 'This is a concise summary of the test article content highlighting the main points and key information.',
      keyPoints: [
        'First key point from the article',
        'Second important insight',
        'Third relevant detail'
      ],
      entities: [
        {
          type: 'person',
          name: 'Test Author',
          confidence: 0.9,
          mentions: 2
        },
        {
          type: 'organization',
          name: 'Test Company',
          confidence: 0.85,
          mentions: 1
        }
      ],
      sentiment: 'neutral',
      relevanceScore: 0.8,
      createdAt: new Date(),
      ...overrides
    };
  }

  static createMockPlaywrightPage() {
    return {
      goto: jest.fn().mockResolvedValue(undefined),
      content: jest.fn().mockResolvedValue('<html><body>Test content</body></html>'),
      title: jest.fn().mockResolvedValue('Test Page Title'),
      url: jest.fn().mockReturnValue('https://example.com'),
      evaluate: jest.fn(),
      waitForSelector: jest.fn().mockResolvedValue({}),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-screenshot')),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      off: jest.fn(),
      click: jest.fn().mockResolvedValue(undefined),
      fill: jest.fn().mockResolvedValue(undefined),
      selectOption: jest.fn().mockResolvedValue([]),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      locator: jest.fn().mockReturnValue({
        click: jest.fn().mockResolvedValue(undefined),
        fill: jest.fn().mockResolvedValue(undefined),
        textContent: jest.fn().mockResolvedValue('Test text'),
        isVisible: jest.fn().mockResolvedValue(true)
      }),
      $: jest.fn().mockResolvedValue({
        textContent: jest.fn().mockResolvedValue('Test element text'),
        getAttribute: jest.fn().mockResolvedValue('test-attribute')
      }),
      $$: jest.fn().mockResolvedValue([]),
      setContent: jest.fn().mockResolvedValue(undefined),
      setViewportSize: jest.fn().mockResolvedValue(undefined)
    };
  }

  static createMockPlaywrightBrowser() {
    return {
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue(MockFactory.createMockPlaywrightPage()),
        close: jest.fn().mockResolvedValue(undefined),
        pages: jest.fn().mockReturnValue([])
      }),
      close: jest.fn().mockResolvedValue(undefined),
      contexts: jest.fn().mockReturnValue([]),
      isConnected: jest.fn().mockReturnValue(true)
    };
  }

  static createMockRedisClient() {
    return {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('PONG'),
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(1),
      lpush: jest.fn().mockResolvedValue(1),
      rpop: jest.fn().mockResolvedValue(null),
      llen: jest.fn().mockResolvedValue(0),
      flushall: jest.fn().mockResolvedValue('OK')
    };
  }

  static createMockClaudeClient() {
    return {
      messages: {
        create: jest.fn().mockResolvedValue(MockFactory.createMockClaudeResponse())
      }
    };
  }

  static createMockExpressRequest(overrides: any = {}) {
    return {
      body: {},
      params: {},
      query: {},
      headers: {},
      user: { id: 'test-user-id' },
      ...overrides
    };
  }

  static createMockExpressResponse() {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis()
    };
    return res;
  }

  static createErrorWithCode(message: string, code: string, statusCode: number = 500) {
    const error = new Error(message) as any;
    error.code = code;
    error.statusCode = statusCode;
    return error;
  }

  static createValidationErrors(fields: string[]) {
    return fields.map(field => ({
      field,
      message: `${field} is required`,
      code: 'VALIDATION_ERROR'
    }));
  }
}

export default MockFactory;