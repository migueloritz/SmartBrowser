import { Browser, BrowserContext, Page, chromium, firefox, webkit } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import { BrowserContext as BrowserContextType, BrowserError } from '@/types';
import logger from '@/core/utils/logger';
import config from '@/core/utils/config';

export interface NavigationOptions {
  timeout?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  retries?: number;
}

export interface BrowserOptions {
  headless?: boolean;
  timeout?: number;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

class PlaywrightManager {
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContextType> = new Map();
  private pages: Map<string, Page> = new Map();
  private readonly maxContexts: number;
  private readonly defaultTimeout: number;
  private readonly headless: boolean;

  constructor() {
    this.maxContexts = config.get().browserMaxContexts;
    this.defaultTimeout = config.get().browserTimeout;
    this.headless = config.get().browserHeadless;
  }

  public async initialize(): Promise<void> {
    try {
      logger.info('Initializing Playwright browser');
      this.browser = await chromium.launch({
        headless: this.headless,
        args: [
          '--disable-dev-shm-usage',
          '--disable-setuid-sandbox',
          '--no-sandbox',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      });
      logger.info('Playwright browser initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Playwright browser', error);
      throw new BrowserError('Failed to initialize browser');
    }
  }

  public async createContext(
    userId: string,
    sessionId: string,
    options: BrowserOptions = {}
  ): Promise<string> {
    if (!this.browser) {
      await this.initialize();
    }

    // Check context limit
    if (this.contexts.size >= this.maxContexts) {
      await this.cleanupOldestContext();
    }

    const contextId = uuidv4();
    
    try {
      const browserContext = await this.browser!.newContext({
        ignoreHTTPSErrors: false,
        userAgent: options.userAgent || 'SmartBrowser/1.0 (Chrome Extension)',
        viewport: options.viewport || { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York'
      });

      // Set default timeout
      browserContext.setDefaultTimeout(options.timeout || this.defaultTimeout);
      browserContext.setDefaultNavigationTimeout(options.timeout || this.defaultTimeout);

      const contextInfo: BrowserContextType = {
        id: contextId,
        userId,
        sessionId,
        created: new Date(),
        lastUsed: new Date(),
        pageCount: 0,
        memoryUsage: 0
      };

      this.contexts.set(contextId, contextInfo);

      // Add context event listeners
      browserContext.on('page', (page) => {
        this.handleNewPage(contextId, page);
      });

      logger.info('Browser context created', { contextId, userId, sessionId });
      return contextId;
    } catch (error) {
      logger.error('Failed to create browser context', error);
      throw new BrowserError('Failed to create browser context');
    }
  }

  public async getContext(contextId: string): Promise<BrowserContext | null> {
    const contextInfo = this.contexts.get(contextId);
    if (!contextInfo) {
      return null;
    }

    if (!this.browser) {
      return null;
    }

    const browserContexts = this.browser.contexts();
    const browserContext = browserContexts.find(ctx => 
      ctx.pages().some(page => this.pages.has(`${contextId}-${page.url()}`))
    );

    // Update last used timestamp
    if (browserContext) {
      contextInfo.lastUsed = new Date();
      this.contexts.set(contextId, contextInfo);
    }

    return browserContext || null;
  }

  public async createPage(contextId: string): Promise<string> {
    const browserContext = await this.getContext(contextId);
    if (!browserContext) {
      throw new BrowserError(`Context ${contextId} not found`);
    }

    try {
      const page = await browserContext.newPage();
      const pageId = uuidv4();
      
      // Set up page event listeners
      this.setupPageEventListeners(page, contextId, pageId);
      
      this.pages.set(pageId, page);

      // Update context page count
      const contextInfo = this.contexts.get(contextId);
      if (contextInfo) {
        contextInfo.pageCount++;
        this.contexts.set(contextId, contextInfo);
      }

      logger.info('New page created', { contextId, pageId });
      return pageId;
    } catch (error) {
      logger.error('Failed to create page', error);
      throw new BrowserError('Failed to create page');
    }
  }

  public async navigateToUrl(
    pageId: string,
    url: string,
    options: NavigationOptions = {}
  ): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new BrowserError(`Page ${pageId} not found`);
    }

    const timeout = options.timeout || this.defaultTimeout;
    const waitUntil = options.waitUntil || 'domcontentloaded';
    const retries = options.retries || 3;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.info(`Navigating to URL (attempt ${attempt}/${retries})`, { pageId, url });
        
        await page.goto(url, {
          timeout,
          waitUntil
        });

        // Wait for essential elements to load
        await page.waitForSelector('body', { timeout: 5000 });
        
        logger.info('Navigation successful', { pageId, url });
        return true;
      } catch (error) {
        logger.warn(`Navigation attempt ${attempt} failed`, { pageId, url, error: error.message });
        
        if (attempt === retries) {
          logger.error('All navigation attempts failed', { pageId, url });
          throw new BrowserError(`Failed to navigate to ${url}: ${error.message}`);
        }
        
        // Exponential backoff
        await this.sleep(Math.pow(2, attempt) * 1000);
      }
    }

    return false;
  }

  public async getPageContent(pageId: string): Promise<{
    url: string;
    title: string;
    html: string;
    text: string;
  }> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new BrowserError(`Page ${pageId} not found`);
    }

    try {
      const url = page.url();
      const title = await page.title();
      const html = await page.content();
      
      // Extract visible text content
      const text = await page.evaluate(() => {
        // Remove script and style elements
        const scripts = document.querySelectorAll('script, style, noscript');
        scripts.forEach(el => el.remove());
        
        return document.body?.innerText || document.textContent || '';
      });

      logger.debug('Page content extracted', { pageId, url, textLength: text.length });
      
      return {
        url,
        title,
        html,
        text: text.trim()
      };
    } catch (error) {
      logger.error('Failed to extract page content', error);
      throw new BrowserError('Failed to extract page content');
    }
  }

  public async waitForElement(
    pageId: string,
    selector: string,
    timeout: number = 10000
  ): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new BrowserError(`Page ${pageId} not found`);
    }

    try {
      await page.waitForSelector(selector, { timeout });
      return true;
    } catch (error) {
      logger.warn('Element not found within timeout', { pageId, selector, timeout });
      return false;
    }
  }

  public async clickElement(pageId: string, selector: string): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new BrowserError(`Page ${pageId} not found`);
    }

    try {
      await page.click(selector);
      logger.debug('Element clicked', { pageId, selector });
      return true;
    } catch (error) {
      logger.error('Failed to click element', { pageId, selector, error: error.message });
      return false;
    }
  }

  public async fillInput(pageId: string, selector: string, value: string): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new BrowserError(`Page ${pageId} not found`);
    }

    try {
      await page.fill(selector, value);
      logger.debug('Input filled', { pageId, selector });
      return true;
    } catch (error) {
      logger.error('Failed to fill input', { pageId, selector, error: error.message });
      return false;
    }
  }

  public async screenshot(pageId: string, options: { fullPage?: boolean } = {}): Promise<Buffer> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new BrowserError(`Page ${pageId} not found`);
    }

    try {
      return await page.screenshot({
        fullPage: options.fullPage || false,
        type: 'png'
      });
    } catch (error) {
      logger.error('Failed to take screenshot', error);
      throw new BrowserError('Failed to take screenshot');
    }
  }

  public async closePage(pageId: string): Promise<void> {
    const page = this.pages.get(pageId);
    if (!page) {
      return;
    }

    try {
      await page.close();
      this.pages.delete(pageId);
      logger.info('Page closed', { pageId });
    } catch (error) {
      logger.error('Failed to close page', error);
    }
  }

  public async closeContext(contextId: string): Promise<void> {
    const browserContext = await this.getContext(contextId);
    if (!browserContext) {
      return;
    }

    try {
      // Close all pages in context
      const pages = browserContext.pages();
      await Promise.all(pages.map(page => page.close()));

      // Close context
      await browserContext.close();
      this.contexts.delete(contextId);

      // Remove pages from tracking
      for (const [pageId, page] of this.pages.entries()) {
        if (pages.includes(page)) {
          this.pages.delete(pageId);
        }
      }

      logger.info('Context closed', { contextId });
    } catch (error) {
      logger.error('Failed to close context', error);
    }
  }

  public async cleanup(): Promise<void> {
    try {
      logger.info('Starting browser cleanup');

      // Close all pages
      const closePagePromises = Array.from(this.pages.keys()).map(pageId => 
        this.closePage(pageId)
      );
      await Promise.all(closePagePromises);

      // Close all contexts
      const closeContextPromises = Array.from(this.contexts.keys()).map(contextId =>
        this.closeContext(contextId)
      );
      await Promise.all(closeContextPromises);

      // Close browser
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      logger.info('Browser cleanup completed');
    } catch (error) {
      logger.error('Error during browser cleanup', error);
    }
  }

  private async cleanupOldestContext(): Promise<void> {
    if (this.contexts.size === 0) {
      return;
    }

    // Find oldest context
    let oldestContextId = '';
    let oldestTime = Date.now();

    for (const [contextId, contextInfo] of this.contexts.entries()) {
      if (contextInfo.lastUsed.getTime() < oldestTime) {
        oldestTime = contextInfo.lastUsed.getTime();
        oldestContextId = contextId;
      }
    }

    if (oldestContextId) {
      logger.info('Cleaning up oldest context', { contextId: oldestContextId });
      await this.closeContext(oldestContextId);
    }
  }

  private handleNewPage(contextId: string, page: Page): void {
    const pageId = uuidv4();
    this.pages.set(pageId, page);
    this.setupPageEventListeners(page, contextId, pageId);
    
    logger.debug('New page detected in context', { contextId, pageId });
  }

  private setupPageEventListeners(page: Page, contextId: string, pageId: string): void {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        logger.warn('Page console error', { contextId, pageId, message: msg.text() });
      }
    });

    page.on('pageerror', (error) => {
      logger.warn('Page error', { contextId, pageId, error: error.message });
    });

    page.on('requestfailed', (request) => {
      logger.debug('Request failed', { 
        contextId, 
        pageId, 
        url: request.url(), 
        failure: request.failure()?.errorText 
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public getStats(): {
    contextsCount: number;
    pagesCount: number;
    browserActive: boolean;
  } {
    return {
      contextsCount: this.contexts.size,
      pagesCount: this.pages.size,
      browserActive: this.browser !== null && this.browser.isConnected()
    };
  }
}

export { PlaywrightManager };
export const playwrightManager = new PlaywrightManager();
export default playwrightManager;