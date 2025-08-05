import { v4 as uuidv4 } from 'uuid';
import { PageContent, PageMetadata, BrowserError } from '@/types';
import { playwrightManager, NavigationOptions } from './playwright-manager';
import logger from '@/core/utils/logger';
import validator from '@/core/utils/validator';

export interface PageSession {
  id: string;
  contextId: string;
  pageId: string;
  url: string;
  title: string;
  createdAt: Date;
  lastActivity: Date;
  metadata?: PageMetadata;
}

class PageController {
  private sessions: Map<string, PageSession> = new Map();
  private readonly sessionTimeout = 30 * 60 * 1000; // 30 minutes

  public async createPageSession(
    userId: string,
    url: string,
    options: NavigationOptions = {}
  ): Promise<string> {
    try {
      // Input validation
      if (!userId || typeof userId !== 'string') {
        throw new BrowserError('User ID is required and must be a string');
      }
      
      if (!url || typeof url !== 'string') {
        throw new BrowserError('URL is required and must be a string');
      }
      
      if (userId.trim().length === 0) {
        throw new BrowserError('User ID cannot be empty');
      }
      
      if (url.trim().length === 0) {
        throw new BrowserError('URL cannot be empty');
      }

      // Validate URL
      const validatedUrl = validator.validateUrl(url);
      
      // Create browser context
      const sessionId = uuidv4();
      const contextId = await playwrightManager.createContext(userId, sessionId);
      
      if (!contextId) {
        throw new BrowserError('Failed to create browser context');
      }
      
      // Create page
      const pageId = await playwrightManager.createPage(contextId);
      
      if (!pageId) {
        throw new BrowserError('Failed to create page');
      }
      
      // Navigate to URL
      await playwrightManager.navigateToUrl(pageId, validatedUrl, options);
      
      // Get page info
      const pageContent = await playwrightManager.getPageContent(pageId);
      
      if (!pageContent) {
        throw new BrowserError('Failed to get page content');
      }
      
      // Create session
      const session: PageSession = {
        id: sessionId,
        contextId,
        pageId,
        url: pageContent.url,
        title: pageContent.title,
        createdAt: new Date(),
        lastActivity: new Date()
      };
      
      this.sessions.set(sessionId, session);
      
      logger.info('Page session created', { 
        sessionId, 
        userId, 
        url: validatedUrl,
        title: pageContent.title
      });
      
      return sessionId;
    } catch (error: any) {
      logger.error('Failed to create page session', error);
      throw new BrowserError(`Failed to create page session: ${error.message || 'Unknown error'}`);
    }
  }

  public async getPageContent(sessionId: string): Promise<PageContent> {
    const session = this.getActiveSession(sessionId);
    
    try {
      const content = await playwrightManager.getPageContent(session.pageId);
      const metadata = await this.extractPageMetadata(session.pageId);
      
      this.updateSessionActivity(sessionId);
      
      const pageContent: PageContent = {
        url: content.url,
        title: content.title,
        text: content.text,
        html: content.html,
        metadata,
        extractedAt: new Date(),
        extractorUsed: 'playwright'
      };
      
      logger.debug('Page content extracted', { 
        sessionId, 
        url: content.url,
        textLength: content.text.length
      });
      
      return pageContent;
    } catch (error: any) {
      logger.error('Failed to get page content', error);
      throw new BrowserError(`Failed to get page content: ${error.message || 'Unknown error'}`);
    }
  }

  public async navigateToUrl(
    sessionId: string, 
    url: string, 
    options: NavigationOptions = {}
  ): Promise<void> {
    const session = this.getActiveSession(sessionId);
    const validatedUrl = validator.validateUrl(url);
    
    try {
      await playwrightManager.navigateToUrl(session.pageId, validatedUrl, options);
      
      // Update session info
      const content = await playwrightManager.getPageContent(session.pageId);
      session.url = content.url;
      session.title = content.title;
      this.updateSessionActivity(sessionId);
      
      logger.info('Page navigation completed', { sessionId, url: validatedUrl });
    } catch (error: any) {
      logger.error('Failed to navigate page', error);
      throw new BrowserError(`Failed to navigate to ${url}: ${error.message || 'Unknown error'}`);
    }
  }

  public async interactWithPage(
    sessionId: string,
    action: 'click' | 'fill' | 'wait',
    selector: string,
    value?: string,
    timeout?: number
  ): Promise<boolean> {
    const session = this.getActiveSession(sessionId);
    
    try {
      let result = false;
      
      switch (action) {
        case 'click':
          result = await playwrightManager.clickElement(session.pageId, selector);
          break;
        case 'fill':
          if (!value) {
            throw new BrowserError('Value required for fill action');
          }
          result = await playwrightManager.fillInput(session.pageId, selector, value);
          break;
        case 'wait':
          result = await playwrightManager.waitForElement(
            session.pageId, 
            selector, 
            timeout || 10000
          );
          break;
        default:
          throw new BrowserError(`Unknown action: ${action}`);
      }
      
      this.updateSessionActivity(sessionId);
      
      logger.debug('Page interaction completed', { 
        sessionId, 
        action, 
        selector, 
        success: result 
      });
      
      return result;
    } catch (error: any) {
      logger.error('Failed to interact with page', error);
      throw new BrowserError(`Failed to ${action} element: ${error.message || 'Unknown error'}`);
    }
  }

  public async takeScreenshot(
    sessionId: string, 
    fullPage: boolean = false
  ): Promise<Buffer> {
    const session = this.getActiveSession(sessionId);
    
    try {
      const screenshot = await playwrightManager.screenshot(session.pageId, { fullPage });
      this.updateSessionActivity(sessionId);
      
      logger.debug('Screenshot taken', { sessionId, fullPage });
      return screenshot;
    } catch (error: any) {
      logger.error('Failed to take screenshot', error);
      throw new BrowserError(`Failed to take screenshot: ${error.message || 'Unknown error'}`);
    }
  }

  public async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    
    try {
      await playwrightManager.closeContext(session.contextId);
      this.sessions.delete(sessionId);
      
      logger.info('Page session closed', { sessionId });
    } catch (error) {
      logger.error('Failed to close page session', error);
    }
  }

  public async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const expiredSessions: string[] = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > this.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }
    
    if (expiredSessions.length > 0) {
      logger.info('Cleaning up expired sessions', { count: expiredSessions.length });
      
      const cleanupPromises = expiredSessions.map(sessionId => 
        this.closeSession(sessionId)
      );
      
      await Promise.all(cleanupPromises);
    }
  }

  public getSession(sessionId: string): PageSession | null {
    return this.sessions.get(sessionId) || null;
  }

  public getAllSessions(): PageSession[] {
    return Array.from(this.sessions.values());
  }

  public getActiveSessionsCount(): number {
    return this.sessions.size;
  }

  private getActiveSession(sessionId: string): PageSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new BrowserError(`Session ${sessionId} not found`);
    }
    return session;
  }

  private updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      this.sessions.set(sessionId, session);
    }
  }

  private async extractPageMetadata(pageId: string): Promise<PageMetadata> {
    try {
      const page = (playwrightManager as any)['pages'].get(pageId);
      if (!page) {
        return {};
      }

      const metadata = await page.evaluate(() => {
        const getMetaContent = (name: string): string | undefined => {
          const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
          return meta?.getAttribute('content') || undefined;
        };

        const getJsonLd = () => {
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const script of Array.from(scripts)) {
            try {
              const data = JSON.parse(script.textContent || '');
              if (data.author || data.datePublished) {
                return data;
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
          return null;
        };

        const jsonLd = getJsonLd();
        const text = document.body?.innerText || '';
        const words = text.trim().split(/\s+/).length;
        const readingTime = Math.ceil(words / 200); // Assume 200 words per minute

        return {
          author: jsonLd?.author?.name || getMetaContent('author'),
          publishDate: jsonLd?.datePublished || getMetaContent('article:published_time'),
          description: getMetaContent('description') || getMetaContent('og:description'),
          keywords: getMetaContent('keywords')?.split(',').map(k => k.trim()),
          language: document.documentElement.lang || 'en',
          wordCount: words,
          readingTime
        };
      });

      return {
        author: metadata.author,
        publishDate: metadata.publishDate ? new Date(metadata.publishDate) : undefined,
        description: metadata.description,
        keywords: metadata.keywords || [],
        language: metadata.language,
        readingTime: metadata.readingTime,
        wordCount: metadata.wordCount
      };
    } catch (error) {
      logger.warn('Failed to extract page metadata', error);
      return {};
    }
  }

  public async cleanup(): Promise<void> {
    logger.info('Cleaning up all page sessions');
    
    const cleanupPromises = Array.from(this.sessions.keys()).map(sessionId =>
      this.closeSession(sessionId)
    );
    
    await Promise.all(cleanupPromises);
    this.sessions.clear();
    
    logger.info('Page controller cleanup completed');
  }

  // Start cleanup interval
  public startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredSessions().catch(error => {
        logger.error('Error during session cleanup', error);
      });
    }, 5 * 60 * 1000); // Run every 5 minutes
  }
}

export { PageController };
export const pageController = new PageController();
export default pageController;