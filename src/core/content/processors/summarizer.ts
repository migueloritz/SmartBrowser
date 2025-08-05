import { v4 as uuidv4 } from 'uuid';
import { 
  PageContent, 
  ContentSummary, 
  ContentEntity,
  ContentExtractionError 
} from '@/types';
import { claudeClient, SummarizationOptions } from '@/core/ai/claude-client';
import logger from '@/core/utils/logger';

export interface SummaryRequest {
  content: PageContent;
  options?: SummarizationOptions;
  userId?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface SummaryResult {
  id: string;
  summary: ContentSummary;
  processingTime: number;
  success: boolean;
  error?: string;
}

class ContentSummarizer {
  private readonly cache: Map<string, ContentSummary> = new Map();
  private readonly cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
  private readonly maxCacheSize = 1000;

  public async summarize(request: SummaryRequest): Promise<SummaryResult> {
    const startTime = Date.now();
    const summaryId = uuidv4();

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(request.content);
      const cached = this.getCachedSummary(cacheKey);
      
      if (cached) {
        logger.debug('Using cached summary', { url: request.content.url, cacheKey });
        return {
          id: summaryId,
          summary: cached,
          processingTime: Date.now() - startTime,
          success: true
        };
      }

      // Validate content
      this.validateContent(request.content);

      // Generate summary using Claude
      const claudeResult = await claudeClient.summarizeContent(
        request.content,
        request.options || {}
      );

      // Create content summary
      const summary: ContentSummary = {
        id: summaryId,
        url: request.content.url,
        title: request.content.title,
        summary: claudeResult.summary,
        keyPoints: claudeResult.keyPoints,
        entities: claudeResult.entities.map(e => ({
          type: e.type as any,
          name: e.name,
          confidence: e.confidence,
          mentions: this.countMentions(request.content.text, e.name)
        })),
        sentiment: claudeResult.sentiment,
        relevanceScore: claudeResult.relevanceScore,
        createdAt: new Date()
      };

      // Cache the result
      this.cacheSummary(cacheKey, summary);

      const processingTime = Date.now() - startTime;

      logger.info('Content summarized successfully', {
        summaryId,
        url: request.content.url,
        processingTime,
        summaryLength: summary.summary.length,
        keyPointsCount: summary.keyPoints.length,
        entitiesCount: summary.entities.length
      });

      return {
        id: summaryId,
        summary,
        processingTime,
        success: true
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to summarize content', {
        summaryId,
        url: request.content.url,
        processingTime,
        error: error.message
      });

      return {
        id: summaryId,
        summary: this.createFallbackSummary(request.content),
        processingTime,
        success: false,
        error: error.message
      };
    }
  }

  public async batchSummarize(requests: SummaryRequest[]): Promise<SummaryResult[]> {
    logger.info('Starting batch summarization', { count: requests.length });

    // Process in parallel with concurrency limit
    const concurrencyLimit = 3;
    const results: SummaryResult[] = [];
    
    for (let i = 0; i < requests.length; i += concurrencyLimit) {
      const batch = requests.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map(request => this.summarize(request));
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            id: uuidv4(),
            summary: this.createFallbackSummary(batch[index]!.content),
            processingTime: 0,
            success: false,
            error: result.reason?.message || 'Unknown error'
          });
        }
      });
    }

    logger.info('Batch summarization completed', {
      total: requests.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });

    return results;
  }

  public async summarizeWithContext(
    content: PageContent,
    context: {
      relatedPages?: PageContent[];
      userGoals?: string[];
      focusAreas?: string[];
    },
    options: SummarizationOptions = {}
  ): Promise<SummaryResult> {
    // Enhance options with context
    const enhancedOptions: SummarizationOptions = {
      ...options,
      focus: [
        ...(options.focus || []),
        ...(context.focusAreas || []),
        ...(context.userGoals || [])
      ]
    };

    // Add related pages context to the content
    if (context.relatedPages?.length) {
      const relatedContext = context.relatedPages
        .map(page => `Related: ${page.title} - ${page.text.substring(0, 200)}`)
        .join('\n');
      
      const enhancedContent: PageContent = {
        ...content,
        text: `${content.text}\n\n--- Related Context ---\n${relatedContext}`
      };

      return this.summarize({
        content: enhancedContent,
        options: enhancedOptions
      });
    }

    return this.summarize({
      content,
      options: enhancedOptions
    });
  }

  public getCachedSummaryByUrl(url: string): ContentSummary | null {
    const cacheKey = this.generateCacheKeyFromUrl(url);
    return this.getCachedSummary(cacheKey);
  }

  public clearCache(): void {
    this.cache.clear();
    logger.info('Summary cache cleared');
  }

  public getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: 0 // TODO: Implement hit rate tracking
    };
  }

  private validateContent(content: PageContent): void {
    if (!content.url) {
      throw new ContentExtractionError('Content URL is required');
    }

    if (!content.text || content.text.trim().length < 50) {
      throw new ContentExtractionError('Content text is too short to summarize');
    }

    if (content.text.length > 100000) {
      logger.warn('Content is very long, truncating', { 
        url: content.url, 
        originalLength: content.text.length 
      });
      content.text = content.text.substring(0, 100000);
    }
  }

  private generateCacheKey(content: PageContent): string {
    // Create a hash-like key based on URL and content snippet
    const contentSnippet = content.text.substring(0, 200);
    const keyData = `${content.url}:${contentSnippet}:${content.title}`;
    
    // Simple hash function (in production, use a proper hash library)
    let hash = 0;
    for (let i = 0; i < keyData.length; i++) {
      const char = keyData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `summary:${Math.abs(hash)}`;
  }

  private generateCacheKeyFromUrl(url: string): string {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `summary:${Math.abs(hash)}`;
  }

  private getCachedSummary(cacheKey: string): ContentSummary | null {
    const cached = this.cache.get(cacheKey);
    
    if (!cached) {
      return null;
    }

    // Check if expired
    const age = Date.now() - cached.createdAt.getTime();
    if (age > this.cacheExpiry) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached;
  }

  private cacheSummary(cacheKey: string, summary: ContentSummary): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(cacheKey, summary);
  }

  private countMentions(text: string, entityName: string): number {
    const regex = new RegExp(`\\b${entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }

  private createFallbackSummary(content: PageContent): ContentSummary {
    // Create a basic summary when AI processing fails
    const firstParagraph = content.text.split('\n\n')[0] || content.text.substring(0, 300);
    
    return {
      id: uuidv4(),
      url: content.url,
      title: content.title,
      summary: firstParagraph + '...',
      keyPoints: [
        'Content extraction completed',
        `Page title: ${content.title}`,
        `Text length: ${content.text.length} characters`
      ],
      entities: [],
      sentiment: 'neutral',
      relevanceScore: 0.5,
      createdAt: new Date()
    };
  }

  public async cleanup(): Promise<void> {
    logger.info('Cleaning up content summarizer');
    this.clearCache();
  }
}

export { ContentSummarizer };
export const contentSummarizer = new ContentSummarizer();
export default contentSummarizer;