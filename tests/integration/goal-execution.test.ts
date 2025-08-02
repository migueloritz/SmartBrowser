import { jest } from '@jest/globals';
import { TaskExecutor } from '../../src/core/tasks/task-executor';
import { ClaudeClient } from '../../src/core/ai/claude-client';
import { PlaywrightManager } from '../../src/core/browser/playwright-manager';
import MockFactory from '../helpers/mock-factory';

// Mock external dependencies
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(MockFactory.createMockPlaywrightBrowser())
  }
}));

jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => MockFactory.createMockClaudeClient())
}));

// Mock search executor
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
      browserMaxContexts: 5,
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

describe('Goal Execution Integration', () => {
  let taskExecutor: TaskExecutor;
  let claudeClient: ClaudeClient;
  let playwrightManager: PlaywrightManager;

  beforeEach(async () => {
    jest.clearAllMocks();
    taskExecutor = new TaskExecutor();
    claudeClient = new ClaudeClient();
    playwrightManager = new PlaywrightManager();
    
    await playwrightManager.initialize();
  });

  afterEach(async () => {
    await taskExecutor.cleanup();
    await playwrightManager.cleanup();
  });

  describe('Hotel Search Goal Execution', () => {
    it('should execute hotel search goal end-to-end', async () => {
      // Setup goal
      const hotelSearchGoal = MockFactory.createMockUserGoal({
        text: 'find hotels in Paris for next weekend',
        intent: {
          type: 'booking',
          confidence: 0.95,
          parameters: {
            location: 'Paris',
            type: 'hotel',
            timeframe: 'next weekend'
          }
        }
      });

      // Mock Claude goal analysis
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create
        .mockResolvedValueOnce(
          MockFactory.createMockClaudeResponse({
            content: [{
              type: 'text',
              text: JSON.stringify({
                intent: {
                  type: 'booking',
                  confidence: 0.95,
                  parameters: {
                    location: 'Paris',
                    type: 'hotel',
                    checkIn: '2024-02-17',
                    checkOut: '2024-02-18'
                  }
                },
                entities: [
                  { type: 'location', value: 'Paris', confidence: 0.98 }
                ],
                actionPlan: [
                  {
                    step: 1,
                    action: 'navigate',
                    description: 'Navigate to hotel booking website',
                    url: 'https://booking.com'
                  },
                  {
                    step: 2,
                    action: 'search',
                    description: 'Search for hotels in Paris',
                    selector: '#search-input'
                  },
                  {
                    step: 3,
                    action: 'extract',
                    description: 'Extract hotel results',
                    selector: '.hotel-list'
                  }
                ],
                recommendations: [
                  'Compare prices across different dates',
                  'Check customer reviews',
                  'Look for hotels with good locations'
                ]
              })
            }]
          })
        );

      // Mock task execution results
      mockSearchExecutor.execute
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({
          success: true,
          data: { 
            action: 'navigate',
            url: 'https://booking.com',
            status: 'completed'
          }
        }))
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({
          success: true,
          data: {
            action: 'search',
            query: 'hotels in Paris',
            results: [
              { name: 'Hotel Ritz Paris', price: '€450/night', rating: 4.8 },
              { name: 'Hotel Plaza Athenee', price: '€380/night', rating: 4.7 },
              { name: 'Le Meurice', price: '€420/night', rating: 4.6 }
            ]
          }
        }))
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({
          success: true,
          data: {
            action: 'extract',
            extracted: {
              hotels: [
                {
                  name: 'Hotel Ritz Paris',
                  price: 450,
                  currency: 'EUR',
                  rating: 4.8,
                  location: 'Place Vendôme',
                  amenities: ['Spa', 'Restaurant', 'Gym']
                },
                {
                  name: 'Hotel Plaza Athenee',
                  price: 380,
                  currency: 'EUR',
                  rating: 4.7,
                  location: 'Avenue Montaigne',
                  amenities: ['Spa', 'Restaurant', 'Bar']
                }
              ]
            }
          }
        }));

      // Mock summary generation
      mockClaudeClient.messages.create.mockResolvedValueOnce(
        MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: 'Successfully found 2 luxury hotels in Paris for next weekend. The Hotel Ritz Paris (€450/night, 4.8 rating) and Hotel Plaza Athenee (€380/night, 4.7 rating) are both excellent options. I recommend comparing the amenities and exact locations to make your final choice.'
          }]
        })
      );

      const context = {
        userId: 'test-user-id',
        sessionId: 'test-session-id',
        currentUrl: 'https://example.com'
      };

      // Execute goal
      const result = await taskExecutor.executeGoal(hotelSearchGoal, context);

      // Verify results
      expect(result.success).toBe(true);
      expect(result.goalId).toBe(hotelSearchGoal.id);
      expect(result.tasks).toHaveLength(3);
      expect(result.tasks.every(t => t.success)).toBe(true);
      expect(result.summary).toContain('Successfully found');
      expect(result.summary).toContain('Hotel Ritz Paris');
      expect(result.summary).toContain('Hotel Plaza Athenee');

      // Verify task execution order and content
      expect(result.tasks[0].result?.data?.action).toBe('navigate');
      expect(result.tasks[1].result?.data?.action).toBe('search');
      expect(result.tasks[2].result?.data?.action).toBe('extract');
    });

    it('should handle partial task failures gracefully', async () => {
      const hotelSearchGoal = MockFactory.createMockUserGoal({
        text: 'find budget hotels in London'
      });

      // Mock Claude analysis
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockResolvedValueOnce(
        MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: JSON.stringify({
              intent: { type: 'booking', confidence: 0.9, parameters: {} },
              entities: [],
              actionPlan: [
                { step: 1, action: 'navigate', description: 'Go to booking site' },
                { step: 2, action: 'search', description: 'Search hotels' },
                { step: 3, action: 'extract', description: 'Extract results' }
              ],
              recommendations: []
            })
          }]
        })
      );

      // Mock mixed success/failure results
      mockSearchExecutor.execute
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({ success: true }))
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({ 
          success: false, 
          error: 'Search timeout' 
        }))
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({ success: true }));

      // Mock summary generation
      mockClaudeClient.messages.create.mockResolvedValueOnce(
        MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: 'Partially completed hotel search. Navigation was successful, but the search step failed due to timeout. However, some results were still extracted.'
          }]
        })
      );

      const context = {
        userId: 'test-user-id',
        sessionId: 'test-session-id'
      };

      const result = await taskExecutor.executeGoal(hotelSearchGoal, context);

      expect(result.success).toBe(true); // Overall success if at least one task succeeds
      expect(result.tasks).toHaveLength(3);
      expect(result.tasks[0].success).toBe(true);
      expect(result.tasks[1].success).toBe(false);
      expect(result.tasks[2].success).toBe(true);
      expect(result.summary).toContain('Partially completed');
    });

    it('should stop execution on critical task failure', async () => {
      const hotelSearchGoal = MockFactory.createMockUserGoal({
        text: 'find hotels with specific requirements',
        priority: 'critical'
      });

      // Mock Claude analysis
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockResolvedValueOnce(
        MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: JSON.stringify({
              intent: { type: 'booking', confidence: 0.9, parameters: {} },
              entities: [],
              actionPlan: [
                { step: 1, action: 'navigate', description: 'Critical navigation step' },
                { step: 2, action: 'search', description: 'Search step' },
                { step: 3, action: 'extract', description: 'Extract step' }
              ],
              recommendations: []
            })
          }]
        })
      );

      // Mock critical task failure
      mockSearchExecutor.execute
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({ 
          success: false, 
          error: 'Critical navigation failed' 
        }));

      const context = {
        userId: 'test-user-id',
        sessionId: 'test-session-id'
      };

      const result = await taskExecutor.executeGoal(hotelSearchGoal, context);

      expect(result.success).toBe(false);
      expect(result.tasks).toHaveLength(1); // Should stop after critical failure
      expect(result.tasks[0].success).toBe(false);
    });
  });

  describe('Shopping Goal Execution', () => {
    it('should execute product search goal', async () => {
      const shoppingGoal = MockFactory.createMockUserGoal({
        text: 'find wireless headphones under $200',
        intent: {
          type: 'shopping',
          confidence: 0.92,
          parameters: {
            product: 'wireless headphones',
            maxPrice: 200,
            currency: 'USD'
          }
        }
      });

      // Mock Claude analysis
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create
        .mockResolvedValueOnce(
          MockFactory.createMockClaudeResponse({
            content: [{
              type: 'text',
              text: JSON.stringify({
                intent: {
                  type: 'shopping',
                  confidence: 0.92,
                  parameters: {
                    product: 'wireless headphones',
                    maxPrice: 200
                  }
                },
                entities: [
                  { type: 'product', value: 'wireless headphones', confidence: 0.95 }
                ],
                actionPlan: [
                  {
                    step: 1,
                    action: 'search',
                    description: 'Search for wireless headphones',
                    url: 'https://amazon.com'
                  },
                  {
                    step: 2,
                    action: 'extract',
                    description: 'Extract product listings',
                    selector: '.product-list'
                  }
                ],
                recommendations: [
                  'Check customer reviews and ratings',
                  'Compare features and specifications',
                  'Look for deals and discounts'
                ]
              })
            }]
          })
        );

      // Mock search results
      mockSearchExecutor.execute
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({
          success: true,
          data: {
            products: [
              {
                name: 'Sony WH-CH720N',
                price: 149.99,
                rating: 4.3,
                reviews: 1250,
                features: ['Noise Cancelling', 'Bluetooth', '35hr Battery']
              },
              {
                name: 'Bose QuietComfort 45',
                price: 179.99,
                rating: 4.5,
                reviews: 2100,
                features: ['Active Noise Cancelling', 'Bluetooth', '24hr Battery']
              }
            ]
          }
        }))
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({
          success: true,
          data: {
            extracted: {
              totalResults: 2,
              inBudget: 2,
              averagePrice: 164.99,
              topRated: 'Bose QuietComfort 45'
            }
          }
        }));

      // Mock summary
      mockClaudeClient.messages.create.mockResolvedValueOnce(
        MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: 'Found 2 excellent wireless headphones within your $200 budget. The Bose QuietComfort 45 ($179.99, 4.5/5 stars) offers premium noise cancelling, while the Sony WH-CH720N ($149.99, 4.3/5 stars) provides great value with longer battery life.'
          }]
        })
      );

      const context = {
        userId: 'test-user-id',
        sessionId: 'test-session-id'
      };

      const result = await taskExecutor.executeGoal(shoppingGoal, context);

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks.every(t => t.success)).toBe(true);
      expect(result.summary).toContain('Found 2 excellent wireless headphones');
      expect(result.summary).toContain('Bose QuietComfort 45');
      expect(result.summary).toContain('Sony WH-CH720N');
    });
  });

  describe('Multi-step Complex Goals', () => {
    it('should execute complex travel planning goal', async () => {
      const travelGoal = MockFactory.createMockUserGoal({
        text: 'plan a weekend trip to Barcelona with flights and hotel'
      });

      // Mock Claude analysis for complex multi-step goal
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create
        .mockResolvedValueOnce(
          MockFactory.createMockClaudeResponse({
            content: [{
              type: 'text',
              text: JSON.stringify({
                intent: {
                  type: 'booking',
                  confidence: 0.88,
                  parameters: {
                    destination: 'Barcelona',
                    duration: 'weekend',
                    includes: ['flights', 'hotel']
                  }
                },
                entities: [
                  { type: 'location', value: 'Barcelona', confidence: 0.95 }
                ],
                actionPlan: [
                  {
                    step: 1,
                    action: 'search',
                    description: 'Search for flights to Barcelona',
                    url: 'https://flights.com'
                  },
                  {
                    step: 2,
                    action: 'search',
                    description: 'Search for hotels in Barcelona',
                    url: 'https://booking.com'
                  },
                  {
                    step: 3,
                    action: 'extract',
                    description: 'Compare total costs and create itinerary'
                  }
                ],
                recommendations: [
                  'Book flights and hotel together for potential discounts',
                  'Consider proximity of hotel to main attractions',
                  'Check cancellation policies'
                ]
              })
            }]
          })
        );

      // Mock flight search results
      mockSearchExecutor.execute
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({
          success: true,
          data: {
            flights: [
              {
                airline: 'Vueling',
                price: 245,
                departure: '2024-02-17T08:00',
                arrival: '2024-02-17T10:30',
                return: '2024-02-18T20:15'
              },
              {
                airline: 'Ryanair',
                price: 189,
                departure: '2024-02-17T06:30',
                arrival: '2024-02-17T09:00',
                return: '2024-02-18T22:00'
              }
            ]
          }
        }))
        // Mock hotel search results
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({
          success: true,
          data: {
            hotels: [
              {
                name: 'Hotel Barcelona Palace',
                price: 120,
                rating: 4.2,
                location: 'City Center'
              },
              {
                name: 'Hostal Barcelona',
                price: 75,
                rating: 3.8,
                location: 'Gothic Quarter'
              }
            ]
          }
        }))
        // Mock itinerary compilation
        .mockResolvedValueOnce(MockFactory.createMockTaskResult({
          success: true,
          data: {
            itinerary: {
              budget_option: {
                flight: 'Ryanair - €189',
                hotel: 'Hostal Barcelona - €75/night',
                total: '€339 for weekend'
              },
              premium_option: {
                flight: 'Vueling - €245',
                hotel: 'Hotel Barcelona Palace - €120/night',
                total: '€485 for weekend'
              }
            }
          }
        }));

      // Mock summary
      mockClaudeClient.messages.create.mockResolvedValueOnce(
        MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: 'Created two Barcelona weekend trip options: Budget option (€339 total) with Ryanair flights and Hostal Barcelona, or Premium option (€485 total) with Vueling flights and Hotel Barcelona Palace. Both include central locations with good access to attractions.'
          }]
        })
      );

      const context = {
        userId: 'test-user-id',
        sessionId: 'test-session-id'
      };

      const result = await taskExecutor.executeGoal(travelGoal, context);

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(3);
      expect(result.tasks.every(t => t.success)).toBe(true);
      expect(result.summary).toContain('Barcelona weekend trip');
      expect(result.summary).toContain('Budget option');
      expect(result.summary).toContain('Premium option');

      // Verify the task sequence executed correctly
      expect(result.tasks[0].result?.data?.flights).toBeDefined();
      expect(result.tasks[1].result?.data?.hotels).toBeDefined();
      expect(result.tasks[2].result?.data?.itinerary).toBeDefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle Claude analysis failures', async () => {
      const goal = MockFactory.createMockUserGoal();
      
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockRejectedValue(new Error('Claude API unavailable'));

      const context = {
        userId: 'test-user-id',
        sessionId: 'test-session-id'
      };

      const result = await taskExecutor.executeGoal(goal, context);

      expect(result.success).toBe(false);
      expect(result.tasks).toHaveLength(0);
      expect(result.summary).toContain('Claude API unavailable');
    });

    it('should handle malformed Claude responses', async () => {
      const goal = MockFactory.createMockUserGoal();
      
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockResolvedValue(
        MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: 'This is not valid JSON for goal analysis'
          }]
        })
      );

      const context = {
        userId: 'test-user-id',
        sessionId: 'test-session-id'
      };

      const result = await taskExecutor.executeGoal(goal, context);

      expect(result.success).toBe(false);
      expect(result.tasks).toHaveLength(0);
    });

    it('should provide meaningful error messages', async () => {
      const goal = MockFactory.createMockUserGoal({
        text: 'impossible task that cannot be executed'
      });

      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockResolvedValue(
        MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: JSON.stringify({
              intent: { type: 'unknown', confidence: 0.1, parameters: {} },
              entities: [],
              actionPlan: [],
              recommendations: ['This goal cannot be executed automatically']
            })
          }]
        })
      );

      const context = {
        userId: 'test-user-id',
        sessionId: 'test-session-id'
      };

      const result = await taskExecutor.executeGoal(goal, context);

      expect(result.success).toBe(false);
      expect(result.tasks).toHaveLength(0);
    });
  });

  describe('Performance and Scaling', () => {
    it('should handle concurrent goal executions', async () => {
      const goals = [
        MockFactory.createMockUserGoal({ text: 'find restaurants in NYC' }),
        MockFactory.createMockUserGoal({ text: 'search for laptops under $1000' }),
        MockFactory.createMockUserGoal({ text: 'book flight to Miami' })
      ];

      // Setup mocks for all goals
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockResolvedValue(
        MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: JSON.stringify({
              intent: { type: 'search', confidence: 0.8, parameters: {} },
              entities: [],
              actionPlan: [
                { step: 1, action: 'search', description: 'Execute search' }
              ],
              recommendations: []
            })
          }]
        })
      );

      mockSearchExecutor.execute.mockResolvedValue(
        MockFactory.createMockTaskResult({ success: true })
      );

      const contexts = goals.map((_, index) => ({
        userId: `user-${index}`,
        sessionId: `session-${index}`
      }));

      const startTime = Date.now();
      
      const goalPromises = goals.map((goal, index) =>
        taskExecutor.executeGoal(goal, contexts[index])
      );

      const results = await Promise.all(goalPromises);
      const executionTime = Date.now() - startTime;

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(executionTime).toBeLessThan(5000); // Should complete concurrently within 5 seconds
    });

    it('should track execution metrics', async () => {
      const goal = MockFactory.createMockUserGoal();
      
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockResolvedValue(
        MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: JSON.stringify({
              intent: { type: 'search', confidence: 0.8, parameters: {} },
              entities: [],
              actionPlan: [
                { step: 1, action: 'search', description: 'Search task' }
              ],
              recommendations: []
            })
          }]
        })
      );

      mockSearchExecutor.execute.mockImplementation(async () => {
        await global.testUtils.sleep(100); // Simulate work
        return MockFactory.createMockTaskResult({ success: true });
      });

      const context = {
        userId: 'test-user-id',
        sessionId: 'test-session-id'
      };

      const result = await taskExecutor.executeGoal(goal, context);

      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.executionTime).toBeWithinTimeRange(90, 500);
      expect(result.tasks[0].executionTime).toBeGreaterThan(0);
    });
  });
});