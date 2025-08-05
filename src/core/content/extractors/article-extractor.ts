import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { PageContent, PageMetadata, ContentExtractionError } from '@/types';
import { logger } from '@/core/utils/logger';

export interface ExtractionOptions {
  includeImages?: boolean;
  includeLinks?: boolean;
  minTextLength?: number;
  maxTextLength?: number;
}

export interface ExtractionResult {
  success: boolean;
  content?: PageContent;
  error?: string;
  confidence: number;
  extractorUsed: string;
}

class ArticleExtractor {
  private readonly name = 'article-extractor';
  private readonly minContentLength = 100;
  private readonly maxContentLength = 100000;

  public async extract(
    html: string, 
    url: string, 
    options: ExtractionOptions = {}
  ): Promise<ExtractionResult> {
    try {
      logger.debug('Starting article extraction', { url, htmlLength: html.length });

      // Validate input
      if (!html || html.trim().length === 0) {
        throw new ContentExtractionError('HTML content is empty');
      }

      if (!url) {
        throw new ContentExtractionError('URL is required');
      }

      // Create DOM from HTML
      const dom = new JSDOM(html, { url });
      const document = dom.window.document;

      // Extract JSON-LD data BEFORE Readability processing (which removes script tags)
      const jsonLdData = this.extractJsonLd(document);

      // Use Readability for content extraction
      const reader = new Readability(document, {
        debug: false,
        maxElemsToParse: 0, // No limit
        nbTopCandidates: 5,
        charThreshold: options.minTextLength || this.minContentLength,
        classesToPreserve: ['highlight', 'important', 'note']
      });

      const article = reader.parse();

      if (!article) {
        return {
          success: false,
          error: 'Readability failed to extract article content',
          confidence: 0,
          extractorUsed: this.name
        };
      }

      // Extract metadata (pass pre-extracted JSON-LD data)
      const metadata = this.extractMetadata(document, jsonLdData);

      // Clean and process text content
      let textContent = article.textContent || '';
      
      // Apply length constraints
      if (options.maxTextLength && textContent.length > options.maxTextLength) {
        textContent = textContent.substring(0, options.maxTextLength) + '...';
      }

      // Check minimum length
      const minLength = options.minTextLength || this.minContentLength;
      if (textContent.length < minLength) {
        // If content is extremely short (less than 50 characters), treat as Readability failure
        if (textContent.length < 50) {
          return {
            success: false,
            error: 'Readability failed to extract meaningful content',
            confidence: 0,
            extractorUsed: this.name
          };
        }
        
        return {
          success: false,
          error: 'Extracted content is too short',
          confidence: 0.3,
          extractorUsed: this.name
        };
      }

      // Process HTML content
      let htmlContent = article.content || '';
      
      // Remove images if not requested
      if (!options.includeImages) {
        htmlContent = htmlContent.replace(/<img[^>]*>/gi, '');
      }

      // Remove links if not requested
      if (!options.includeLinks) {
        htmlContent = htmlContent.replace(/<a[^>]*>(.*?)<\/a>/gi, '$1');
      }

      // Calculate confidence score
      const confidence = this.calculateConfidence(article, textContent, metadata);

      const content: PageContent = {
        url,
        title: article.title || this.extractTitleFromMetadata(document) || 'Untitled',
        text: textContent,
        html: htmlContent,
        metadata: {
          ...metadata,
          readingTime: this.calculateReadingTime(textContent),
          wordCount: this.countWords(textContent)
        },
        extractedAt: new Date(),
        extractorUsed: this.name
      };

      logger.info('Article extraction successful', {
        url,
        title: content.title,
        textLength: content.text.length,
        confidence,
        readingTime: content.metadata.readingTime
      });

      return {
        success: true,
        content,
        confidence,
        extractorUsed: this.name
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (logger && typeof logger.error === 'function') {
        logger.error('Article extraction failed', { url, error: errorMessage });
      } else {
        console.error('Article extraction failed:', { url, error: errorMessage });
      }
      
      return {
        success: false,
        error: error.message,
        confidence: 0,
        extractorUsed: this.name
      };
    }
  }

  public canExtract(html: string, url: string): boolean {
    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Check for article indicators
      const articleIndicators = [
        'article',
        '[role="article"]',
        '.article',
        '.post',
        '.content',
        'main',
        '.main-content'
      ];

      for (const selector of articleIndicators) {
        if (document.querySelector(selector)) {
          return true;
        }
      }

      // Check for paragraph content
      const paragraphs = document.querySelectorAll('p');
      if (paragraphs.length >= 3) {
        const totalText = Array.from(paragraphs)
          .map(p => p.textContent || '')
          .join(' ');
        
        return totalText.length >= this.minContentLength;
      }

      return false;
    } catch (error) {
      logger.warn('Error checking extraction capability', { url, error: error.message });
      return false;
    }
  }

  private extractMetadata(document: Document, jsonLdData?: any): PageMetadata {
    const getMetaContent = (selector: string): string | undefined => {
      const element = document.querySelector(selector);
      return element?.getAttribute('content') || undefined;
    };

    const getTextContent = (selector: string): string | undefined => {
      const element = document.querySelector(selector);
      return element?.textContent?.trim() || undefined;
    };

    // Extract JSON-LD structured data (passed as parameter now)
    // If not provided, fall back to extracting from document
    if (!jsonLdData) {
      jsonLdData = this.extractJsonLd(document);
    }

    return {
      author: jsonLdData?.author?.name || 
              getMetaContent('meta[name="author"]') ||
              getMetaContent('meta[property="article:author"]') ||
              getTextContent('.author, .byline, [rel="author"]'),
      
      publishDate: this.parseDate(
        jsonLdData?.datePublished ||
        getMetaContent('meta[property="article:published_time"]') ||
        getMetaContent('meta[name="date"]') ||
        getMetaContent('meta[name="publish_date"]')
      ),
      
      description: getMetaContent('meta[name="description"]') ||
                  getMetaContent('meta[property="og:description"]') ||
                  getMetaContent('meta[name="twitter:description"]'),
      
      keywords: this.extractKeywords(
        getMetaContent('meta[name="keywords"]') ||
        getMetaContent('meta[property="article:tag"]')
      ),
      
      language: document.documentElement.lang ||
               getMetaContent('meta[name="language"]') ||
               'en'
    };
  }

  private extractTitleFromMetadata(document: Document): string | undefined {
    const selectors = [
      'title',
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'h1',
      '.title',
      '.headline'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const content = element.getAttribute('content') || element.textContent;
        if (content && content.trim().length > 0) {
          return content.trim();
        }
      }
    }

    return undefined;
  }

  private extractJsonLd(document: Document): any {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    
    for (const script of Array.from(scripts)) {
      try {
        const data = JSON.parse(script.textContent || '');
        
        // Handle array of structured data
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item['@type'] === 'Article' || item['@type'] === 'NewsArticle') {
              return item;
            }
          }
        } else if (data['@type'] === 'Article' || data['@type'] === 'NewsArticle') {
          return data;
        }
      } catch (error) {
        // Ignore parsing errors
        continue;
      }
    }

    return null;
  }

  private extractKeywords(keywordsString?: string): string[] {
    if (!keywordsString) {
      return [];
    }

    return keywordsString
      .split(/[,;]/)
      .map(keyword => keyword.trim())
      .filter(keyword => keyword.length > 0);
  }

  private parseDate(dateString?: string): Date | undefined {
    if (!dateString) {
      return undefined;
    }

    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? undefined : date;
    } catch (error) {
      return undefined;
    }
  }

  private calculateReadingTime(text: string): number {
    const wordsPerMinute = 200;
    const wordCount = this.countWords(text);
    return Math.ceil(wordCount / wordsPerMinute);
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  private calculateConfidence(
    article: any, 
    textContent: string, 
    metadata: PageMetadata
  ): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence based on content length
    if (textContent.length > 500) confidence += 0.1;
    if (textContent.length > 1000) confidence += 0.1;
    if (textContent.length > 2000) confidence += 0.1;

    // Boost confidence if we have good metadata
    if (metadata.author) confidence += 0.1;
    if (metadata.publishDate) confidence += 0.1;
    if (metadata.description) confidence += 0.05;

    // Boost confidence based on article structure
    if (article.title && article.title.length > 10) confidence += 0.1;
    if (article.byline) confidence += 0.05;

    // Penalize if content seems too short or too long
    if (textContent.length < 200) confidence -= 0.2;
    if (textContent.length > 50000) confidence -= 0.1;

    return Math.min(Math.max(confidence, 0), 1);
  }
}

export const articleExtractor = new ArticleExtractor();
export default articleExtractor;