// Test file to verify all imports work correctly
import { pageController } from './core/browser/page-controller';
import { playwrightManager } from './core/browser/playwright-manager';
import { claudeClient } from './core/ai/claude-client';
import { contentSummarizer } from './core/content/processors/summarizer';
import { articleExtractor } from './core/content/extractors/article-extractor';
import { taskExecutor } from './core/tasks/task-executor';
import { searchExecutor } from './core/tasks/executors/search-executor';
import logger from './core/utils/logger';
import config from './core/utils/config';
import validator from './core/utils/validator';

// Test basic functionality
async function testBuild() {
    try {
        logger.info('Testing SmartBrowser build...');
        
        // Test config
        const appConfig = config.get();
        console.log('Config loaded:', { port: appConfig.port, nodeEnv: appConfig.nodeEnv });
        
        // Test validator
        const testUrl = 'https://example.com';
        const validatedUrl = validator.validateUrl(testUrl);
        console.log('URL validation passed:', validatedUrl);
        
        // Test browser stats (without initializing)
        const browserStats = playwrightManager.getStats();
        console.log('Browser stats:', browserStats);
        
        // Test task executor
        const availableExecutors = taskExecutor.getAvailableExecutors();
        console.log('Available executors:', availableExecutors);
        
        console.log('✅ Build test completed successfully!');
        return true;
    } catch (error) {
        console.error('❌ Build test failed:', error);
        return false;
    }
}

// Export for testing
export { testBuild };

// Run if this file is executed directly
if (require.main === module) {
    testBuild().then(success => {
        process.exit(success ? 0 : 1);
    });
}