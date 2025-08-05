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

async function testExtraction() {
  const url = 'https://example.com/article';
  
  console.log('Testing article extraction with TypeScript extractor...');
  const result = await articleExtractor.extract(validArticleHtml, url);
  
  console.log('Result:', {
    success: result.success,
    error: result.error,
    confidence: result.confidence,
    extractorUsed: result.extractorUsed,
    contentLength: result.content?.text?.length || 0,
    title: result.content?.title,
    textPreview: result.content?.text?.substring(0, 100) + '...'
  });
}

testExtraction().catch(console.error);
