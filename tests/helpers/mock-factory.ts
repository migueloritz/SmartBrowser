import { 
  Task, 
  PageContent, 
  UserGoal, 
  ClaudeResponse, 
  TaskResult,
  ContentSummary,
  BrowserContext
} from '../../src/types/index';

/**
 * Simple mock function implementation that works around Jest typing issues
 */
interface MockFunction {
  (...args: any[]): any;
  mockReturnValue: (value: any) => MockFunction;
  mockResolvedValue: (value: any) => MockFunction;
  mockRejectedValue: (error: any) => MockFunction;
  mockReturnThis: () => MockFunction;
  mockImplementation: (fn: (...args: any[]) => any) => MockFunction;
  mockResolvedValueOnce: (value: any) => MockFunction;
  mockReturnValueOnce: (value: any) => MockFunction;
  calls: any[][];
}

function createMockFn(defaultReturn?: any): MockFunction {
  let implementation: ((...args: any[]) => any) | null = null;
  let returnValue = defaultReturn;
  let resolvedValue: any;
  let rejectedError: any;
  let shouldReturnThis = false;
  let onceValues: any[] = [];
  let onceIndex = 0;
  
  const mockFn = function(...args: any[]) {
    mockFn.calls.push(args);
    
    // Handle once values first
    if (onceIndex < onceValues.length) {
      const onceValue = onceValues[onceIndex++];
      if (onceValue && onceValue.isPromise) {
        return Promise.resolve(onceValue.value);
      }
      return onceValue;
    }
    
    if (implementation) {
      return implementation(...args);
    }
    
    if (rejectedError) {
      return Promise.reject(rejectedError);
    }
    
    if (resolvedValue !== undefined) {
      return Promise.resolve(resolvedValue);
    }
    
    if (shouldReturnThis) {
      return mockFn;
    }
    
    return returnValue;
  } as MockFunction;
  
  mockFn.calls = [];
  
  mockFn.mockReturnValue = (value: any) => {
    returnValue = value;
    return mockFn;
  };
  
  mockFn.mockResolvedValue = (value: any) => {
    resolvedValue = value;
    return mockFn;
  };
  
  mockFn.mockRejectedValue = (error: any) => {
    rejectedError = error;
    return mockFn;
  };
  
  mockFn.mockReturnThis = () => {
    shouldReturnThis = true;
    return mockFn;
  };
  
  mockFn.mockImplementation = (fn: (...args: any[]) => any) => {
    implementation = fn;
    return mockFn;
  };
  
  mockFn.mockResolvedValueOnce = (value: any) => {
    onceValues.push({ value, isPromise: true });
    return mockFn;
  };
  
  mockFn.mockReturnValueOnce = (value: any) => {
    onceValues.push(value);
    return mockFn;
  };
  
  return mockFn;
}

/**
 * Factory for creating mock objects for testing
 */
export class MockFactory {
  
  static createMockPageContent(overrides: Partial<PageContent> = {}): PageContent {
    const defaultContent: PageContent = {
      url: 'https://example.com/test',
      title: 'Test Page Title',
      text: 'This is test content for the page',
      html: '<html><body>This is test content for the page</body></html>',
      metadata: {
        description: 'Test page description',
        keywords: ['test', 'page'],
        author: 'Test Author',
        publishDate: new Date('2024-01-01'),
        wordCount: 150
      },
      extractedAt: new Date(),
      extractorUsed: 'test-extractor'
    };
    return { ...defaultContent, ...overrides };
  }

  static createMockTask(overrides: Partial<Task> = {}): Task {
    const defaultTask: Task = {
      id: 'test-task-123',
      type: 'extract_content',
      userId: 'test-user-id',
      goalId: 'test-goal-id',
      payload: { 
        url: 'https://example.com',
        options: { extractType: 'article' }
      },
      status: 'pending',
      priority: 'medium',
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    return { ...defaultTask, ...overrides };
  }

  static createMockUserGoal(overrides: Partial<UserGoal> = {}): UserGoal {
    const defaultGoal: UserGoal = {
      id: 'test-goal-456',
      userId: 'test-user-id',
      text: 'Extract article content from news website',
      intent: {
        type: 'summarize',
        confidence: 0.9,
        parameters: { domain: 'news' }
      },
      entities: [],
      priority: 'medium',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    return { ...defaultGoal, ...overrides };
  }

  static createMockTaskResult(overrides: Partial<TaskResult> = {}): TaskResult {
    const defaultResult: TaskResult = {
      taskId: 'test-task-123',
      success: true,
      data: 'extracted content',
      executionTime: 1500,
      metadata: { extractorUsed: 'test-extractor' }
    };
    return { ...defaultResult, ...overrides };
  }

  static createMockContentSummary(overrides: Partial<ContentSummary> = {}): ContentSummary {
    const defaultSummary: ContentSummary = {
      id: 'test-summary-id',
      url: 'https://example.com/test',
      title: 'Test Article Summary',
      summary: 'This is a test summary of the article content.',
      keyPoints: ['Point 1', 'Point 2', 'Point 3'],
      entities: [{
        type: 'person',
        name: 'John Doe',
        confidence: 0.9,
        mentions: 2
      }],
      sentiment: 'neutral',
      relevanceScore: 0.85,
      createdAt: new Date()
    };
    return { ...defaultSummary, ...overrides };
  }

  static createMockClaudeResponse(overrides: Partial<ClaudeResponse> = {}): ClaudeResponse {
    const defaultResponse: ClaudeResponse = {
      id: 'test-claude-response',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'This is a test response from Claude'
        }
      ],
      model: 'claude-3-sonnet-20240229',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        output_tokens: 50
      }
    };
    return { ...defaultResponse, ...overrides };
  }

  static createMockBrowserContext(overrides: Partial<BrowserContext> = {}): BrowserContext {
    const defaultContext: BrowserContext = {
      id: 'test-context-123',
      userId: 'test-user-id',
      sessionId: 'test-session-id',
      created: new Date(),
      lastUsed: new Date(),
      pageCount: 1,
      memoryUsage: 1024
    };
    return { ...defaultContext, ...overrides };
  }

  static createMockPlaywrightPage(): any {
    return {
      goto: createMockFn().mockResolvedValue(undefined),
      content: createMockFn().mockResolvedValue('<html><body>Test content</body></html>'),
      title: createMockFn().mockResolvedValue('Test Page Title'),
      url: createMockFn().mockReturnValue('https://example.com'),
      evaluate: createMockFn(),
      waitForSelector: createMockFn().mockResolvedValue({}),
      waitForLoadState: createMockFn().mockResolvedValue(undefined),
      screenshot: createMockFn().mockResolvedValue(Buffer.from('fake-screenshot')),
      close: createMockFn().mockResolvedValue(undefined),
      on: createMockFn(),
      off: createMockFn(),
      click: createMockFn().mockResolvedValue(undefined),
      fill: createMockFn().mockResolvedValue(undefined),
      selectOption: createMockFn().mockResolvedValue([]),
      waitForTimeout: createMockFn().mockResolvedValue(undefined),
      locator: createMockFn().mockReturnValue({
        click: createMockFn().mockResolvedValue(undefined),
        fill: createMockFn().mockResolvedValue(undefined),
        textContent: createMockFn().mockResolvedValue('Test text'),
        isVisible: createMockFn().mockResolvedValue(true)
      }),
      $: createMockFn().mockResolvedValue({
        textContent: createMockFn().mockResolvedValue('Test element text'),
        getAttribute: createMockFn().mockResolvedValue('test-attribute')
      }),
      $$: createMockFn().mockResolvedValue([]),
      setContent: createMockFn().mockResolvedValue(undefined),
      setViewportSize: createMockFn().mockResolvedValue(undefined)
    };
  }

  static createMockPlaywrightBrowser(): any {
    return {
      newContext: createMockFn().mockResolvedValue({
        newPage: createMockFn().mockResolvedValue(MockFactory.createMockPlaywrightPage()),
        close: createMockFn().mockResolvedValue(undefined),
        pages: createMockFn().mockReturnValue([])
      }),
      close: createMockFn().mockResolvedValue(undefined),
      contexts: createMockFn().mockReturnValue([]),
      isConnected: createMockFn().mockReturnValue(true)
    };
  }

  static createMockRedisClient(): any {
    return {
      connect: createMockFn().mockResolvedValue(undefined),
      disconnect: createMockFn().mockResolvedValue(undefined),
      ping: createMockFn().mockResolvedValue('PONG'),
      set: createMockFn().mockResolvedValue('OK'),
      get: createMockFn().mockResolvedValue(null),
      del: createMockFn().mockResolvedValue(1),
      exists: createMockFn().mockResolvedValue(0),
      expire: createMockFn().mockResolvedValue(1),
      lpush: createMockFn().mockResolvedValue(1),
      rpop: createMockFn().mockResolvedValue(null),
      llen: createMockFn().mockResolvedValue(0),
      flushall: createMockFn().mockResolvedValue('OK'),
      healthCheck: createMockFn().mockResolvedValue(true)
    };
  }

  static createMockClaudeClient(): any {
    return {
      messages: {
        create: createMockFn().mockResolvedValue(MockFactory.createMockClaudeResponse())
      },
      analyzeGoal: createMockFn(),
      generateResponse: createMockFn()
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

  static createMockExpressResponse(): any {
    const res: any = {
      status: createMockFn().mockReturnThis(),
      json: createMockFn().mockReturnThis(),
      send: createMockFn().mockReturnThis(),
      end: createMockFn().mockReturnThis(),
      header: createMockFn().mockReturnThis(),
      cookie: createMockFn().mockReturnThis(),
      clearCookie: createMockFn().mockReturnThis()
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

  // Helper to create jest-style mocks that work with our custom functions
  static jest = {
    fn: createMockFn
  };
}

export default MockFactory;