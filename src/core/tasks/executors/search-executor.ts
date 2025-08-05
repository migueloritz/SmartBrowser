import { Task, TaskType } from '@/types';
import { BaseExecutor, ExecutionContext } from './base-executor';
import { pageController } from '@/core/browser/page-controller';
import { articleExtractor } from '@/core/content/extractors/article-extractor';
import { contentSummarizer } from '@/core/content/processors/summarizer';
import logger from '@/core/utils/logger';
import validator from '@/core/utils/validator';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  summary?: string;
  relevanceScore: number;
}

interface SearchExecutorResult {
  query: string;
  searchEngine: string;
  totalResults: number;
  results: SearchResult[];
  executedAt: Date;
}

class SearchExecutor extends BaseExecutor {
  private readonly searchEngines = {
    google: 'https://www.google.com/search?q=',
    bing: 'https://www.bing.com/search?q=',
    duckduckgo: 'https://duckduckgo.com/?q='
  };

  constructor() {
    super('SearchExecutor', {
      timeout: 45000, // Longer timeout for search operations
      retries: 2,
      concurrency: 1
    });
  }

  public canHandle(task: Task): boolean {
    return task.type === 'search';
  }

  protected async executeImpl(
    task: Task, 
    context: ExecutionContext
  ): Promise<SearchExecutorResult> {
    const payload = task.payload;
    
    if (!payload.query) {
      throw new Error('Search query is required');
    }

    const query = validator.sanitizeString(payload.query);
    const searchEngine = typeof payload.options?.searchEngine === 'string' 
      ? payload.options.searchEngine 
      : 'google';
    const maxResults = Math.min(
      typeof payload.options?.maxResults === 'number' 
        ? payload.options.maxResults 
        : 10, 
      20
    );
    const summarizeResults = typeof payload.options?.summarizeResults === 'boolean' 
      ? payload.options.summarizeResults 
      : false;

    logger.info('Executing search task', {
      taskId: task.id,
      query,
      searchEngine,
      maxResults,
      summarizeResults
    });

    this.logProgress(task.id, 'initializing', 0.1);

    // Create page session for search
    const searchUrl = this.buildSearchUrl(query, searchEngine);
    const sessionId = await pageController.createPageSession(
      context.userId,
      searchUrl,
      { timeout: 30000 }
    );

    this.logProgress(task.id, 'search_page_loaded', 0.3);

    try {
      // Wait for search results to load
      await this.waitForSearchResults(sessionId);
      
      this.logProgress(task.id, 'extracting_results', 0.5);

      // Extract search results
      const results = await this.extractSearchResults(
        sessionId, 
        searchEngine, 
        maxResults
      );

      this.logProgress(task.id, 'processing_results', 0.7);

      // Optionally summarize top results
      if (summarizeResults && results.length > 0) {
        await this.summarizeTopResults(results.slice(0, 3), context);
      }

      this.logProgress(task.id, 'completed', 1.0);

      return {
        query,
        searchEngine,
        totalResults: results.length,
        results,
        executedAt: new Date()
      };

    } finally {
      // Clean up page session
      await pageController.closeSession(sessionId);
    }
  }

  private buildSearchUrl(query: string, searchEngine: string): string {
    const baseUrl = this.searchEngines[searchEngine as keyof typeof this.searchEngines];
    if (!baseUrl) {
      throw new Error(`Unsupported search engine: ${searchEngine}`);
    }

    return baseUrl + encodeURIComponent(query);
  }

  private async waitForSearchResults(sessionId: string): Promise<void> {
    // Wait for search results to load based on search engine
    const resultSelectors = [
      'div[data-sokoban-container]', // Google results
      '.b_algo', // Bing results
      '.result', // DuckDuckGo results
      '#search', // Generic search results
      '.search-result'
    ];

    for (const selector of resultSelectors) {
      const found = await pageController.interactWithPage(
        sessionId,
        'wait',
        selector,
        undefined,
        5000
      );

      if (found) {
        logger.debug('Search results loaded', { sessionId, selector });
        return;
      }
    }

    // If no specific selectors work, wait a bit for dynamic loading
    await this.sleep(3000);
  }

  private async extractSearchResults(
    sessionId: string,
    searchEngine: string,
    maxResults: number
  ): Promise<SearchResult[]> {
    const pageContent = await pageController.getPageContent(sessionId);
    
    // Use different extraction strategies based on search engine
    switch (searchEngine) {
      case 'google':
        return this.extractGoogleResults(pageContent.html, maxResults);
      case 'bing':
        return this.extractBingResults(pageContent.html, maxResults);
      case 'duckduckgo':
        return this.extractDuckDuckGoResults(pageContent.html, maxResults);
      default:
        return this.extractGenericResults(pageContent.html, maxResults);
    }
  }

  private extractGoogleResults(html: string, maxResults: number): SearchResult[] {
    try {
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const results: SearchResult[] = [];
      const resultElements = document.querySelectorAll('div[data-sokoban-container] > div');

      for (let i = 0; i < Math.min(resultElements.length, maxResults); i++) {
        const element = resultElements[i];
        
        const titleElement = element.querySelector('h3');
        const linkElement = element.querySelector('a[href]');
        const snippetElement = element.querySelector('[data-sncf]') || 
                               element.querySelector('.s') ||
                               element.querySelector('.st');

        if (titleElement && linkElement) {
          const title = titleElement.textContent?.trim() || '';
          const url = linkElement.getAttribute('href') || '';
          const snippet = snippetElement?.textContent?.trim() || '';

          if (title && url && this.isValidUrl(url)) {
            results.push({
              title,
              url,
              snippet,
              relevanceScore: this.calculateRelevanceScore(title, snippet, i)
            });
          }
        }
      }

      return results;
    } catch (error) {
      logger.error('Failed to extract Google results', error);
      return [];
    }
  }

  private extractBingResults(html: string, maxResults: number): SearchResult[] {
    try {
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const results: SearchResult[] = [];
      const resultElements = document.querySelectorAll('.b_algo');

      for (let i = 0; i < Math.min(resultElements.length, maxResults); i++) {
        const element = resultElements[i];
        
        const titleElement = element.querySelector('h2 a');
        const snippetElement = element.querySelector('.b_caption p');

        if (titleElement) {
          const title = titleElement.textContent?.trim() || '';
          const url = titleElement.getAttribute('href') || '';
          const snippet = snippetElement?.textContent?.trim() || '';

          if (title && url && this.isValidUrl(url)) {
            results.push({
              title,
              url,
              snippet,
              relevanceScore: this.calculateRelevanceScore(title, snippet, i)
            });
          }
        }
      }

      return results;
    } catch (error) {
      logger.error('Failed to extract Bing results', error);
      return [];
    }
  }

  private extractDuckDuckGoResults(html: string, maxResults: number): SearchResult[] {
    try {
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const results: SearchResult[] = [];
      const resultElements = document.querySelectorAll('.result');

      for (let i = 0; i < Math.min(resultElements.length, maxResults); i++) {
        const element = resultElements[i];
        
        const titleElement = element.querySelector('.result__title a');
        const snippetElement = element.querySelector('.result__snippet');

        if (titleElement) {
          const title = titleElement.textContent?.trim() || '';
          const url = titleElement.getAttribute('href') || '';
          const snippet = snippetElement?.textContent?.trim() || '';

          if (title && url && this.isValidUrl(url)) {
            results.push({
              title,
              url,
              snippet,
              relevanceScore: this.calculateRelevanceScore(title, snippet, i)
            });
          }
        }
      }

      return results;
    } catch (error) {
      logger.error('Failed to extract DuckDuckGo results', error);
      return [];
    }
  }

  private extractGenericResults(html: string, maxResults: number): SearchResult[] {
    // Fallback extraction for unknown search engines
    try {
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const results: SearchResult[] = [];
      const linkElements = document.querySelectorAll('a[href]');

      let count = 0;
      for (const linkElement of Array.from(linkElements) as any[]) {
        if (count >= maxResults) break;

        const url = linkElement.getAttribute('href') || '';
        const title = linkElement.textContent?.trim() || '';

        if (this.isValidUrl(url) && title.length > 10) {
          // Try to find snippet near the link
          const parent = linkElement.parentElement;
          const snippet = parent?.textContent?.substring(0, 200) || '';

          results.push({
            title,
            url,
            snippet,
            relevanceScore: this.calculateRelevanceScore(title, snippet, count)
          });
          count++;
        }
      }

      return results;
    } catch (error) {
      logger.error('Failed to extract generic results', error);
      return [];
    }
  }

  private async summarizeTopResults(
    results: SearchResult[],
    context: ExecutionContext
  ): Promise<void> {
    logger.info('Summarizing top search results', { count: results.length });

    const summaryPromises = results.map(async (result, index) => {
      try {
        // Create a temporary session for each result
        const sessionId = await pageController.createPageSession(
          context.userId,
          result.url,
          { timeout: 15000 }
        );

        try {
          const pageContent = await pageController.getPageContent(sessionId);
          
          // Extract article content if possible
          const extraction = await articleExtractor.extract(
            pageContent.html,
            pageContent.url
          );

          if (extraction.success && extraction.content) {
            const summaryResult = await contentSummarizer.summarize({
              content: extraction.content,
              options: { maxLength: 'brief', format: 'paragraph' }
            });

            if (summaryResult.success) {
              result.summary = summaryResult.summary.summary;
            }
          }
        } finally {
          await pageController.closeSession(sessionId);
        }
      } catch (error) {
        logger.warn('Failed to summarize search result', {
          url: result.url,
          error: error.message
        });
      }
    });

    // Wait for all summaries with timeout
    await Promise.allSettled(summaryPromises);
  }

  private isValidUrl(url: string): boolean {
    try {
      // Skip internal/relative links and non-http protocols
      if (!url.startsWith('http')) {
        return false;
      }

      const parsedUrl = new URL(url);
      
      // Skip certain domains/paths
      const skipPatterns = [
        'google.com',
        'bing.com',
        'duckduckgo.com',
        '/search',
        'javascript:',
        'mailto:'
      ];

      return !skipPatterns.some(pattern => 
        url.toLowerCase().includes(pattern.toLowerCase())
      );
    } catch (error) {
      return false;
    }
  }

  private calculateRelevanceScore(title: string, snippet: string, position: number): number {
    let score = 1.0;

    // Position bias (higher positions get higher scores)
    score -= (position * 0.05);

    // Title length factor
    if (title.length > 20 && title.length < 100) {
      score += 0.1;
    }

    // Snippet quality factor
    if (snippet.length > 50 && snippet.length < 300) {
      score += 0.1;
    }

    return Math.max(0.1, Math.min(1.0, score));
  }
}

export const searchExecutor = new SearchExecutor();
export default searchExecutor;