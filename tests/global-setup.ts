import { createClient } from 'redis';

export default async function globalSetup() {
  console.log('Setting up global test environment...');

  // Start Redis for integration tests (if not running)
  try {
    const redis = createClient({ url: process.env.REDIS_URL });
    await redis.connect();
    await redis.ping();
    await redis.disconnect();
    console.log('Redis connection verified');
  } catch (error) {
    console.warn('Redis not available, skipping Redis-dependent tests');
  }

  // Create test directories
  const fs = require('fs');
  const path = require('path');
  
  const testDirs = [
    'tests/fixtures',
    'tests/fixtures/pages',
    'tests/fixtures/mock-responses',
    'coverage'
  ];

  for (const dir of testDirs) {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }

  // Generate mock test pages
  const mockPages = {
    'article.html': `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Article</title>
        <meta name="author" content="Test Author">
        <meta name="description" content="A test article for content extraction">
      </head>
      <body>
        <article>
          <h1>Test Article Title</h1>
          <p class="byline">By Test Author</p>
          <div class="content">
            <p>This is the first paragraph of the test article. It contains meaningful content that should be extracted by our content processors.</p>
            <p>This is the second paragraph with more content. It helps test the extraction quality and accuracy of our system.</p>
            <p>The third paragraph includes some <strong>bold text</strong> and <em>italic text</em> to test formatting preservation.</p>
          </div>
        </article>
      </body>
      </html>
    `,
    'ecommerce.html': `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Product - Online Store</title>
      </head>
      <body>
        <div class="product">
          <h1>Test Product Name</h1>
          <div class="price">$99.99</div>
          <div class="description">
            <p>This is a test product description used for testing e-commerce extraction capabilities.</p>
          </div>
          <div class="reviews">
            <div class="review">
              <span class="rating">5 stars</span>
              <p>Great product! Highly recommended.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    'search-results.html': `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Search Results</title>
      </head>
      <body>
        <div class="search-results">
          <div class="result">
            <h3><a href="https://example.com/result1">First Search Result</a></h3>
            <p>Description of the first search result for testing purposes.</p>
          </div>
          <div class="result">
            <h3><a href="https://example.com/result2">Second Search Result</a></h3>
            <p>Description of the second search result for testing purposes.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  for (const [filename, content] of Object.entries(mockPages)) {
    const filePath = path.join(process.cwd(), 'tests/fixtures/pages', filename);
    fs.writeFileSync(filePath, content.trim());
  }

  // Generate mock API responses
  const mockResponses = {
    'claude-summarization.json': {
      id: 'msg_test123',
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'text',
        text: 'This is a test summary of the article content. The key points include important information about the topic and relevant details for the user.'
      }],
      model: 'claude-3-sonnet-20240229',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 150,
        output_tokens: 75
      }
    },
    'claude-goal-parsing.json': {
      id: 'msg_test456',
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'text',
        text: JSON.stringify({
          intent: {
            type: 'booking',
            confidence: 0.95,
            parameters: {
              location: 'Paris',
              type: 'hotel',
              checkIn: '2024-02-15',
              checkOut: '2024-02-17'
            }
          },
          entities: [
            {
              type: 'location',
              value: 'Paris',
              confidence: 0.98,
              start: 15,
              end: 20
            }
          ],
          steps: [
            'Navigate to hotel booking website',
            'Search for hotels in Paris',
            'Filter results by date range',
            'Extract hotel options and prices'
          ]
        })
      }],
      model: 'claude-3-sonnet-20240229',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 200,
        output_tokens: 120
      }
    }
  };

  for (const [filename, content] of Object.entries(mockResponses)) {
    const filePath = path.join(process.cwd(), 'tests/fixtures/mock-responses', filename);
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  }

  console.log('Global test setup completed');
}