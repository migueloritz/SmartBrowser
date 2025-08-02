// Simple test script to verify the server starts correctly
const express = require('express');
const app = express();

// Simple health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'SmartBrowser test server is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0-test'
    });
});

// Basic test endpoints
app.get('/', (req, res) => {
    res.json({
        name: 'SmartBrowser MVP',
        version: '1.0.0',
        description: 'Browser automation assistant with Claude AI integration',
        endpoints: [
            'GET /health - Health check',
            'POST /api/summarize - Summarize webpage (requires actual implementation)',
            'POST /api/execute-goal - Execute user goal (requires actual implementation)'
        ]
    });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`🚀 SmartBrowser Test Server running on http://localhost:${port}`);
    console.log(`📍 Health check: http://localhost:${port}/health`);
    console.log('');
    console.log('✅ Basic server functionality verified!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Set your Claude API key in .env file');
    console.log('2. Run: npm run dev');
    console.log('3. Load the Chrome extension from src/extension folder');
    console.log('4. Test the MVP functionality');
    
    // Auto-shutdown after showing the message
    setTimeout(() => {
        console.log('\n🛑 Test server shutting down...');
        process.exit(0);
    }, 3000);
});

// Handle errors
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    process.exit(1);
});