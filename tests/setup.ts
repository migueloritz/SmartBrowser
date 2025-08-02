import { jest } from '@jest/globals';

// Mock logger globally
jest.mock('@/core/utils/logger', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUrl(): R;
      toBeValidDate(): R;
      toHaveValidTaskStructure(): R;
      toBeWithinTimeRange(start: number, end: number): R;
    }
  }
}

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
        message: () => `expected ${received} not to be a valid Date`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid Date`,
        pass: false,
      };
    }
  },

  toHaveValidTaskStructure(received: any) {
    const requiredFields = ['id', 'type', 'userId', 'status', 'priority', 'createdAt'];
    const hasAllFields = requiredFields.every(field => received.hasOwnProperty(field));
    
    if (hasAllFields) {
      return {
        message: () => `expected task not to have valid structure`,
        pass: true,
      };
    } else {
      const missingFields = requiredFields.filter(field => !received.hasOwnProperty(field));
      return {
        message: () => `expected task to have valid structure, missing fields: ${missingFields.join(', ')}`,
        pass: false,
      };
    }
  },

  toBeWithinTimeRange(received: number, start: number, end: number) {
    const pass = received >= start && received <= end;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be within time range ${start}-${end}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within time range ${start}-${end}`,
        pass: false,
      };
    }
  }
});

// Mock external dependencies
jest.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn()
      }
    }))
  };
});

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(),
    launchPersistentContext: jest.fn()
  }
}));

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    lpush: jest.fn(),
    rpop: jest.fn(),
    llen: jest.fn()
  }))
}));

// Global test utilities
global.testUtils = {
  createMockTask: (overrides = {}) => ({
    id: 'test-task-id',
    type: 'navigate' as const,
    userId: 'test-user-id',
    goalId: 'test-goal-id',
    payload: { url: 'https://example.com' },
    status: 'pending' as const,
    priority: 'medium' as const,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  createMockPageContent: (overrides = {}) => ({
    url: 'https://example.com',
    title: 'Example Page',
    text: 'This is example content for testing purposes.',
    html: '<html><body><h1>Example Page</h1><p>This is example content for testing purposes.</p></body></html>',
    metadata: {
      author: 'Test Author',
      publishDate: new Date(),
      description: 'Example page description',
      keywords: ['test', 'example'],
      language: 'en',
      readingTime: 1,
      wordCount: 10
    },
    extractedAt: new Date(),
    extractorUsed: 'article-extractor',
    ...overrides
  }),

  createMockGoal: (overrides = {}) => ({
    id: 'test-goal-id',
    userId: 'test-user-id',
    text: 'find hotels in Paris',
    intent: {
      type: 'booking' as const,
      confidence: 0.95,
      parameters: {
        location: 'Paris',
        type: 'hotel'
      }
    },
    entities: [
      {
        type: 'location' as const,
        value: 'Paris',
        confidence: 0.98,
        start: 15,
        end: 20
      }
    ],
    priority: 'medium' as const,
    status: 'pending' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  createMockClaudeResponse: (overrides = {}) => ({
    id: 'test-response-id',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text' as const, text: 'Test response from Claude' }],
    model: 'claude-3-sonnet-20240229',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 100,
      output_tokens: 50
    },
    ...overrides
  }),

  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  waitForCondition: async (condition: () => boolean, timeout = 5000) => {
    const startTime = Date.now();
    while (!condition() && Date.now() - startTime < timeout) {
      await global.testUtils.sleep(10);
    }
    if (!condition()) {
      throw new Error(`Condition not met within ${timeout}ms`);
    }
  }
};

// Console spy setup for cleaner test output
const originalConsole = console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn()
};

// Environment setup
process.env.NODE_ENV = 'test';
process.env.CLAUDE_API_KEY = 'test-claude-api-key';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters!';

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});