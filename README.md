# SmartBrowser MVP

A browser automation assistant powered by Claude AI that can summarize web pages, understand user goals, and automate web tasks.

## 🚀 Features

- **Page Summarization**: Automatically extract and summarize content from any webpage
- **Goal Execution**: Natural language goal processing (e.g., "find hotels in Paris")
- **Intelligent Content Extraction**: Advanced article and content extraction using Readability.js
- **Browser Automation**: Powered by Playwright for reliable web automation
- **Chrome Extension**: Easy-to-use popup interface for immediate access
- **Context-Aware AI**: Claude AI integration for intelligent responses

## 📋 Prerequisites

- Node.js 18+ 
- Chrome browser for extension testing
- Claude API key from Anthropic

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd SmartBrowser
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install Playwright browsers**
   ```bash
   npx playwright install
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your configuration:
   ```env
   CLAUDE_API_KEY=your_claude_api_key_here
   PORT=3000
   NODE_ENV=development
   BROWSER_HEADLESS=true
   ```

5. **Build the project**
   ```bash
   npm run build
   ```

## 🎯 Quick Start

### 1. Start the Server

```bash
npm run dev
```

The server will start at `http://localhost:3000`

### 2. Load the Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `src/extension` folder
5. The SmartBrowser extension should now appear in your toolbar

### 3. Test the MVP

1. Navigate to any webpage (e.g., a news article)
2. Click the SmartBrowser extension icon
3. Try the available features:
   - **Summarize**: Click "Summarize This Page" to get an AI summary
   - **Goals**: Enter a goal like "find the latest AI news" and click execute
   - **History**: View your recent activity

## 📡 API Endpoints

### POST /api/summarize
Summarize a webpage
```json
{
  "url": "https://example.com",
  "options": {
    "maxLength": "detailed",
    "format": "structured"
  }
}
```

### POST /api/execute-goal
Execute a natural language goal
```json
{
  "goal": "find hotels in Paris for next weekend",
  "priority": "medium",
  "context": {
    "currentUrl": "https://booking.com"
  }
}
```

### GET /api/page-info?url=https://example.com
Get information about a webpage

### GET /api/health
Server health check

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## 🏗️ Architecture

```
SmartBrowser/
├── src/
│   ├── core/                 # Core business logic
│   │   ├── browser/         # Playwright browser automation
│   │   ├── ai/              # Claude AI integration
│   │   ├── content/         # Content extraction & processing
│   │   ├── tasks/           # Task execution engine
│   │   └── utils/           # Utilities (config, logging, validation)
│   ├── extension/           # Chrome extension
│   │   ├── popup/           # Extension popup UI
│   │   ├── background/      # Service worker
│   │   └── content/         # Content scripts
│   ├── types/               # TypeScript type definitions
│   └── index.ts            # Main application entry point
```

## ⚙️ Configuration

Key configuration options in `.env`:

- `CLAUDE_API_KEY`: Your Anthropic Claude API key
- `CLAUDE_MODEL`: Claude model to use (default: claude-3-sonnet-20241022)
- `PORT`: Server port (default: 3000)
- `BROWSER_HEADLESS`: Run browser in headless mode (default: true)
- `BROWSER_TIMEOUT`: Page load timeout in milliseconds (default: 30000)
- `LOG_LEVEL`: Logging level (default: info)

## 🔧 Development

### Build for Development
```bash
npm run dev
```

### Build for Production
```bash
npm run build
npm start
```

### Linting & Formatting
```bash
npm run lint
npm run lint:fix
npm run format
```

## 📝 Example Usage

### 1. Summarizing a News Article
```javascript
// Via API
const response = await fetch('http://localhost:3000/api/summarize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example-news.com/article',
    options: { maxLength: 'detailed', format: 'bullets' }
  })
});
```

### 2. Executing a Goal
```javascript
// Via API
const response = await fetch('http://localhost:3000/api/execute-goal', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    goal: 'Find the best restaurants in Tokyo',
    priority: 'high'
  })
});
```

## 🐛 Troubleshooting

### Server won't start
- Check that the Claude API key is set correctly
- Ensure port 3000 is not in use
- Verify all dependencies are installed

### Extension not working
- Check that the server is running at localhost:3000
- Ensure the extension is loaded in developer mode
- Check browser console for errors

### Playwright issues
- Run `npx playwright install` to ensure browsers are installed
- Check that Chromium can launch (disable headless mode for debugging)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [Playwright](https://playwright.dev/) for browser automation
- [Anthropic Claude](https://www.anthropic.com/) for AI capabilities
- [Mozilla Readability](https://github.com/mozilla/readability) for content extraction
- The open-source community for various tools and libraries

## 📧 Support

If you encounter any issues or have questions, please:
1. Check the troubleshooting section above
2. Search existing issues on GitHub
3. Create a new issue with detailed information about your problem

---

Built with ❤️ using TypeScript, Node.js, and Claude AI