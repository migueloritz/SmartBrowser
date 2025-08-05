import { ArticleExtractor } from './src/core/content/extractors/article-extractor.js';

const testHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Test Article Title</title>
  <meta name="author" content="Test Author">
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
  const extractor = new ArticleExtractor();
  try {
    const result = await extractor.extract(testHtml, 'https://example.com/article');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

debugExtraction();
