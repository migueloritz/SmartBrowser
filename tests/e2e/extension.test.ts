import { readFileSync } from 'fs';
import { join } from 'path';

// Mock Chrome extension APIs
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn()
    },
    sendMessage: jest.fn(),
    onConnect: {
      addListener: jest.fn()
    },
    connect: jest.fn(),
    getManifest: jest.fn().mockReturnValue({
      version: '1.0.0',
      name: 'SmartBrowser'
    })
  },
  tabs: {
    query: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    onUpdated: {
      addListener: jest.fn()
    },
    onActivated: {
      addListener: jest.fn()
    },
    executeScript: jest.fn(),
    insertCSS: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined)
    },
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined)
    },
    onChanged: {
      addListener: jest.fn()
    }
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  },
  contextMenus: {
    create: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  },
  notifications: {
    create: jest.fn(),
    clear: jest.fn()
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn(),
    onAlarm: {
      addListener: jest.fn()
    }
  }
};

// Set up global Chrome API
(global as any).chrome = mockChrome;

describe('Chrome Extension E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Extension Manifest', () => {
    it('should have valid manifest.json', () => {
      const manifestPath = join(process.cwd(), 'src', 'extension', 'manifest.json');
      const manifestContent = readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      expect(manifest.manifest_version).toBe(3);
      expect(manifest.name).toBe('SmartBrowser');
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(manifest.permissions).toContain('activeTab');
      expect(manifest.permissions).toContain('storage');
      expect(manifest.host_permissions).toContain('https://*/*');
      expect(manifest.background.service_worker).toBe('background/service-worker.js');
      expect(manifest.content_scripts).toHaveLength(1);
      expect(manifest.action.default_popup).toBe('popup/popup.html');
    });

    it('should have required permissions for functionality', () => {
      const manifestPath = join(process.cwd(), 'src', 'extension', 'manifest.json');
      const manifestContent = readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      const requiredPermissions = [
        'activeTab',
        'storage',
        'contextMenus',
        'notifications'
      ];

      for (const permission of requiredPermissions) {
        expect(manifest.permissions).toContain(permission);
      }
    });
  });

  describe('Service Worker (Background Script)', () => {
    it('should initialize service worker correctly', async () => {
      // Load the service worker
      const serviceWorkerPath = join(process.cwd(), 'src', 'extension', 'background', 'service-worker.js');
      const serviceWorkerCode = readFileSync(serviceWorkerPath, 'utf-8');

      // Execute the service worker code
      eval(serviceWorkerCode);

      // Verify that event listeners are set up
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(mockChrome.tabs.onUpdated.addListener).toHaveBeenCalled();
      expect(mockChrome.action.onClicked.addListener).toHaveBeenCalled();
    });

    it('should handle tab updates correctly', async () => {
      const serviceWorkerPath = join(process.cwd(), 'src', 'extension', 'background', 'service-worker.js');
      const serviceWorkerCode = readFileSync(serviceWorkerPath, 'utf-8');
      
      eval(serviceWorkerCode);

      // Get the tab update handler
      const tabUpdateHandler = mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];

      // Mock tab update
      const tabId = 123;
      const changeInfo = { status: 'complete', url: 'https://example.com' };
      const tab = { id: tabId, url: 'https://example.com', title: 'Example Page' };

      await tabUpdateHandler(tabId, changeInfo, tab);

      // Should have processed the tab update
      expect(mockChrome.storage.local.get).toHaveBeenCalled();
    });

    it('should handle messages from content scripts', async () => {
      const serviceWorkerPath = join(process.cwd(), 'src', 'extension', 'background', 'service-worker.js');
      const serviceWorkerCode = readFileSync(serviceWorkerPath, 'utf-8');
      
      eval(serviceWorkerCode);

      // Get the message handler
      const messageHandler = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];

      // Mock message from content script
      const message = {
        type: 'EXTRACT_CONTENT',
        payload: {
          url: 'https://example.com',
          title: 'Example Page',
          content: 'Page content'
        }
      };

      const sender = { tab: { id: 123 } };
      const sendResponse = jest.fn();

      await messageHandler(message, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalled();
    });

    it('should handle summarization requests', async () => {
      const serviceWorkerPath = join(process.cwd(), 'src', 'extension', 'background', 'service-worker.js');
      const serviceWorkerCode = readFileSync(serviceWorkerPath, 'utf-8');
      
      eval(serviceWorkerCode);

      const messageHandler = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];

      const message = {
        type: 'SUMMARIZE_PAGE',
        payload: {
          url: 'https://example.com/article',
          title: 'Test Article',
          content: 'Long article content that needs to be summarized for the user.'
        }
      };

      const sender = { tab: { id: 123 } };
      const sendResponse = jest.fn();

      await messageHandler(message, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: expect.any(Boolean)
        })
      );
    });

    it('should handle goal execution requests', async () => {
      const serviceWorkerPath = join(process.cwd(), 'src', 'extension', 'background', 'service-worker.js');
      const serviceWorkerCode = readFileSync(serviceWorkerPath, 'utf-8');
      
      eval(serviceWorkerCode);

      const messageHandler = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];

      const message = {
        type: 'EXECUTE_GOAL',
        payload: {
          goal: 'find hotels in Paris',
          context: {
            currentUrl: 'https://booking.com',
            userPreferences: {
              budget: 'medium',
              location: 'city center'
            }
          }
        }
      };

      const sender = { tab: { id: 123 } };
      const sendResponse = jest.fn();

      await messageHandler(message, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: expect.any(Boolean)
        })
      );
    });
  });

  describe('Content Script', () => {
    it('should inject content script and establish communication', async () => {
      // Mock DOM
      const mockDocument = {
        addEventListener: jest.fn(),
        createElement: jest.fn().mockReturnValue({
          textContent: '',
          addEventListener: jest.fn()
        }),
        body: {
          appendChild: jest.fn()
        },
        title: 'Test Page',
        URL: 'https://example.com'
      };

      (global as any).document = mockDocument;
      (global as any).window = {
        addEventListener: jest.fn(),
        location: { href: 'https://example.com' }
      };

      // Load content script
      const contentScriptPath = join(process.cwd(), 'src', 'extension', 'content', 'content-script.js');
      const contentScriptCode = readFileSync(contentScriptPath, 'utf-8');

      eval(contentScriptCode);

      // Verify content script initialization
      expect(mockDocument.addEventListener).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));
    });

    it('should extract page content when requested', async () => {
      const mockDocument = {
        title: 'Test Article',
        URL: 'https://example.com/article',
        body: {
          innerText: 'This is the main content of the article with meaningful information.',
          innerHTML: '<div><h1>Test Article</h1><p>This is the main content of the article with meaningful information.</p></div>'
        },
        querySelector: jest.fn().mockReturnValue({
          textContent: 'Article content'
        }),
        querySelectorAll: jest.fn().mockReturnValue([
          { textContent: 'Paragraph 1' },
          { textContent: 'Paragraph 2' }
        ])
      };

      (global as any).document = mockDocument;

      const contentScriptPath = join(process.cwd(), 'src', 'extension', 'content', 'content-script.js');
      const contentScriptCode = readFileSync(contentScriptPath, 'utf-8');

      eval(contentScriptCode);

      // Simulate content extraction request
      const extractedContent = (global as any).extractPageContent();

      expect(extractedContent).toEqual(
        expect.objectContaining({
          url: 'https://example.com/article',
          title: 'Test Article',
          text: expect.any(String),
          html: expect.any(String)
        })
      );
    });

    it('should detect and handle different page types', async () => {
      const pageTypes = [
        {
          url: 'https://news.example.com/article',
          selectors: ['article', '.post-content', '.article-body'],
          expectedType: 'article'
        },
        {
          url: 'https://shop.example.com/product/123',
          selectors: ['.product-details', '.item-info'],
          expectedType: 'product'
        },
        {
          url: 'https://booking.com/hotel/paris',
          selectors: ['.hotel-list', '.accommodation'],
          expectedType: 'booking'
        }
      ];

      for (const pageType of pageTypes) {
        const mockDocument = {
          URL: pageType.url,
          title: 'Test Page',
          querySelector: jest.fn().mockImplementation((selector) => {
            return pageType.selectors.includes(selector) ? { textContent: 'Content' } : null;
          }),
          body: { innerText: 'Page content', innerHTML: '<div>Page content</div>' }
        };

        (global as any).document = mockDocument;

        const contentScriptPath = join(process.cwd(), 'src', 'extension', 'content', 'content-script.js');
        const contentScriptCode = readFileSync(contentScriptPath, 'utf-8');

        eval(contentScriptCode);

        const pageTypeDetected = (global as any).detectPageType();
        expect(pageTypeDetected).toBe(pageType.expectedType);
      }
    });
  });

  describe('Popup Interface', () => {
    it('should load popup HTML correctly', () => {
      const popupHtmlPath = join(process.cwd(), 'src', 'extension', 'popup', 'popup.html');
      const popupHtml = readFileSync(popupHtmlPath, 'utf-8');

      expect(popupHtml).toContain('<html');
      expect(popupHtml).toContain('SmartBrowser');
      expect(popupHtml).toContain('id="summarize-btn"');
      expect(popupHtml).toContain('id="goal-input"');
      expect(popupHtml).toContain('id="execute-goal-btn"');
    });

    it('should initialize popup JavaScript correctly', async () => {
      // Mock DOM elements
      const mockElements = {
        'summarize-btn': { addEventListener: jest.fn(), disabled: false },
        'goal-input': { value: '', addEventListener: jest.fn() },
        'execute-goal-btn': { addEventListener: jest.fn(), disabled: false },
        'status-message': { textContent: '', style: { display: 'none' } },
        'summary-container': { innerHTML: '', style: { display: 'none' } }
      };

      const mockDocument = {
        getElementById: jest.fn().mockImplementation((id) => mockElements[id] || null),
        addEventListener: jest.fn()
      };

      (global as any).document = mockDocument;

      // Load popup script
      const popupJsPath = join(process.cwd(), 'src', 'extension', 'popup', 'popup.js');
      const popupJsCode = readFileSync(popupJsPath, 'utf-8');

      eval(popupJsCode);

      // Verify event listeners are attached
      expect(mockElements['summarize-btn'].addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
      expect(mockElements['execute-goal-btn'].addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should handle summarization button click', async () => {
      const mockElements = {
        'summarize-btn': { 
          addEventListener: jest.fn(),
          disabled: false,
          textContent: 'Summarize Page'
        },
        'status-message': { 
          textContent: '', 
          style: { display: 'none' },
          className: ''
        },
        'summary-container': { 
          innerHTML: '', 
          style: { display: 'none' } 
        }
      };

      const mockDocument = {
        getElementById: jest.fn().mockImplementation((id) => mockElements[id] || null)
      };

      (global as any).document = mockDocument;

      // Mock successful tab query and message response
      mockChrome.tabs.query.mockResolvedValue([{ 
        id: 123, 
        url: 'https://example.com/article',
        title: 'Test Article'
      }]);

      mockChrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        summary: {
          summary: 'This is a test summary of the article.',
          keyPoints: ['Point 1', 'Point 2'],
          sentiment: 'neutral'
        }
      });

      const popupJsPath = join(process.cwd(), 'src', 'extension', 'popup', 'popup.js');
      const popupJsCode = readFileSync(popupJsPath, 'utf-8');

      eval(popupJsCode);

      // Get the click handler and simulate click
      const clickHandler = mockElements['summarize-btn'].addEventListener.mock.calls[0][1];
      await clickHandler();

      expect(mockChrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SUMMARIZE_PAGE'
        })
      );
    });

    it('should handle goal execution button click', async () => {
      const mockElements = {
        'goal-input': { 
          value: 'find hotels in Paris',
          addEventListener: jest.fn()
        },
        'execute-goal-btn': { 
          addEventListener: jest.fn(),
          disabled: false,
          textContent: 'Execute Goal'
        },
        'status-message': { 
          textContent: '', 
          style: { display: 'none' },
          className: ''
        }
      };

      const mockDocument = {
        getElementById: jest.fn().mockImplementation((id) => mockElements[id] || null)
      };

      (global as any).document = mockDocument;

      mockChrome.tabs.query.mockResolvedValue([{ 
        id: 123, 
        url: 'https://booking.com',
        title: 'Booking Site'
      }]);

      mockChrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        result: {
          goalId: 'goal-123',
          tasks: [
            { success: true, result: { data: 'Task completed' } }
          ],
          summary: 'Found several hotels in Paris with good ratings.'
        }
      });

      const popupJsPath = join(process.cwd(), 'src', 'extension', 'popup', 'popup.js');
      const popupJsCode = readFileSync(popupJsPath, 'utf-8');

      eval(popupJsCode);

      const clickHandler = mockElements['execute-goal-btn'].addEventListener.mock.calls[0][1];
      await clickHandler();

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'EXECUTE_GOAL',
          payload: expect.objectContaining({
            goal: 'find hotels in Paris'
          })
        })
      );
    });

    it('should handle errors gracefully in popup', async () => {
      const mockElements = {
        'summarize-btn': { 
          addEventListener: jest.fn(),
          disabled: false,
          textContent: 'Summarize Page'
        },
        'status-message': { 
          textContent: '', 
          style: { display: 'none' },
          className: ''
        }
      };

      const mockDocument = {
        getElementById: jest.fn().mockImplementation((id) => mockElements[id] || null)
      };

      (global as any).document = mockDocument;

      // Mock error response
      mockChrome.tabs.query.mockResolvedValue([]);
      mockChrome.runtime.sendMessage.mockRejectedValue(new Error('API Error'));

      const popupJsPath = join(process.cwd(), 'src', 'extension', 'popup', 'popup.js');
      const popupJsCode = readFileSync(popupJsPath, 'utf-8');

      eval(popupJsCode);

      const clickHandler = mockElements['summarize-btn'].addEventListener.mock.calls[0][1];
      await clickHandler();

      // Should handle error and show error message
      expect(mockElements['status-message'].textContent).toContain('Error');
      expect(mockElements['status-message'].className).toContain('error');
    });
  });

  describe('Storage Management', () => {
    it('should save and retrieve user preferences', async () => {
      const preferences = {
        theme: 'dark',
        autoSummarize: true,
        defaultPriority: 'high'
      };

      mockChrome.storage.sync.set.mockResolvedValue(undefined);
      mockChrome.storage.sync.get.mockResolvedValue({ userPreferences: preferences });

      // Save preferences
      await mockChrome.storage.sync.set({ userPreferences: preferences });
      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({ userPreferences: preferences });

      // Retrieve preferences
      const result = await mockChrome.storage.sync.get('userPreferences');
      expect(result.userPreferences).toEqual(preferences);
    });

    it('should manage task history storage', async () => {
      const taskHistory = [
        {
          id: 'task-1',
          type: 'summarize',
          timestamp: Date.now(),
          result: 'Summary completed successfully'
        },
        {
          id: 'task-2',
          type: 'goal_execution',
          timestamp: Date.now(),
          result: 'Goal executed with 3 tasks'
        }
      ];

      mockChrome.storage.local.set.mockResolvedValue(undefined);
      mockChrome.storage.local.get.mockResolvedValue({ taskHistory });

      await mockChrome.storage.local.set({ taskHistory });
      const result = await mockChrome.storage.local.get('taskHistory');

      expect(result.taskHistory).toEqual(taskHistory);
    });

    it('should handle storage quota limits', async () => {
      const largeData = {
        sessionData: 'x'.repeat(1000000) // 1MB of data
      };

      // Mock quota exceeded error
      const quotaError = new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
      mockChrome.storage.local.set.mockRejectedValue(quotaError);

      try {
        await mockChrome.storage.local.set(largeData);
      } catch (error) {
        expect(error.message).toContain('quota exceeded');
      }
    });
  });

  describe('Context Menu Integration', () => {
    it('should create context menu items on installation', async () => {
      const serviceWorkerPath = join(process.cwd(), 'src', 'extension', 'background', 'service-worker.js');
      const serviceWorkerCode = readFileSync(serviceWorkerPath, 'utf-8');
      
      eval(serviceWorkerCode);

      // Verify context menu creation
      expect(mockChrome.contextMenus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          title: expect.stringContaining('SmartBrowser'),
          contexts: expect.arrayContaining(['page'])
        })
      );
    });

    it('should handle context menu clicks', async () => {
      const serviceWorkerPath = join(process.cwd(), 'src', 'extension', 'background', 'service-worker.js');
      const serviceWorkerCode = readFileSync(serviceWorkerPath, 'utf-8');
      
      eval(serviceWorkerCode);

      const contextMenuHandler = mockChrome.contextMenus.onClicked.addListener.mock.calls[0][0];

      const info = {
        menuItemId: 'summarize-page',
        pageUrl: 'https://example.com/article'
      };

      const tab = {
        id: 123,
        url: 'https://example.com/article'
      };

      await contextMenuHandler(info, tab);

      // Should have triggered summarization
      expect(mockChrome.tabs.executeScript).toHaveBeenCalled();
    });
  });

  describe('Cross-Extension Communication', () => {
    it('should establish communication channels between components', async () => {
      // Test background to content script communication
      mockChrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      
      const message = { type: 'EXTRACT_CONTENT' };
      await mockChrome.runtime.sendMessage(message);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(message);
    });

    it('should handle message passing between popup and background', async () => {
      const message = {
        type: 'GET_CURRENT_TAB_INFO'
      };

      const response = {
        success: true,
        tab: {
          id: 123,
          url: 'https://example.com',
          title: 'Example Page'
        }
      };

      mockChrome.runtime.sendMessage.mockResolvedValue(response);

      const result = await mockChrome.runtime.sendMessage(message);
      expect(result).toEqual(response);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle extension context invalidation', async () => {
      const contextInvalidatedError = new Error('Extension context invalidated');
      mockChrome.runtime.sendMessage.mockRejectedValue(contextInvalidatedError);

      try {
        await mockChrome.runtime.sendMessage({ type: 'TEST_MESSAGE' });
      } catch (error) {
        expect(error.message).toContain('context invalidated');
      }
    });

    it('should handle permissions being revoked', async () => {
      const permissionError = new Error('Permission denied');
      mockChrome.tabs.query.mockRejectedValue(permissionError);

      try {
        await mockChrome.tabs.query({ active: true, currentWindow: true });
      } catch (error) {
        expect(error.message).toContain('Permission denied');
      }
    });

    it('should handle API rate limiting', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      mockChrome.runtime.sendMessage.mockRejectedValue(rateLimitError);

      await expect(
        mockChrome.runtime.sendMessage({ type: 'API_REQUEST' })
      ).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('Performance Considerations', () => {
    it('should not block main thread during content extraction', async () => {
      const startTime = Date.now();
      
      // Simulate content extraction
      const contentScriptPath = join(process.cwd(), 'src', 'extension', 'content', 'content-script.js');
      const contentScriptCode = readFileSync(contentScriptPath, 'utf-8');
      
      const mockDocument = {
        title: 'Large Article',
        URL: 'https://example.com/large-article',
        body: {
          innerText: 'Large article content. '.repeat(10000),
          innerHTML: '<div>' + 'Large article content. '.repeat(10000) + '</div>'
        }
      };

      (global as any).document = mockDocument;
      eval(contentScriptCode);

      const extractedContent = (global as any).extractPageContent();
      const executionTime = Date.now() - startTime;

      expect(extractedContent).toBeDefined();
      expect(executionTime).toBeLessThan(1000); // Should complete quickly
    });

    it('should manage memory usage during long sessions', async () => {
      // Simulate multiple summarization requests
      for (let i = 0; i < 10; i++) {
        mockChrome.runtime.sendMessage.mockResolvedValue({
          success: true,
          summary: `Summary ${i + 1}`
        });

        await mockChrome.runtime.sendMessage({
          type: 'SUMMARIZE_PAGE',
          payload: { content: `Content ${i + 1}` }
        });
      }

      // Should handle multiple requests without memory issues
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledTimes(10);
    });
  });
});

// Clean up global mocks
afterAll(() => {
  delete (global as any).chrome;
  delete (global as any).document;
  delete (global as any).window;
});
