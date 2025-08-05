import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import { 
  UserGoal, 
  Task, 
  PageContent,
  ApiResponse,
  ValidationError,
  SmartBrowserError 
} from './types';
import { pageController } from './core/browser/page-controller';
import { contentSummarizer } from './core/content/processors/summarizer';
import { taskExecutor } from './core/tasks/task-executor';
import { articleExtractor } from './core/content/extractors/article-extractor';
import { playwrightManager } from './core/browser/playwright-manager';
import logger from './core/utils/logger';
import config from './core/utils/config';
import validator from './core/utils/validator';

interface SummarizeRequest {
  url: string;
  options?: {
    maxLength?: 'brief' | 'detailed' | 'comprehensive';
    format?: 'paragraph' | 'bullets' | 'structured';
    focus?: string[];
  };
}

interface GoalRequest {
  goal: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  context?: {
    currentUrl?: string;
  };
}

/**
 * Main SmartBrowser application server
 * Provides web API endpoints for browser automation and AI-powered content analysis
 */
class SmartBrowserApp {
  public app: express.Application;
  private server?: any;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Rate limiting middleware to prevent abuse
   * @returns Express middleware function
   */
  private rateLimitMiddleware(): express.RequestHandler {
    const requestCounts = new Map<string, { count: number; resetTime: number }>();
    const maxRequests = 100; // requests per window
    const windowMs = 15 * 60 * 1000; // 15 minutes

    return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
      const clientId = req.ip || 'unknown';
      const now = Date.now();
      
      const clientData = requestCounts.get(clientId) || { count: 0, resetTime: now + windowMs };
      
      // Reset count if window has expired
      if (now > clientData.resetTime) {
        clientData.count = 0;
        clientData.resetTime = now + windowMs;
      }
      
      clientData.count++;
      requestCounts.set(clientId, clientData);
      
      if (clientData.count > maxRequests) {
        logger.warn('Rate limit exceeded', { clientId, count: clientData.count });
        res.status(429).json({
          success: false,
          error: 'Too many requests. Please try again later.',
          timestamp: new Date()
        });
        return;
      }
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - clientData.count));
      res.setHeader('X-RateLimit-Reset', new Date(clientData.resetTime).toISOString());
      
      next();
    };
  }

  /**
   * Configure Express middleware for security, CORS, parsing, and logging
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https://api.anthropic.com"]
        }
      }
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? ['chrome-extension://*'] 
        : ['http://localhost:*', 'chrome-extension://*'],
      credentials: true
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Simple rate limiting middleware
    this.app.use(this.rateLimitMiddleware());

    // Request logging
    this.app.use((req, res, next) => {
      logger.http('Incoming request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
      next();
    });
  }

  /**
   * Configure API routes and endpoint handlers
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', async (req, res) => {
      try {
        const healthCheck = await taskExecutor.healthCheck();
        const browserStats = playwrightManager.getStats();
        
        res.json({
          success: true,
          data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            browser: browserStats,
            executors: healthCheck
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Health check failed',
          timestamp: new Date().toISOString()
        });
      }
    });

    // MVP Route 1: Summarize a webpage
    this.app.post('/api/summarize', async (req, res) => {
      try {
        const { url, options = {} }: SummarizeRequest = req.body;
        
        if (!url) {
          throw new ValidationError('URL is required');
        }

        if (typeof url !== 'string') {
          throw new ValidationError('URL must be a string');
        }

        // Validate and sanitize options
        if (options && typeof options !== 'object') {
          throw new ValidationError('Options must be an object');
        }

        const validatedUrl = validator.validateUrl(url);
        const userId = req.headers['x-user-id'] as string || 'anonymous';

        // Sanitize userId
        const sanitizedUserId = validator.sanitizeString(userId);

        logger.info('Summarization request received', { 
          url: validatedUrl, 
          userId: sanitizedUserId,
          options 
        });

        // Create page session and navigate to URL
        const sessionId = await pageController.createPageSession(sanitizedUserId, validatedUrl);
        
        try {
          // Get page content
          const pageContent = await pageController.getPageContent(sessionId);
          
          // Extract article content if possible
          let extractedContent = pageContent;
          const extraction = await articleExtractor.extract(
            pageContent.html, 
            pageContent.url
          );
          
          if (extraction.success && extraction.content) {
            extractedContent = extraction.content;
          }

          // Summarize content
          const summaryResult = await contentSummarizer.summarize({
            content: extractedContent,
            options,
            userId
          });

          if (!summaryResult.success) {
            throw new Error(summaryResult.error || 'Summarization failed');
          }

          const response: ApiResponse = {
            success: true,
            data: {
              summary: summaryResult.summary,
              processingTime: summaryResult.processingTime,
              extraction: {
                success: extraction.success,
                confidence: extraction.confidence,
                extractor: extraction.extractorUsed
              },
              pageInfo: {
                url: pageContent.url,
                title: pageContent.title,
                wordCount: pageContent.metadata.wordCount,
                readingTime: pageContent.metadata.readingTime
              }
            },
            timestamp: new Date()
          };

          logger.info('Summarization completed successfully', {
            url: validatedUrl,
            userId,
            processingTime: summaryResult.processingTime
          });

          res.json(response);

        } finally {
          // Clean up session
          await pageController.closeSession(sessionId);
        }

      } catch (error) {
        logger.error('Summarization request failed', error);
        
        const response: ApiResponse = {
          success: false,
          error: error.message,
          timestamp: new Date()
        };

        if (error instanceof ValidationError) {
          res.status(400).json(response);
        } else {
          res.status(500).json(response);
        }
      }
    });

    // MVP Route 2: Execute a goal/prompt
    this.app.post('/api/execute-goal', async (req, res) => {
      try {
        const { goal, priority = 'medium', context = {} }: GoalRequest = req.body;
        
        if (!goal) {
          throw new ValidationError('Goal is required');
        }

        if (typeof goal !== 'string') {
          throw new ValidationError('Goal must be a string');
        }

        if (goal.trim().length === 0) {
          throw new ValidationError('Goal cannot be empty');
        }

        if (goal.length > 1000) {
          throw new ValidationError('Goal is too long (max 1000 characters)');
        }

        // Validate priority
        const validPriorities = ['low', 'medium', 'high', 'critical'];
        if (!validPriorities.includes(priority)) {
          throw new ValidationError('Invalid priority value');
        }

        // Validate context
        if (context && typeof context !== 'object') {
          throw new ValidationError('Context must be an object');
        }

        const userId = req.headers['x-user-id'] as string || 'anonymous';
        const sanitizedUserId = validator.sanitizeString(userId);
        const validatedGoal = validator.validateUserGoal({ text: goal, priority });

        logger.info('Goal execution request received', { 
          goal: validatedGoal.text,
          userId: sanitizedUserId,
          priority,
          context 
        });

        // Create user goal object
        const userGoal: UserGoal = {
          id: uuidv4(),
          userId: sanitizedUserId,
          text: validatedGoal.text,
          intent: {
            type: 'search', // Will be determined by Claude
            confidence: 0.5,
            parameters: {}
          },
          entities: [],
          priority: validatedGoal.priority,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Create execution context
        const executionContext = {
          userId: sanitizedUserId,
          sessionId: uuidv4(),
          goal: userGoal,
          currentUrl: context.currentUrl
        };

        // Execute goal
        const result = await taskExecutor.executeGoal(
          userGoal,
          executionContext,
          { priority: priority as any }
        );

        const response: ApiResponse = {
          success: result.success,
          data: {
            goalId: result.goalId,
            summary: result.summary,
            tasksExecuted: result.tasks.length,
            successfulTasks: result.tasks.filter(t => t.success).length,
            executionTime: result.executionTime,
            tasks: result.tasks.map(task => ({
              taskId: task.taskId,
              success: task.success,
              executor: task.executor,
              error: task.error,
              executionTime: task.executionTime
            }))
          },
          timestamp: new Date()
        };

        logger.info('Goal execution completed', {
          goalId: result.goalId,
          userId,
          success: result.success,
          tasksExecuted: result.tasks.length,
          executionTime: result.executionTime
        });

        res.json(response);

      } catch (error) {
        logger.error('Goal execution request failed', error);
        
        const response: ApiResponse = {
          success: false,
          error: error.message,
          timestamp: new Date()
        };

        if (error instanceof ValidationError) {
          res.status(400).json(response);
        } else {
          res.status(500).json(response);
        }
      }
    });

    // MVP Route 3: Get current page information
    this.app.get('/api/page-info', async (req, res) => {
      try {
        const { url } = req.query;
        
        if (!url || typeof url !== 'string') {
          throw new ValidationError('URL parameter is required and must be a string');
        }

        if (url.trim().length === 0) {
          throw new ValidationError('URL cannot be empty');
        }

        const validatedUrl = validator.validateUrl(url);
        const userId = req.headers['x-user-id'] as string || 'anonymous';
        const sanitizedUserId = validator.sanitizeString(userId);

        logger.info('Page info request received', { url: validatedUrl, userId: sanitizedUserId });

        // Create page session
        const sessionId = await pageController.createPageSession(sanitizedUserId, validatedUrl);
        
        try {
          // Get page content
          const pageContent = await pageController.getPageContent(sessionId);
          
          const response: ApiResponse = {
            success: true,
            data: {
              url: pageContent.url,
              title: pageContent.title,
              metadata: pageContent.metadata,
              contentLength: pageContent.text.length,
              extractedAt: pageContent.extractedAt,
              canSummarize: pageContent.text.length >= 100,
              canExtract: articleExtractor.canExtract(pageContent.html, pageContent.url)
            },
            timestamp: new Date()
          };

          res.json(response);

        } finally {
          await pageController.closeSession(sessionId);
        }

      } catch (error) {
        logger.error('Page info request failed', error);
        
        const response: ApiResponse = {
          success: false,
          error: error.message,
          timestamp: new Date()
        };

        if (error instanceof ValidationError) {
          res.status(400).json(response);
        } else {
          res.status(500).json(response);
        }
      }
    });

    // Get task history for a user
    this.app.get('/api/history', (req, res) => {
      try {
        const userId = req.headers['x-user-id'] as string || 'anonymous';
        const history = taskExecutor.getTaskHistory(userId);
        
        const response: ApiResponse = {
          success: true,
          data: {
            userId,
            totalTasks: history.length,
            recentTasks: history.slice(-10) // Last 10 tasks
          },
          timestamp: new Date()
        };

        res.json(response);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date()
        });
      }
    });

    // Get running tasks
    this.app.get('/api/running-tasks', (req, res) => {
      try {
        const runningTasks = taskExecutor.getRunningTasks();
        
        res.json({
          success: true,
          data: {
            count: runningTasks.length,
            tasks: runningTasks
          },
          timestamp: new Date()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date()
        });
      }
    });
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        timestamp: new Date()
      });
    });

    // Global error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error', error);
      
      if (res.headersSent) {
        return next(error);
      }

      let statusCode = 500;
      let message = 'Internal server error';

      if (error instanceof SmartBrowserError) {
        statusCode = error.statusCode;
        message = error.message;
      } else if (error instanceof ValidationError) {
        statusCode = 400;
        message = error.message;
      }

      res.status(statusCode).json({
        success: false,
        error: message,
        timestamp: new Date()
      });
    });
  }

  public async start(): Promise<void> {
    try {
      const port = config.get().port;
      
      // Initialize browser manager
      await playwrightManager.initialize();
      
      // Start periodic cleanup for browser resources
      playwrightManager.startPeriodicCleanup();
      
      // Start page controller cleanup interval
      pageController.startCleanupInterval();
      
      // Start server
      this.server = this.app.listen(port, () => {
        logger.info(`SmartBrowser server started`, { 
          port,
          env: config.get().nodeEnv,
          version: '1.0.0'
        });
        
        console.log(`\n🚀 SmartBrowser MVP is running!`);
        console.log(`📍 Server: http://localhost:${port}`);
        console.log(`🔍 Health: http://localhost:${port}/health`);
        console.log(`📖 API Documentation:`);
        console.log(`   POST /api/summarize - Summarize a webpage`);
        console.log(`   POST /api/execute-goal - Execute a user goal`);
        console.log(`   GET  /api/page-info - Get page information`);
        console.log(`\n💡 Example requests:`);
        console.log(`   curl -X POST http://localhost:${port}/api/summarize -H "Content-Type: application/json" -d '{"url":"https://example.com"}'`);
        console.log(`   curl -X POST http://localhost:${port}/api/execute-goal -H "Content-Type: application/json" -d '{"goal":"find news about AI"}'`);
        console.log(``);
      });

    } catch (error) {
      logger.error('Failed to start SmartBrowser server', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      logger.info('Shutting down SmartBrowser server...');
      
      // Stop accepting new connections
      if (this.server) {
        this.server.close();
      }
      
      // Cleanup resources
      await Promise.all([
        pageController.cleanup(),
        contentSummarizer.cleanup(),
        taskExecutor.cleanup(),
        playwrightManager.cleanup()
      ]);
      
      logger.info('SmartBrowser server shutdown completed');
    } catch (error) {
      logger.error('Error during server shutdown', error);
      throw error;
    }
  }
}

// Create and start the application
const smartBrowser = new SmartBrowserApp();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await smartBrowser.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await smartBrowser.stop();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

// Start the server if this file is run directly
if (require.main === module) {
  smartBrowser.start().catch((error) => {
    logger.error('Failed to start application', error);
    process.exit(1);
  });
}

export default smartBrowser;