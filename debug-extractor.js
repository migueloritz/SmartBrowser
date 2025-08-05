const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');

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

const url = 'https://example.com/article';

console.log('Testing article extraction...');
console.log('HTML length:', validArticleHtml.length);

// Create DOM from HTML
const dom = new JSDOM(validArticleHtml, { url });
const document = dom.window.document;

console.log('DOM created');

// Use Readability for content extraction
const reader = new Readability(document, {
  debug: false,
  maxElemsToParse: 0, // No limit
  nbTopCandidates: 5,
  charThreshold: 25, // Lower threshold to catch more content
  classesToPreserve: ['highlight', 'important', 'note']
});

console.log('Readability created');

const article = reader.parse();

console.log('Readability parsing result:', {
  success: !!article,
  title: article?.title,
  textLength: article?.textContent?.length || 0,
  htmlLength: article?.content?.length || 0,
  text: article?.textContent?.substring(0, 200) + '...'
});

if (!article) {
  console.log('Readability failed, trying fallback...');
  
  // Try fallback extraction
  const contentSelectors = [
    'article',
    '.content',
    '.post-content',
    '.entry-content',
    'main',
    '.main-content',
    '#content'
  ];

  let contentElement = null;
  for (const selector of contentSelectors) {
    contentElement = document.querySelector(selector);
    if (contentElement) {
      console.log(`Found content element with selector: ${selector}`);
      break;
    }
  }

  if (!contentElement) {
    contentElement = document.querySelector('body') || document.documentElement;
    console.log('No content selector matched, using body/documentElement');
  }

  const textContent = contentElement?.textContent?.trim() || '';
  console.log('Fallback extraction result:', {
    textLength: textContent.length,
    text: textContent.substring(0, 200) + '...'
  });
}
