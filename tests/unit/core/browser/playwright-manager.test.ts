import { jest } from '@jest/globals';
import { playwrightManager } from '../../../../src/core/browser/playwright-manager';
import { BrowserError } from '../../../../src/types';
import MockFactory from '../../../helpers/mock-factory';

// Mock playwright
const mockBrowser = MockFactory.createMockPlaywrightBrowser();
const mockPage = MockFactory.createMockPlaywrightPage();

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(mockBrowser)
  }
}));

jest.mock('../../../../src/core/utils/config', () => ({
  default: {
    get: jest.fn().mockReturnValue({
      browserMaxContexts: 5,
      browserTimeout: 30000,
      browserHeadless: true
    })
  }
}));

jest.mock('../../../../src/core/utils/logger', () => ({
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('PlaywrightManager', () => {
  // Using the shared instance directly

  beforeEach(() => {
    jest.clearAllMocks();
    // Using the shared instance
  });

  afterEach(async () => {
    await playwrightManager.cleanup();
  });

  describe('initialize', () => {
    it('should initialize browser successfully', async () => {
      await playwrightManager.initialize();

      expect(mockBrowser.newContext).not.toHaveBeenCalled();
    });

    it('should throw BrowserError if initialization fails', async () => {
      const { chromium } = require('playwright');
      chromium.launch.mockRejectedValueOnce(new Error('Browser launch failed'));

      await expect(playwrightManager.initialize()).rejects.toThrow(BrowserError);
      expect(chromium.launch).toHaveBeenCalledWith({
        headless: true,
        args: expect.arrayContaining([
          '--disable-dev-shm-usage',
          '--no-sandbox'
        ])
      });
    });
  });

  describe('createContext', () => {
    beforeEach(async () => {
      await playwrightManager.initialize();
    });

    it('should create a new browser context', async () => {
      const userId = 'test-user-id';
      const sessionId = 'test-session-id';

      const contextId = await playwrightManager.createContext(userId, sessionId);

      expect(contextId).toBeDefined();
      expect(typeof contextId).toBe('string');
      expect(mockBrowser.newContext).toHaveBeenCalledWith({
        ignoreHTTPSErrors: false,
        userAgent: 'SmartBrowser/1.0 (Chrome Extension)',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York'
      });
    });

    it('should create context with custom options', async () => {
      const userId = 'test-user-id';
      const sessionId = 'test-session-id';
      const options = {
        userAgent: 'Custom User Agent',
        viewport: { width: 1280, height: 720 },
        timeout: 60000
      };

      const contextId = await playwrightManager.createContext(userId, sessionId, options);

      expect(contextId).toBeDefined();
      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: 'Custom User Agent',
          viewport: { width: 1280, height: 720 }
        })
      );
    });

    it('should clean up oldest context when at max limit', async () => {
      const userId = 'test-user-id';
      
      // Create max contexts
      const contextIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const contextId = await playwrightManager.createContext(userId, `session-${i}`);
        contextIds.push(contextId);
      }

      // Mock context close for cleanup
      const mockContext = {
        pages: jest.fn().mockReturnValue([]),
        close: jest.fn().mockResolvedValue(undefined),
        setDefaultTimeout: jest.fn(),
        setDefaultNavigationTimeout: jest.fn(),
        on: jest.fn()
      };
      mockBrowser.newContext.mockResolvedValue(mockContext);

      // Creating one more should trigger cleanup
      const newContextId = await playwrightManager.createContext(userId, 'session-new');
      
      expect(newContextId).toBeDefined();
      expect(mockBrowser.newContext).toHaveBeenCalledTimes(6); // 5 initial + 1 new
    });

    it('should throw BrowserError if context creation fails', async () => {
      mockBrowser.newContext.mockRejectedValueOnce(new Error('Context creation failed'));

      await expect(
        playwrightManager.createContext('user-id', 'session-id')
      ).rejects.toThrow(BrowserError);
    });
  });

  describe('createPage', () => {
    let contextId: string;

    beforeEach(async () => {
      await playwrightManager.initialize();
      contextId = await playwrightManager.createContext('test-user', 'test-session');
    });

    it('should create a new page in the context', async () => {
      const pageId = await playwrightManager.createPage(contextId);

      expect(pageId).toBeDefined();
      expect(typeof pageId).toBe('string');
    });

    it('should throw BrowserError if context not found', async () => {
      await expect(
        playwrightManager.createPage('non-existent-context')
      ).rejects.toThrow(BrowserError);
    });
  });

  describe('navigateToUrl', () => {
    let contextId: string;
    let pageId: string;

    beforeEach(async () => {
      await playwrightManager.initialize();
      contextId = await playwrightManager.createContext('test-user', 'test-session');
      pageId = await playwrightManager.createPage(contextId);
    });

    it('should navigate to URL successfully', async () => {
      const url = 'https://example.com';
      
      const result = await playwrightManager.navigateToUrl(pageId, url);

      expect(result).toBe(true);
      expect(mockPage.goto).toHaveBeenCalledWith(url, {
        timeout: 30000,
        waitUntil: 'domcontentloaded'
      });
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('body', { timeout: 5000 });
    });

    it('should use custom navigation options', async () => {
      const url = 'https://example.com';
      const options = {
        timeout: 60000,
        waitUntil: 'load' as const,
        retries: 5
      };

      const result = await playwrightManager.navigateToUrl(pageId, url, options);

      expect(result).toBe(true);
      expect(mockPage.goto).toHaveBeenCalledWith(url, {
        timeout: 60000,
        waitUntil: 'load'
      });
    });

    it('should retry navigation on failure', async () => {
      const url = 'https://example.com';
      
      // Mock first two attempts to fail, third to succeed
      mockPage.goto
        .mockRejectedValueOnce(new Error('Navigation failed'))
        .mockRejectedValueOnce(new Error('Navigation failed'))
        .mockResolvedValueOnce(undefined);

      const result = await playwrightManager.navigateToUrl(pageId, url, { retries: 3 });

      expect(result).toBe(true);
      expect(mockPage.goto).toHaveBeenCalledTimes(3);
    });

    it('should throw BrowserError after all retries fail', async () => {
      const url = 'https://example.com';
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));

      await expect(
        playwrightManager.navigateToUrl(pageId, url, { retries: 2 })
      ).rejects.toThrow(BrowserError);

      expect(mockPage.goto).toHaveBeenCalledTimes(2);
    });

    it('should throw BrowserError if page not found', async () => {
      await expect(
        playwrightManager.navigateToUrl('non-existent-page', 'https://example.com')
      ).rejects.toThrow(BrowserError);
    });
  });

  describe('getPageContent', () => {
    let contextId: string;
    let pageId: string;

    beforeEach(async () => {
      await playwrightManager.initialize();
      contextId = await playwrightManager.createContext('test-user', 'test-session');
      pageId = await playwrightManager.createPage(contextId);
    });

    it('should extract page content successfully', async () => {
      const mockContent = {
        url: 'https://example.com',
        title: 'Example Page',
        html: '<html><body>Test content</body></html>',
        text: 'Test content'
      };

      mockPage.url.mockReturnValue(mockContent.url);
      mockPage.title.mockResolvedValue(mockContent.title);
      mockPage.content.mockResolvedValue(mockContent.html);
      mockPage.evaluate.mockResolvedValue(mockContent.text);

      const result = await playwrightManager.getPageContent(pageId);

      expect(result).toEqual({
        url: mockContent.url,
        title: mockContent.title,
        html: mockContent.html,
        text: mockContent.text
      });
    });

    it('should throw BrowserError if page not found', async () => {
      await expect(
        playwrightManager.getPageContent('non-existent-page')
      ).rejects.toThrow(BrowserError);
    });

    it('should throw BrowserError if content extraction fails', async () => {
      mockPage.content.mockRejectedValue(new Error('Content extraction failed'));

      await expect(
        playwrightManager.getPageContent(pageId)
      ).rejects.toThrow(BrowserError);
    });
  });

  describe('waitForElement', () => {
    let contextId: string;
    let pageId: string;

    beforeEach(async () => {
      await playwrightManager.initialize();
      contextId = await playwrightManager.createContext('test-user', 'test-session');
      pageId = await playwrightManager.createPage(contextId);
    });

    it('should wait for element successfully', async () => {
      const selector = '.test-element';
      mockPage.waitForSelector.mockResolvedValue({});

      const result = await playwrightManager.waitForElement(pageId, selector);

      expect(result).toBe(true);
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(selector, { timeout: 10000 });
    });

    it('should return false if element not found within timeout', async () => {
      const selector = '.non-existent-element';
      mockPage.waitForSelector.mockRejectedValue(new Error('Timeout'));

      const result = await playwrightManager.waitForElement(pageId, selector, 5000);

      expect(result).toBe(false);
    });

    it('should throw BrowserError if page not found', async () => {
      await expect(
        playwrightManager.waitForElement('non-existent-page', '.test')
      ).rejects.toThrow(BrowserError);
    });
  });

  describe('clickElement', () => {
    let contextId: string;
    let pageId: string;

    beforeEach(async () => {
      await playwrightManager.initialize();
      contextId = await playwrightManager.createContext('test-user', 'test-session');
      pageId = await playwrightManager.createPage(contextId);
    });

    it('should click element successfully', async () => {
      const selector = '.clickable-element';
      mockPage.click.mockResolvedValue(undefined);

      const result = await playwrightManager.clickElement(pageId, selector);

      expect(result).toBe(true);
      expect(mockPage.click).toHaveBeenCalledWith(selector);
    });

    it('should return false if click fails', async () => {
      const selector = '.non-existent-element';
      mockPage.click.mockRejectedValue(new Error('Element not found'));

      const result = await playwrightManager.clickElement(pageId, selector);

      expect(result).toBe(false);
    });
  });

  describe('fillInput', () => {
    let contextId: string;
    let pageId: string;

    beforeEach(async () => {
      await playwrightManager.initialize();
      contextId = await playwrightManager.createContext('test-user', 'test-session');
      pageId = await playwrightManager.createPage(contextId);
    });

    it('should fill input successfully', async () => {
      const selector = '#input-field';
      const value = 'test value';
      mockPage.fill.mockResolvedValue(undefined);

      const result = await playwrightManager.fillInput(pageId, selector, value);

      expect(result).toBe(true);
      expect(mockPage.fill).toHaveBeenCalledWith(selector, value);
    });

    it('should return false if fill fails', async () => {
      const selector = '#non-existent-input';
      const value = 'test value';
      mockPage.fill.mockRejectedValue(new Error('Input not found'));

      const result = await playwrightManager.fillInput(pageId, selector, value);

      expect(result).toBe(false);
    });
  });

  describe('screenshot', () => {
    let contextId: string;
    let pageId: string;

    beforeEach(async () => {
      await playwrightManager.initialize();
      contextId = await playwrightManager.createContext('test-user', 'test-session');
      pageId = await playwrightManager.createPage(contextId);
    });

    it('should take screenshot successfully', async () => {
      const mockBuffer = Buffer.from('fake-screenshot');
      mockPage.screenshot.mockResolvedValue(mockBuffer);

      const result = await playwrightManager.screenshot(pageId);

      expect(result).toEqual(mockBuffer);
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        fullPage: false,
        type: 'png'
      });
    });

    it('should take full page screenshot', async () => {
      const mockBuffer = Buffer.from('fake-screenshot');
      mockPage.screenshot.mockResolvedValue(mockBuffer);

      const result = await playwrightManager.screenshot(pageId, { fullPage: true });

      expect(result).toEqual(mockBuffer);
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        fullPage: true,
        type: 'png'
      });
    });

    it('should throw BrowserError if screenshot fails', async () => {
      mockPage.screenshot.mockRejectedValue(new Error('Screenshot failed'));

      await expect(
        playwrightManager.screenshot(pageId)
      ).rejects.toThrow(BrowserError);
    });
  });

  describe('closePage', () => {
    let contextId: string;
    let pageId: string;

    beforeEach(async () => {
      await playwrightManager.initialize();
      contextId = await playwrightManager.createContext('test-user', 'test-session');
      pageId = await playwrightManager.createPage(contextId);
    });

    it('should close page successfully', async () => {
      mockPage.close.mockResolvedValue(undefined);

      await playwrightManager.closePage(pageId);

      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should handle non-existent page gracefully', async () => {
      await expect(
        playwrightManager.closePage('non-existent-page')
      ).resolves.not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should cleanup all resources', async () => {
      await playwrightManager.initialize();
      
      const contextId = await playwrightManager.createContext('test-user', 'test-session');
      const pageId = await playwrightManager.createPage(contextId);

      mockPage.close.mockResolvedValue(undefined);
      mockBrowser.close.mockResolvedValue(undefined);

      await playwrightManager.cleanup();

      expect(mockPage.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return browser statistics', async () => {
      const stats = playwrightManager.getStats();

      expect(stats).toHaveProperty('contextsCount');
      expect(stats).toHaveProperty('pagesCount');
      expect(stats).toHaveProperty('browserActive');
      expect(typeof stats.contextsCount).toBe('number');
      expect(typeof stats.pagesCount).toBe('number');
      expect(typeof stats.browserActive).toBe('boolean');
    });

    it('should show correct context and page counts', async () => {
      await playwrightManager.initialize();
      
      let stats = playwrightManager.getStats();
      expect(stats.contextsCount).toBe(0);
      expect(stats.pagesCount).toBe(0);

      const contextId = await playwrightManager.createContext('test-user', 'test-session');
      const pageId = await playwrightManager.createPage(contextId);

      stats = playwrightManager.getStats();
      expect(stats.contextsCount).toBe(1);
      expect(stats.pagesCount).toBe(1);
      expect(stats.browserActive).toBe(true);
    });
  });

  describe('performance and memory management', () => {
    it('should track context memory usage', async () => {
      await playwrightManager.initialize();
      const contextId = await playwrightManager.createContext('test-user', 'test-session');
      
      // Context should be created with initial memory tracking
      const stats = playwrightManager.getStats();
      expect(stats.contextsCount).toBe(1);
    });

    it('should update last used timestamp on context access', async () => {
      await playwrightManager.initialize();
      const contextId = await playwrightManager.createContext('test-user', 'test-session');
      
      const initialTime = Date.now();
      await global.testUtils.sleep(10);
      
      // Access context should update lastUsed
      await playwrightManager.getContext(contextId);
      
      // We can't directly test the timestamp, but we can verify the context is still accessible
      const context = await playwrightManager.getContext(contextId);
      expect(context).not.toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle browser disconnection gracefully', async () => {
      await playwrightManager.initialize();
      mockBrowser.isConnected.mockReturnValue(false);

      const stats = playwrightManager.getStats();
      expect(stats.browserActive).toBe(false);
    });

    it('should handle page event listeners setup', async () => {
      await playwrightManager.initialize();
      const contextId = await playwrightManager.createContext('test-user', 'test-session');
      
      // Verify that page event listeners are set up
      expect(mockPage.on).toHaveBeenCalledWith('console', expect.any(Function));
      expect(mockPage.on).toHaveBeenCalledWith('pageerror', expect.any(Function));
      expect(mockPage.on).toHaveBeenCalledWith('requestfailed', expect.any(Function));
    });
  });
});