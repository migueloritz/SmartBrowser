import { articleExtractor } from './src/core/content/extractors/article-extractor';

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

async function debugExtraction() {
  console.log('Testing article extraction...');
  console.log('HTML length:', validArticleHtml.length);
  
  try {
    const result = await articleExtractor.extract(validArticleHtml, 'https://example.com/test');
    console.log('Extraction result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Extraction error:', error);
  }
}

debugExtraction();
