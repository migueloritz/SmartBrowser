import { playwrightManager } from '../../src/core/browser/playwright-manager';
import { PlaywrightManager } from '../../src/core/browser/playwright-manager';
import { articleExtractor } from '../../src/core/content/extractors/article-extractor';
import { ClaudeClient } from '../../src/core/ai/claude-client';
import MockFactory from '../helpers/mock-factory';

// Mock external dependencies but test integration between our modules
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(MockFactory.createMockPlaywrightBrowser())
  }
}));

jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => MockFactory.createMockClaudeClient())
}));

jest.mock('../../src/core/utils/config', () => ({
  default: {
    get: jest.fn().mockReturnValue({
      browserMaxContexts: 5,
      browserTimeout: 30000,
      browserHeadless: true,
      claudeApiKey: 'test-api-key',
      claudeModel: 'claude-3-sonnet-20240229'
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

describe('Browser Automation Integration', () => {
  let playwrightManager: PlaywrightManager;
  // Use the shared articleExtractor instance
  let claudeClient: ClaudeClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    playwrightManager = new PlaywrightManager();
    claudeClient = new ClaudeClient();
    
    await playwrightManager.initialize();
  });

  afterEach(async () => {
    await playwrightManager.cleanup();
  });

  describe('Page Navigation and Content Extraction', () => {
    it('should navigate to page and extract content', async () => {
      // Setup
      const testUrl = 'https://example.com/article';
      const mockHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>Test Article</title>
          <meta name="author" content="Test Author">
        </head>
        <body>
          <article>
            <h1>Test Article Title</h1>
            <p>This is a comprehensive test article with substantial content for testing.</p>
            <p>It contains multiple paragraphs to ensure proper content extraction.</p>
            <p>The article includes meaningful information that should be properly processed.</p>
          </article>
        </body>
        </html>
      `;

      // Mock page content
      const mockPage = MockFactory.createMockPlaywrightPage();
      mockPage.url.mockReturnValue(testUrl);
      mockPage.title.mockResolvedValue('Test Article');
      mockPage.content.mockResolvedValue(mockHtml);
      mockPage.evaluate.mockResolvedValue('Test Article Title This is a comprehensive test article...');

      // Create context and page
      const contextId = await playwrightManager.createContext('test-user', 'test-session');
      const pageId = await playwrightManager.createPage(contextId);

      // Navigate to URL
      const navigationResult = await playwrightManager.navigateToUrl(pageId, testUrl);
      expect(navigationResult).toBe(true);

      // Extract page content
      const pageContent = await playwrightManager.getPageContent(pageId);
      expect(pageContent.url).toBe(testUrl);
      expect(pageContent.title).toBe('Test Article');

      // Extract article content using ArticleExtractor
      const articleResult = await articleExtractor.extract(pageContent.html, pageContent.url);
      
      expect(articleResult.success).toBe(true);
      expect(articleResult.content).toBeDefined();
      expect(articleResult.content?.title).toBe('Test Article Title');
      expect(articleResult.content?.metadata.author).toBe('Test Author');
      expect(articleResult.confidence).toBeGreaterThan(0.5);
    });

    it('should handle navigation failures gracefully', async () => {
      const testUrl = 'https://unreachable-site.com';
      
      // Mock navigation failure
      const mockPage = MockFactory.createMockPlaywrightPage();
      mockPage.goto.mockRejectedValue(new Error('Navigation timeout'));

      const contextId = await playwrightManager.createContext('test-user', 'test-session');
      const pageId = await playwrightManager.createPage(contextId);

      await expect(
        playwrightManager.navigateToUrl(pageId, testUrl, { retries: 1 })
      ).rejects.toThrow('Failed to navigate');
    });

    it('should handle content extraction failures gracefully', async () => {
      const testUrl = 'https://example.com/empty';
      const emptyHtml = '<html><body></body></html>';

      const extractionResult = await articleExtractor.extract(emptyHtml, testUrl);

      expect(extractionResult.success).toBe(false);
      expect(extractionResult.error).toBeDefined();
      expect(extractionResult.confidence).toBe(0);
    });
  });

  describe('Content Summarization Workflow', () => {
    it('should extract and summarize page content', async () => {
      // Setup
      const testUrl = 'https://example.com/news-article';
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Breaking News: Important Event</title>
          <meta name="description" content="Latest updates on important event">
        </head>
        <body>
          <article>
            <h1>Breaking News: Important Event</h1>
            <p>In a significant development, researchers have made a breakthrough discovery.</p>
            <p>The findings have important implications for the field and could lead to new applications.</p>
            <p>Experts are calling this a game-changing development that will impact future research.</p>
            <p>The study was conducted over several years with rigorous methodology.</p>
          </article>
        </body>
        </html>
      `;

      // Mock Claude response
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockResolvedValue(
        MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: JSON.stringify({
              summary: 'Researchers have made a breakthrough discovery with significant implications for the field.',
              keyPoints: [
                'Breakthrough discovery by researchers',
                'Important implications for the field',
                'Game-changing development',
                'Rigorous methodology over several years'
              ],
              entities: [
                { name: 'researchers', type: 'person', confidence: 0.8 }
              ],
              sentiment: 'positive',
              relevanceScore: 0.9
            })
          }]
        })
      );

      // Extract content
      const extractionResult = await articleExtractor.extract(mockHtml, testUrl);
      expect(extractionResult.success).toBe(true);

      // Summarize content
      const summaryResult = await claudeClient.summarizeContent(extractionResult.content!);

      expect(summaryResult.summary).toContain('breakthrough discovery');
      expect(summaryResult.keyPoints).toHaveLength(4);
      expect(summaryResult.sentiment).toBe('positive');
      expect(summaryResult.relevanceScore).toBe(0.9);
      expect(summaryResult.entities).toHaveLength(1);
    });

    it('should handle different summarization options', async () => {
      const mockContent = MockFactory.createMockPageContent();
      
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      mockClaudeClient.messages.create.mockResolvedValue(
        MockFactory.createMockClaudeResponse({
          content: [{
            type: 'text',
            text: JSON.stringify({
              summary: 'Brief summary in bullet points',
              keyPoints: ['Point 1', 'Point 2'],
              entities: [],
              sentiment: 'neutral',
              relevanceScore: 0.7
            })
          }]
        })
      );

      const options = {
        maxLength: 'brief' as const,
        format: 'bullets' as const,
        focus: ['key findings', 'implications']
      };

      const result = await claudeClient.summarizeContent(mockContent, options);

      expect(result.summary).toBe('Brief summary in bullet points');
      expect(result.keyPoints).toHaveLength(2);
    });
  });

  describe('Multi-page Content Processing', () => {
    it('should handle multiple pages in sequence', async () => {
      const urls = [
        'https://example.com/page1',
        'https://example.com/page2',
        'https://example.com/page3'
      ];

      const mockPage = MockFactory.createMockPlaywrightPage();
      const contextId = await playwrightManager.createContext('test-user', 'test-session');
      
      const results = [];

      for (const [index, url] of urls.entries()) {
        // Mock different content for each page
        mockPage.url.mockReturnValue(url);
        mockPage.title.mockResolvedValue(`Page ${index + 1}`);
        mockPage.content.mockResolvedValue(`
          <html>
          <body>
            <article>
              <h1>Page ${index + 1} Title</h1>
              <p>Content for page ${index + 1} with meaningful information.</p>
              <p>Additional paragraph to meet minimum length requirements.</p>
            </article>
          </body>
          </html>
        `);

        const pageId = await playwrightManager.createPage(contextId);
        await playwrightManager.navigateToUrl(pageId, url);
        const pageContent = await playwrightManager.getPageContent(pageId);
        
        results.push(pageContent);
        await playwrightManager.closePage(pageId);
      }

      expect(results).toHaveLength(3);
      expect(results[0].title).toBe('Page 1');
      expect(results[1].title).toBe('Page 2');
      expect(results[2].title).toBe('Page 3');
    });

    it('should handle concurrent page processing', async () => {
      const urls = [
        'https://example.com/concurrent1',
        'https://example.com/concurrent2',
        'https://example.com/concurrent3'
      ];

      // Create separate contexts for concurrent processing
      const contextPromises = urls.map(async (url, index) => {
        const contextId = await playwrightManager.createContext('test-user', `session-${index}`);
        const pageId = await playwrightManager.createPage(contextId);
        
        // Mock page content
        const mockPage = MockFactory.createMockPlaywrightPage();
        mockPage.url.mockReturnValue(url);
        mockPage.title.mockResolvedValue(`Concurrent Page ${index + 1}`);
        
        await playwrightManager.navigateToUrl(pageId, url);
        const pageContent = await playwrightManager.getPageContent(pageId);
        
        return { contextId, pageId, pageContent };
      });

      const results = await Promise.all(contextPromises);

      expect(results).toHaveLength(3);
      expect(results[0].pageContent.title).toBe('Concurrent Page 1');
      expect(results[1].pageContent.title).toBe('Concurrent Page 2');
      expect(results[2].pageContent.title).toBe('Concurrent Page 3');

      // Cleanup
      for (const result of results) {
        await playwrightManager.closeContext(result.contextId);
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from browser context failures', async () => {
      // Create initial context
      const contextId1 = await playwrightManager.createContext('test-user', 'session1');
      const pageId1 = await playwrightManager.createPage(contextId1);

      // Simulate context failure by closing it
      await playwrightManager.closeContext(contextId1);

      // Should be able to create new context
      const contextId2 = await playwrightManager.createContext('test-user', 'session2');
      const pageId2 = await playwrightManager.createPage(contextId2);

      expect(contextId2).not.toBe(contextId1);
      expect(pageId2).not.toBe(pageId1);
    });

    it('should handle content extraction with partial data', async () => {
      const partialHtml = `
        <html>
        <head>
          <title>Partial Article</title>
        </head>
        <body>
          <div>
            <p>This article has minimal structure but some content.</p>
            <p>It should still be extractable with lower confidence.</p>
            <p>Testing resilience of the extraction process.</p>
          </div>
        </body>
        </html>
      `;

      const result = await articleExtractor.extract(partialHtml, 'https://example.com');

      expect(result.success).toBe(true);
      expect(result.confidence).toBeLessThan(0.8); // Lower confidence due to minimal structure
      expect(result.content?.text).toContain('minimal structure');
    });

    it('should handle Claude API temporary failures', async () => {
      const mockContent = MockFactory.createMockPageContent();
      
      const mockClaudeClient = MockFactory.createMockClaudeClient();
      
      // First call fails, second succeeds
      mockClaudeClient.messages.create
        .mockRejectedValueOnce(new Error('Temporary API failure'))
        .mockResolvedValueOnce(
          MockFactory.createMockClaudeResponse({
            content: [{
              type: 'text',
              text: JSON.stringify({
                summary: 'Recovery successful',
                keyPoints: [],
                entities: [],
                sentiment: 'neutral',
                relevanceScore: 0.5
              })
            }]
          })
        );

      // First attempt should fail
      await expect(claudeClient.summarizeContent(mockContent)).rejects.toThrow();

      // Second attempt should succeed
      const result = await claudeClient.summarizeContent(mockContent);
      expect(result.summary).toBe('Recovery successful');
    });
  });

  describe('Memory and Resource Management', () => {
    it('should manage browser contexts within limits', async () => {
      const maxContexts = 5;
      const contextIds: string[] = [];

      // Create maximum number of contexts
      for (let i = 0; i < maxContexts; i++) {
        const contextId = await playwrightManager.createContext('test-user', `session-${i}`);
        contextIds.push(contextId);
      }

      const stats1 = playwrightManager.getStats();
      expect(stats1.contextsCount).toBe(maxContexts);

      // Creating one more should trigger cleanup of oldest
      const extraContextId = await playwrightManager.createContext('test-user', 'session-extra');
      
      const stats2 = playwrightManager.getStats();
      expect(stats2.contextsCount).toBe(maxContexts); // Should still be at limit
    });

    it('should cleanup resources properly', async () => {
      // Create multiple contexts and pages
      const contextId1 = await playwrightManager.createContext('test-user', 'session1');
      const contextId2 = await playwrightManager.createContext('test-user', 'session2');
      
      const pageId1 = await playwrightManager.createPage(contextId1);
      const pageId2 = await playwrightManager.createPage(contextId2);

      const statsBeforeCleanup = playwrightManager.getStats();
      expect(statsBeforeCleanup.contextsCount).toBe(2);
      expect(statsBeforeCleanup.pagesCount).toBe(2);

      // Cleanup
      await playwrightManager.cleanup();

      const statsAfterCleanup = playwrightManager.getStats();
      expect(statsAfterCleanup.contextsCount).toBe(0);
      expect(statsAfterCleanup.pagesCount).toBe(0);
      expect(statsAfterCleanup.browserActive).toBe(false);
    });
  });

  describe('Performance Considerations', () => {
    it('should complete page navigation within reasonable time', async () => {
      const startTime = Date.now();
      
      const contextId = await playwrightManager.createContext('test-user', 'test-session');
      const pageId = await playwrightManager.createPage(contextId);
      
      await playwrightManager.navigateToUrl(pageId, 'https://example.com');
      
      const navigationTime = Date.now() - startTime;
      expect(navigationTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should extract content efficiently', async () => {
      const largeHtml = `
        <html>
        <head>
          <title>Large Article</title>
        </head>
        <body>
          <article>
            <h1>Large Article Title</h1>
            ${'<p>This is a paragraph with substantial content. '.repeat(100)}
          </article>
        </body>
        </html>
      `;

      const startTime = Date.now();
      const result = await articleExtractor.extract(largeHtml, 'https://example.com');
      const extractionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(extractionTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should handle multiple concurrent extractions', async () => {
      const htmlSamples = [
        '<html><body><article><h1>Article 1</h1><p>Content 1</p><p>More content</p></article></body></html>',
        '<html><body><article><h1>Article 2</h1><p>Content 2</p><p>More content</p></article></body></html>',
        '<html><body><article><h1>Article 3</h1><p>Content 3</p><p>More content</p></article></body></html>',
        '<html><body><article><h1>Article 4</h1><p>Content 4</p><p>More content</p></article></body></html>',
        '<html><body><article><h1>Article 5</h1><p>Content 5</p><p>More content</p></article></body></html>'
      ];

      const startTime = Date.now();
      
      const extractionPromises = htmlSamples.map((html, index) =>
        articleExtractor.extract(html, `https://example.com/article${index}`)
      );

      const results = await Promise.all(extractionPromises);
      const totalTime = Date.now() - startTime;

      expect(results).toHaveLength(5);
      expect(results.every(r => r.success)).toBe(true);
      expect(totalTime).toBeLessThan(3000); // All extractions should complete within 3 seconds
    });
  });
});