// Jest global setup and configuration
// Using standard Jest globals for better TypeScript compatibility

// Mock logger globally - fixed export structure
jest.mock('@/core/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: 'Mock Claude response' }],
          id: 'msg_123',
          model: 'claude-3-sonnet-20240229',
          role: 'assistant',
          stop_reason: 'end_turn',
          stop_sequence: null,
          type: 'message',
          usage: { input_tokens: 10, output_tokens: 20 }
        })
      }
    }))
  };
});

// Mock Playwright
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn(),
          content: jest.fn().mockResolvedValue('<html><body>Mock content</body></html>'),
          title: jest.fn().mockResolvedValue('Mock Title'),
          close: jest.fn()
        }),
        close: jest.fn()
      }),
      close: jest.fn()
    })
  }
}));

// Mock Redis
jest.mock('redis', () => ({
  createClient: jest.fn().mockReturnValue({
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    ttl: jest.fn(),
    expire: jest.fn()
  })
}));

// Custom Jest matchers
expect.extend({
  toBeValidUrl(received: string) {
    const urlPattern = /^https?:\/\/[^\s$.?#].[^\s]*$/;
    const pass = urlPattern.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid URL`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid URL`,
        pass: false,
      };
    }
  },

  toBeValidDate(received: any) {
    const pass = received instanceof Date && !isNaN(received.getTime());
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid date`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid date`,
        pass: false,
      };
    }
  },

  toHaveValidTaskStructure(received: any) {
    const requiredFields = ['id', 'type', 'status', 'priority', 'createdAt'];
    const hasAllFields = requiredFields.every(field => received.hasOwnProperty(field));
    
    if (hasAllFields) {
      return {
        message: () => `expected task not to have valid structure`,
        pass: true,
      };
    } else {
      const missingFields = requiredFields.filter(field => !received.hasOwnProperty(field));
      return {
        message: () => `expected task to have valid structure. Missing fields: ${missingFields.join(', ')}`,
        pass: false,
      };
    }
  },

  toBeWithinTimeRange(received: number, start: number, end: number) {
    const pass = received >= start && received <= end;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${start}-${end}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${start}-${end}`,
        pass: false,
      };
    }
  }
});

// Global test utilities
(global as any).testUtils = {
  createMockTask: (overrides = {}) => ({
    id: 'test-task-1',
    type: 'search',
    status: 'pending',
    priority: 'medium',
    goal: 'Test goal',
    description: 'Test description',
    steps: [],
    results: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  createMockGoal: (overrides = {}) => ({
    id: 'test-goal-1',
    description: 'Test goal description',
    priority: 'high',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    tasks: [],
    ...overrides
  }),

  createMockPageContent: (overrides = {}) => ({
    url: 'https://example.com',
    title: 'Test Page',
    text: 'This is test content for the page.',
    html: '<html><body><h1>Test Page</h1><p>This is test content for the page.</p></body></html>',
    metadata: {
      author: 'Test Author',
      publishDate: new Date(),
      description: 'Test description',
      keywords: ['test', 'example'],
      language: 'en',
      readingTime: 1,
      wordCount: 10
    },
    extractedAt: new Date(),
    extractorUsed: 'test-extractor',
    ...overrides
  }),

  createMockClaudeResponse: (overrides = {}) => ({
    content: [{ text: 'Mock Claude response' }],
    id: 'msg_123',
    model: 'claude-3-sonnet-20240229',
    role: 'assistant',
    stop_reason: 'end_turn',
    stop_sequence: null,
    type: 'message',
    usage: { input_tokens: 10, output_tokens: 20 },
    ...overrides
  }),

  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  waitForCondition: async (condition: () => boolean, timeout = 5000) => {
    const start = Date.now();
    while (!condition()) {
      if (Date.now() - start > timeout) {
        throw new Error('Condition timeout');
      }
      await (global as any).testUtils.sleep(10);
    }
  }
};

// Environment setup
process.env.NODE_ENV = 'test';
process.env.CLAUDE_API_KEY = 'test-claude-api-key';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters!';

// Global setup and teardown
beforeEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});

afterEach(() => {
  jest.restoreAllMocks();
});

export {};
