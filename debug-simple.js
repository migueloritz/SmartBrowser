// Simple debug script to test article extraction without complex imports
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

function debugExtraction() {
  console.log('Testing article extraction...');
  console.log('HTML length:', validArticleHtml.length);
  
  try {
    // Create DOM from HTML
    const dom = new JSDOM(validArticleHtml, { url: 'https://example.com/test' });
    const document = dom.window.document;

    console.log('Document created successfully');
    console.log('Document body:', document.body ? 'Found' : 'Not found');

    // Try Readability extraction
    const reader = new Readability(document, {
      debug: false,
      maxElemsToParse: 0,
      nbTopCandidates: 5,
      charThreshold: 25,
      classesToPreserve: ['highlight', 'important', 'note']
    });

    const article = reader.parse();
    
    console.log('Readability result:', {
      success: !!article,
      title: article?.title,
      textLength: article?.textContent?.length || 0,
      htmlLength: article?.content?.length || 0
    });

    if (article) {
      console.log('Article title:', article.title);
      console.log('Article text (first 200 chars):', article.textContent?.substring(0, 200));
      console.log('Article text length:', article.textContent?.length);
    } else {
      console.log('Readability failed to extract article');
    }

  } catch (error) {
    console.error('Extraction error:', error);
  }
}

debugExtraction();
