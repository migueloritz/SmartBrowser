import { jest } from '@jest/globals';
import { articleExtractor } from '../../../../../src/core/content/extractors/article-extractor';
import { ContentExtractionError } from '../../../../../src/types';

describe('ArticleExtractor', () => {
  // Using the shared instance directly

  beforeEach(() => {
    // Reset any mocks
    jest.clearAllMocks();
  });

  describe('extract', () => {
    const validArticleHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Test Article Title</title>
        <meta name="author" content="Test Author">
        <meta name="description" content="This is a test article">
        <meta name="publish_date" content="2024-01-15">
        <meta name="keywords" content="test, article, content">
      </head>
      <body>
        <article>
          <h1>Test Article Title</h1>
          <div class="byline">By Test Author</div>
          <div class="content">
            <p>This is the first paragraph of the test article. It contains meaningful content that should be extracted by our content processors.</p>
            <p>This is the second paragraph with more content. It helps test the extraction quality and accuracy of our system.</p>
            <p>The third paragraph includes some important information about the topic being discussed.</p>
            <p>A fourth paragraph ensures we have enough content to meet the minimum length requirements for proper extraction.</p>
          </div>
        </article>
      </body>
      </html>
    `;

    it('should extract article content successfully', async () => {
      const url = 'https://example.com/article';
      
      const result = await articleExtractor.extract(validArticleHtml, url);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content?.url).toBe(url);
      expect(result.content?.title).toBe('Test Article Title');
      expect(result.content?.text).toContain('first paragraph');
      expect(result.content?.text).toContain('second paragraph');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.extractorUsed).toBe('article-extractor');
    });

    it('should extract metadata correctly', async () => {
      const url = 'https://example.com/article';
      
      const result = await articleExtractor.extract(validArticleHtml, url);

      expect(result.success).toBe(true);
      expect(result.content?.metadata).toEqual(
        expect.objectContaining({
          author: 'Test Author',
          description: 'This is a test article',
          keywords: ['test', 'article', 'content'],
          language: 'en',
          readingTime: expect.any(Number),
          wordCount: expect.any(Number)
        })
      );
      expect(result.content?.metadata.publishDate).toBeValidDate();
    });

    it('should calculate reading time and word count', async () => {
      const url = 'https://example.com/article';
      
      const result = await articleExtractor.extract(validArticleHtml, url);

      expect(result.success).toBe(true);
      expect(result.content?.metadata.wordCount).toBeGreaterThan(0);
      expect(result.content?.metadata.readingTime).toBeGreaterThan(0);
      expect(typeof result.content?.metadata.readingTime).toBe('number');
      expect(typeof result.content?.metadata.wordCount).toBe('number');
    });

    it('should handle extraction options', async () => {
      const htmlWithImages = `
        <!DOCTYPE html>
        <html>
        <body>
          <article>
            <h1>Article with Images</h1>
            <p>This article contains images and links.</p>
            <img src="test.jpg" alt="Test image">
            <p>Some more content with <a href="https://example.com">a link</a>.</p>
          </article>
        </body>
        </html>
      `;

      const options = {
        includeImages: false,
        includeLinks: false,
        minTextLength: 50,
        maxTextLength: 500
      };

      const result = await articleExtractor.extract(htmlWithImages, 'https://example.com', options);

      expect(result.success).toBe(true);
      expect(result.content?.html).not.toContain('<img');
      expect(result.content?.html).not.toContain('<a href');
      expect(result.content?.text.length).toBeLessThanOrEqual(500);
    });

    it('should handle articles with JSON-LD structured data', async () => {
      const htmlWithJsonLd = `
        <!DOCTYPE html>
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@type": "Article",
            "author": {
              "name": "JSON-LD Author"
            },
            "datePublished": "2024-01-15T10:00:00Z"
          }
          </script>
        </head>
        <body>
          <article>
            <h1>Article with JSON-LD</h1>
            <p>This article has structured data.</p>
            <p>Additional content to meet minimum length requirements.</p>
          </article>
        </body>
        </html>
      `;

      const result = await articleExtractor.extract(htmlWithJsonLd, 'https://example.com');

      expect(result.success).toBe(true);
      expect(result.content?.metadata.author).toBe('JSON-LD Author');
      expect(result.content?.metadata.publishDate).toBeValidDate();
    });

    it('should handle empty or invalid HTML', async () => {
      const result = await articleExtractor.extract('', 'https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTML content is empty');
      expect(result.confidence).toBe(0);
    });

    it('should handle missing URL', async () => {
      const result = await articleExtractor.extract(validArticleHtml, '');

      expect(result.success).toBe(false);
      expect(result.error).toContain('URL is required');
      expect(result.confidence).toBe(0);
    });

    it('should handle content that is too short', async () => {
      const shortHtml = `
        <!DOCTYPE html>
        <html>
        <body>
          <article>
            <h1>Short</h1>
            <p>Too short.</p>
          </article>
        </body>
        </html>
      `;

      const result = await articleExtractor.extract(shortHtml, 'https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('too short');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle Readability parsing failure', async () => {
      const invalidHtml = `
        <!DOCTYPE html>
        <html>
        <body>
          <div>No article structure</div>
          <span>Random content</span>
        </body>
        </html>
      `;

      const result = await articleExtractor.extract(invalidHtml, 'https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Readability failed');
      expect(result.confidence).toBe(0);
    });

    it('should handle extraction with custom length limits', async () => {
      const longText = 'Lorem ipsum '.repeat(1000); // Very long content
      const longHtml = `
        <!DOCTYPE html>
        <html>
        <body>
          <article>
            <h1>Long Article</h1>
            <p>${longText}</p>
          </article>
        </body>
        </html>
      `;

      const options = {
        maxTextLength: 100
      };

      const result = await articleExtractor.extract(longHtml, 'https://example.com', options);

      expect(result.success).toBe(true);
      expect(result.content?.text.length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(result.content?.text).toContain('...');
    });
  });

  describe('canExtract', () => {
    it('should return true for content with article structure', () => {
      const html = `
        <html>
        <body>
          <article>
            <h1>Article Title</h1>
            <p>First paragraph.</p>
            <p>Second paragraph.</p>
            <p>Third paragraph.</p>
          </article>
        </body>
        </html>
      `;

      const canExtract = articleExtractor.canExtract(html, 'https://example.com');

      expect(canExtract).toBe(true);
    });

    it('should return true for content with article class', () => {
      const html = `
        <html>
        <body>
          <div class="article">
            <h1>Article Title</h1>
            <p>First paragraph.</p>
            <p>Second paragraph.</p>
            <p>Third paragraph.</p>
          </div>
        </body>
        </html>
      `;

      const canExtract = articleExtractor.canExtract(html, 'https://example.com');

      expect(canExtract).toBe(true);
    });

    it('should return true for content with enough paragraphs', () => {
      const html = `
        <html>
        <body>
          <div>
            <p>This is a paragraph with substantial content that meets the minimum length requirement.</p>
            <p>This is another paragraph with more content to ensure we have enough text.</p>
            <p>A third paragraph to meet the minimum paragraph count requirement for extraction.</p>
          </div>
        </body>
        </html>
      `;

      const canExtract = articleExtractor.canExtract(html, 'https://example.com');

      expect(canExtract).toBe(true);
    });

    it('should return false for content without article structure', () => {
      const html = `
        <html>
        <body>
          <div>
            <span>Short content</span>
          </div>
        </body>
        </html>
      `;

      const canExtract = articleExtractor.canExtract(html, 'https://example.com');

      expect(canExtract).toBe(false);
    });

    it('should return false for content with too few paragraphs', () => {
      const html = `
        <html>
        <body>
          <div>
            <p>Only one paragraph.</p>
            <p>Only two paragraphs.</p>
          </div>
        </body>
        </html>
      `;

      const canExtract = articleExtractor.canExtract(html, 'https://example.com');

      expect(canExtract).toBe(false);
    });

    it('should handle malformed HTML gracefully', () => {
      const html = '<html><body><div>Incomplete HTML';

      const canExtract = articleExtractor.canExtract(html, 'https://example.com');

      expect(canExtract).toBe(false);
    });

    it('should handle empty HTML', () => {
      const canExtract = articleExtractor.canExtract('', 'https://example.com');

      expect(canExtract).toBe(false);
    });
  });

  describe('metadata extraction', () => {
    it('should extract author from various sources', async () => {
      const htmlWithAuthor = `
        <html>
        <head>
          <meta name="author" content="Meta Author">
        </head>
        <body>
          <article>
            <h1>Test Article</h1>
            <div class="author">HTML Author</div>
            <p>Article content with enough text to meet minimum requirements.</p>
          </article>
        </body>
        </html>
      `;

      const result = await articleExtractor.extract(htmlWithAuthor, 'https://example.com');

      expect(result.success).toBe(true);
      expect(result.content?.metadata.author).toBe('Meta Author'); // Meta tag takes precedence
    });

    it('should extract publish date from various formats', async () => {
      const htmlWithDate = `
        <html>
        <head>
          <meta name="publish_date" content="2024-01-15T10:30:00Z">
        </head>
        <body>
          <article>
            <h1>Test Article</h1>
            <p>Article content with enough text to meet minimum requirements.</p>
          </article>
        </body>
        </html>
      `;

      const result = await articleExtractor.extract(htmlWithDate, 'https://example.com');

      expect(result.success).toBe(true);
      expect(result.content?.metadata.publishDate).toBeValidDate();
    });

    it('should extract keywords and split them correctly', async () => {
      const htmlWithKeywords = `
        <html>
        <head>
          <meta name="keywords" content="javascript, programming, web development, tutorial">
        </head>
        <body>
          <article>
            <h1>Test Article</h1>
            <p>Article content with enough text to meet minimum requirements.</p>
          </article>
        </body>
        </html>
      `;

      const result = await articleExtractor.extract(htmlWithKeywords, 'https://example.com');

      expect(result.success).toBe(true);
      expect(result.content?.metadata.keywords).toEqual([
        'javascript',
        'programming',
        'web development',
        'tutorial'
      ]);
    });

    it('should handle malformed JSON-LD gracefully', async () => {
      const htmlWithBadJsonLd = `
        <html>
        <head>
          <script type="application/ld+json">
          { invalid json syntax
          </script>
        </head>
        <body>
          <article>
            <h1>Test Article</h1>
            <p>Article content with enough text to meet minimum requirements.</p>
          </article>
        </body>
        </html>
      `;

      const result = await articleExtractor.extract(htmlWithBadJsonLd, 'https://example.com');

      expect(result.success).toBe(true);
      // Should still extract other metadata despite JSON-LD error
    });
  });

  describe('confidence calculation', () => {
    it('should increase confidence for longer content', async () => {
      const shortContent = `
        <html>
        <body>
          <article>
            <h1>Short Article</h1>
            <p>This is a short article with minimal content but enough to meet the basic requirements.</p>
          </article>
        </body>
        </html>
      `;

      const longContent = `
        <html>
        <body>
          <article>
            <h1>Long Article</h1>
            <p>${'This is a very long article with extensive content. '.repeat(100)}</p>
          </article>
        </body>
        </html>
      `;

      const shortResult = await articleExtractor.extract(shortContent, 'https://example.com');
      const longResult = await articleExtractor.extract(longContent, 'https://example.com');

      expect(shortResult.success).toBe(true);
      expect(longResult.success).toBe(true);
      expect(longResult.confidence).toBeGreaterThan(shortResult.confidence);
    });

    it('should increase confidence for good metadata', async () => {
      const withMetadata = `
        <html>
        <head>
          <meta name="author" content="John Doe">
          <meta name="description" content="A comprehensive guide">
          <meta name="publish_date" content="2024-01-15">
        </head>
        <body>
          <article>
            <h1>Article with Great Metadata</h1>
            <div class="byline">By John Doe</div>
            <p>This article has excellent metadata and should score higher confidence.</p>
            <p>Additional content to ensure we meet the minimum length requirements.</p>
          </article>
        </body>
        </html>
      `;

      const withoutMetadata = `
        <html>
        <body>
          <article>
            <h1>Article without Metadata</h1>
            <p>This article has minimal metadata and should score lower confidence.</p>
            <p>Additional content to ensure we meet the minimum length requirements.</p>
          </article>
        </body>
        </html>
      `;

      const withResult = await articleExtractor.extract(withMetadata, 'https://example.com');
      const withoutResult = await articleExtractor.extract(withoutMetadata, 'https://example.com');

      expect(withResult.success).toBe(true);
      expect(withoutResult.success).toBe(true);
      expect(withResult.confidence).toBeGreaterThan(withoutResult.confidence);
    });

    it('should penalize very short content', async () => {
      const veryShortContent = `
        <html>
        <body>
          <article>
            <h1>Title</h1>
            <p>Very short content that barely meets minimum requirements for extraction.</p>
          </article>
        </body>
        </html>
      `;

      const result = await articleExtractor.extract(veryShortContent, 'https://example.com');

      expect(result.success).toBe(true);
      expect(result.confidence).toBeLessThan(0.7);
    });
  });

  describe('error handling', () => {
    it('should handle JSDOM errors gracefully', async () => {
      // Mock JSDOM to throw an error
      const originalJSDOM = require('jsdom').JSDOM;
      require('jsdom').JSDOM = jest.fn().mockImplementation(() => {
        throw new Error('JSDOM initialization failed');
      });

      const result = await articleExtractor.extract('<html></html>', 'https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('JSDOM initialization failed');
      expect(result.confidence).toBe(0);

      // Restore original JSDOM
      require('jsdom').JSDOM = originalJSDOM;
    });

    it('should handle Readability errors gracefully', async () => {
      // Create HTML that might cause Readability to fail
      const problematicHtml = `
        <html>
        <body>
          <div>${'<span>'.repeat(10000)}</div>
        </body>
        </html>
      `;

      const result = await articleExtractor.extract(problematicHtml, 'https://example.com');

      // Should handle the error gracefully
      expect(result.success).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('title extraction fallback', () => {
    it('should use title tag as fallback', async () => {
      const html = `
        <html>
        <head>
          <title>Fallback Title from Title Tag</title>
        </head>
        <body>
          <article>
            <p>Article content without explicit title in article tag.</p>
            <p>Additional content to meet minimum requirements.</p>
          </article>
        </body>
        </html>
      `;

      const result = await articleExtractor.extract(html, 'https://example.com');

      expect(result.success).toBe(true);
      expect(result.content?.title).toBe('Fallback Title from Title Tag');
    });

    it('should use og:title as fallback', async () => {
      const html = `
        <html>
        <head>
          <meta property="og:title" content="OpenGraph Title">
        </head>
        <body>
          <article>
            <p>Article content without explicit title.</p>
            <p>Additional content to meet minimum requirements.</p>
          </article>
        </body>
        </html>
      `;

      const result = await articleExtractor.extract(html, 'https://example.com');

      expect(result.success).toBe(true);
      expect(result.content?.title).toBe('OpenGraph Title');
    });

    it('should use Untitled as final fallback', async () => {
      const html = `
        <html>
        <body>
          <article>
            <p>Article content without any title metadata.</p>
            <p>Additional content to meet minimum requirements.</p>
          </article>
        </body>
        </html>
      `;

      const result = await articleExtractor.extract(html, 'https://example.com');

      expect(result.success).toBe(true);
      expect(result.content?.title).toBe('Untitled');
    });
  });
});