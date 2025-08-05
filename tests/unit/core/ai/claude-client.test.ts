import { ClaudeClient } from '../../../../src/core/ai/claude-client';
import { ClaudeAPIError } from '../../../../src/types';
import MockFactory from '../../../helpers/mock-factory';

// Mock Anthropic SDK
const mockClaudeClient = MockFactory.createMockClaudeClient();
jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => mockClaudeClient)
}));

jest.mock('../../../../src/core/utils/config', () => ({
  default: {
    get: jest.fn().mockReturnValue({
      claudeApiKey: 'test-api-key',
      claudeModel: 'claude-3-sonnet-20240229'
    })
  }
}));

jest.mock('../../../../src/core/utils/logger', () => ({
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('../../../../src/core/utils/validator', () => ({
  default: {
    validateClaudeResponse: jest.fn().mockReturnValue(true)
  }
}));

describe('ClaudeClient', () => {
  let claudeClient: ClaudeClient;

  beforeEach(() => {
    jest.clearAllMocks();
    claudeClient = new ClaudeClient();
  });

  describe('constructor', () => {
    it('should initialize with valid API key', () => {
      expect(claudeClient).toBeInstanceOf(ClaudeClient);
    });

    it('should throw ClaudeAPIError if API key is missing', () => {
      const { default: config } = require('../../../../src/core/utils/config');
      config.get.mockReturnValueOnce({ claudeApiKey: '' });

      expect(() => new ClaudeClient()).toThrow(ClaudeAPIError);
    });
  });

  describe('summarizeContent', () => {
    const mockPageContent = MockFactory.createMockPageContent();

    it('should summarize content successfully', async () => {
      const mockResponse = MockFactory.createMockClaudeResponse({
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary: 'This is a test summary of the article content.',
            keyPoints: ['Key point 1', 'Key point 2', 'Key point 3'],
            entities: [
              { name: 'Test Author', type: 'person', confidence: 0.9 },
              { name: 'Test Company', type: 'organization', confidence: 0.8 }
            ],
            sentiment: 'positive',
            relevanceScore: 0.85
          })
        }]
      });

      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      const result = await claudeClient.summarizeContent(mockPageContent);

      expect(result).toEqual({
        summary: 'This is a test summary of the article content.',
        keyPoints: ['Key point 1', 'Key point 2', 'Key point 3'],
        entities: [
          { name: 'Test Author', type: 'person', confidence: 0.9 },
          { name: 'Test Company', type: 'organization', confidence: 0.8 }
        ],
        sentiment: 'positive',
        relevanceScore: 0.85
      });

      expect(mockClaudeClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-sonnet-20240229',
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('analyze and summarize')
            })
          ])
        })
      );
    });

    it('should handle different summarization options', async () => {
      const mockResponse = MockFactory.createMockClaudeResponse({
        content: [{ type: 'text', text: '{"summary": "Brief summary", "keyPoints": [], "entities": [], "sentiment": "neutral", "relevanceScore": 0.7}' }]
      });

      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      const options = {
        maxLength: 'brief' as const,
        format: 'bullets' as const,
        focus: ['main topic', 'key insights']
      };

      const result = await claudeClient.summarizeContent(mockPageContent, options);

      expect(result.summary).toBe('Brief summary');
      expect(mockClaudeClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Keep the summary under 100 words')
            })
          ])
        })
      );
    });

    it('should handle malformed JSON response gracefully', async () => {
      const mockResponse = MockFactory.createMockClaudeResponse({
        content: [{ type: 'text', text: 'This is not valid JSON response' }]
      });

      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      const result = await claudeClient.summarizeContent(mockPageContent);

      expect(result).toEqual(
        expect.objectContaining({
          summary: expect.any(String),
          keyPoints: [],
          entities: [],
          sentiment: 'neutral',
          relevanceScore: 0.5
        })
      );
    });

    it('should throw ClaudeAPIError on API failure', async () => {
      mockClaudeClient.messages.create.mockRejectedValue(new Error('API Error'));

      await expect(
        claudeClient.summarizeContent(mockPageContent)
      ).rejects.toThrow(ClaudeAPIError);
    });
  });

  describe('analyzeGoal', () => {
    const mockUserGoal = MockFactory.createMockUserGoal();

    it('should analyze user goal successfully', async () => {
      const mockResponse = MockFactory.createMockClaudeResponse({
        content: [{
          type: 'text',
          text: JSON.stringify({
            intent: {
              type: 'booking',
              confidence: 0.95,
              parameters: { location: 'Paris', type: 'hotel' }
            },
            entities: [
              { type: 'location', value: 'Paris', confidence: 0.98 }
            ],
            actionPlan: [
              { step: 1, action: 'navigate', description: 'Go to booking site', url: 'https://booking.com' },
              { step: 2, action: 'search', description: 'Search for hotels', selector: '#search-input' }
            ],
            recommendations: ['Compare prices', 'Check reviews']
          })
        }]
      });

      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      const result = await claudeClient.analyzeGoal(mockUserGoal);

      expect(result).toEqual({
        intent: {
          type: 'booking',
          confidence: 0.95,
          parameters: { location: 'Paris', type: 'hotel' }
        },
        entities: [
          { type: 'location', value: 'Paris', confidence: 0.98 }
        ],
        actionPlan: [
          { step: 1, action: 'navigate', description: 'Go to booking site', url: 'https://booking.com' },
          { step: 2, action: 'search', description: 'Search for hotels', selector: '#search-input' }
        ],
        recommendations: ['Compare prices', 'Check reviews']
      });
    });

    it('should include context in analysis', async () => {
      const mockResponse = MockFactory.createMockClaudeResponse({
        content: [{ type: 'text', text: '{"intent": {"type": "search", "confidence": 0.8, "parameters": {}}, "entities": [], "actionPlan": [], "recommendations": []}' }]
      });

      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      const context = {
        currentPage: MockFactory.createMockPageContent(),
        recentPages: [MockFactory.createMockPageContent()],
        userHistory: ['searched hotels', 'viewed travel sites']
      };

      const options = {
        includeSteps: true,
        includeRecommendations: true,
        maxSteps: 3
      };

      await claudeClient.analyzeGoal(mockUserGoal, context, options);

      expect(mockClaudeClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Current Page:')
            })
          ])
        })
      );
    });

    it('should handle malformed goal analysis response', async () => {
      const mockResponse = MockFactory.createMockClaudeResponse({
        content: [{ type: 'text', text: 'Invalid response format' }]
      });

      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      const result = await claudeClient.analyzeGoal(mockUserGoal);

      expect(result).toEqual({
        intent: { type: 'search', confidence: 0.5, parameters: {} },
        entities: [],
        actionPlan: [],
        recommendations: []
      });
    });

    it('should throw ClaudeAPIError on API failure', async () => {
      mockClaudeClient.messages.create.mockRejectedValue(new Error('API Error'));

      await expect(
        claudeClient.analyzeGoal(mockUserGoal)
      ).rejects.toThrow(ClaudeAPIError);
    });
  });

  describe('generateResponse', () => {
    it('should generate response successfully', async () => {
      const mockResponse = MockFactory.createMockClaudeResponse({
        content: [{ type: 'text', text: 'This is a helpful response from Claude.' }]
      });

      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      const result = await claudeClient.generateResponse('How can I help you?');

      expect(result).toBe('This is a helpful response from Claude.');
      expect(mockClaudeClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: 'How can I help you?'
            })
          ])
        })
      );
    });

    it('should include conversation history', async () => {
      const mockResponse = MockFactory.createMockClaudeResponse();
      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      const context = {
        conversationHistory: [
          { role: 'user' as const, content: 'Previous message' },
          { role: 'assistant' as const, content: 'Previous response' }
        ]
      };

      await claudeClient.generateResponse('Follow up question', context);

      expect(mockClaudeClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: 'user', content: 'Previous message' },
            { role: 'assistant', content: 'Previous response' }
          ])
        })
      );
    });

    it('should include page context', async () => {
      const mockResponse = MockFactory.createMockClaudeResponse();
      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      const context = {
        currentPage: MockFactory.createMockPageContent(),
        taskHistory: ['previous task 1', 'previous task 2']
      };

      await claudeClient.generateResponse('What can you tell me about this page?', context);

      expect(mockClaudeClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Current page context:')
            })
          ])
        })
      );
    });

    it('should validate response for safety', async () => {
      const mockResponse = MockFactory.createMockClaudeResponse({
        content: [{ type: 'text', text: 'Unsafe response content' }]
      });

      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      const { default: validator } = require('../../../../src/core/utils/validator');
      validator.validateClaudeResponse.mockReturnValue(false);

      await expect(
        claudeClient.generateResponse('Test message')
      ).rejects.toThrow(ClaudeAPIError);
    });

    it('should throw ClaudeAPIError on API failure', async () => {
      mockClaudeClient.messages.create.mockRejectedValue(new Error('API Error'));

      await expect(
        claudeClient.generateResponse('Test message')
      ).rejects.toThrow(ClaudeAPIError);
    });
  });

  describe('extractStructuredData', () => {
    const mockPageContent = MockFactory.createMockPageContent();

    it('should extract structured data successfully', async () => {
      const mockResponse = MockFactory.createMockClaudeResponse({
        content: [{
          type: 'text',
          text: JSON.stringify({
            title: 'Product Name',
            price: 99.99,
            description: 'Product description',
            availability: true
          })
        }]
      });

      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      const schema = {
        fields: [
          { name: 'title', type: 'string' as const, description: 'Product title', required: true },
          { name: 'price', type: 'number' as const, description: 'Product price' },
          { name: 'description', type: 'string' as const, description: 'Product description' },
          { name: 'availability', type: 'string' as const, description: 'Product availability' }
        ]
      };

      const result = await claudeClient.extractStructuredData(mockPageContent, schema);

      expect(result).toEqual({
        title: 'Product Name',
        price: 99.99,
        description: 'Product description',
        availability: true
      });

      expect(mockClaudeClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Extract structured data')
            })
          ])
        })
      );
    });

    it('should handle malformed structured data response', async () => {
      const mockResponse = MockFactory.createMockClaudeResponse({
        content: [{ type: 'text', text: 'Invalid JSON response' }]
      });

      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      const schema = {
        fields: [
          { name: 'title', type: 'string' as const, description: 'Product title' }
        ]
      };

      const result = await claudeClient.extractStructuredData(mockPageContent, schema);

      expect(result).toEqual({});
    });

    it('should throw ClaudeAPIError on API failure', async () => {
      mockClaudeClient.messages.create.mockRejectedValue(new Error('API Error'));

      const schema = {
        fields: [
          { name: 'title', type: 'string' as const, description: 'Product title' }
        ]
      };

      await expect(
        claudeClient.extractStructuredData(mockPageContent, schema)
      ).rejects.toThrow(ClaudeAPIError);
    });
  });

  describe('error handling', () => {
    it('should handle rate limiting (429)', async () => {
      const error = new Error('Rate limited') as any;
      error.status = 429;
      mockClaudeClient.messages.create.mockRejectedValue(error);

      await expect(
        claudeClient.generateResponse('test')
      ).rejects.toThrow('Rate limit exceeded. Please try again later.');
    });

    it('should handle authentication errors (401)', async () => {
      const error = new Error('Unauthorized') as any;
      error.status = 401;
      mockClaudeClient.messages.create.mockRejectedValue(error);

      await expect(
        claudeClient.generateResponse('test')
      ).rejects.toThrow('Authentication failed. Please check your API key.');
    });

    it('should handle generic API errors', async () => {
      const error = new Error('Generic API error') as any;
      error.status = 500;
      mockClaudeClient.messages.create.mockRejectedValue(error);

      await expect(
        claudeClient.generateResponse('test')
      ).rejects.toThrow(ClaudeAPIError);
    });
  });

  describe('prompt building', () => {
    it('should build system prompt with current date', () => {
      const mockResponse = MockFactory.createMockClaudeResponse();
      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      claudeClient.generateResponse('test');

      expect(mockClaudeClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('Current date:')
        })
      );
    });

    it('should truncate long content in prompts', async () => {
      const longContent = MockFactory.createMockPageContent({
        text: 'a'.repeat(20000) // Very long content
      });

      const mockResponse = MockFactory.createMockClaudeResponse({
        content: [{ type: 'text', text: '{"summary": "test", "keyPoints": [], "entities": [], "sentiment": "neutral", "relevanceScore": 0.5}' }]
      });

      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      await claudeClient.summarizeContent(longContent);

      expect(mockClaudeClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.not.stringContaining('a'.repeat(16000)) // Should be truncated
            })
          ])
        })
      );
    });
  });

  describe('response parsing', () => {
    it('should extract JSON from markdown code blocks', async () => {
      const mockResponse = MockFactory.createMockClaudeResponse({
        content: [{
          type: 'text',
          text: 'Here is the analysis:\n```json\n{"summary": "Test summary", "keyPoints": [], "entities": [], "sentiment": "neutral", "relevanceScore": 0.8}\n```'
        }]
      });

      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      const result = await claudeClient.summarizeContent(MockFactory.createMockPageContent());

      expect(result.summary).toBe('Test summary');
      expect(result.relevanceScore).toBe(0.8);
    });

    it('should handle responses with extra text around JSON', async () => {
      const mockResponse = MockFactory.createMockClaudeResponse({
        content: [{
          type: 'text',
          text: 'Based on my analysis, here are the results: {"summary": "Extracted summary", "keyPoints": ["Point 1"], "entities": [], "sentiment": "positive", "relevanceScore": 0.9} I hope this helps!'
        }]
      });

      mockClaudeClient.messages.create.mockResolvedValue(mockResponse);

      const result = await claudeClient.summarizeContent(MockFactory.createMockPageContent());

      expect(result.summary).toBe('Extracted summary');
      expect(result.sentiment).toBe('positive');
    });
  });
});