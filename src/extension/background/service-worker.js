// SmartBrowser Service Worker
class SmartBrowserBackground {
    constructor() {
        this.apiBase = 'http://localhost:3000/api';
        this.tabSessions = new Map(); // Track tab sessions
        this.init();
    }

    init() {
        this.setupEventListeners();
        console.log('SmartBrowser: Background service worker initialized');
    }

    setupEventListeners() {
        // Tab events
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.handleTabUpdated(tabId, changeInfo, tab);
        });

        chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
            this.handleTabRemoved(tabId, removeInfo);
        });

        // Message handling
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });

        // Extension icon click
        chrome.action.onClicked.addListener((tab) => {
            this.handleIconClick(tab);
        });

        // Context menu setup (optional)
        this.setupContextMenus();
    }

    handleTabUpdated(tabId, changeInfo, tab) {
        // Track when tabs finish loading
        if (changeInfo.status === 'complete' && tab.url) {
            this.trackTabSession(tabId, tab);
            
            // Inject content script if needed
            if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
                this.injectContentScript(tabId);
            }
        }
    }

    handleTabRemoved(tabId, removeInfo) {
        // Clean up tab session data
        if (this.tabSessions.has(tabId)) {
            console.log(`SmartBrowser: Cleaning up session for tab ${tabId}`);
            this.tabSessions.delete(tabId);
        }
    }

    trackTabSession(tabId, tab) {
        const session = {
            tabId,
            url: tab.url,
            title: tab.title,
            startTime: Date.now(),
            lastActivity: Date.now(),
            interactions: 0
        };
        
        this.tabSessions.set(tabId, session);
        console.log('SmartBrowser: Tracking session for tab', tabId, tab.url);
    }

    async injectContentScript(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content/content-script.js']
            });
            console.log(`SmartBrowser: Content script injected into tab ${tabId}`);
        } catch (error) {
            console.error('SmartBrowser: Failed to inject content script', error);
        }
    }

    async handleMessage(message, sender, sendResponse) {
        console.log('SmartBrowser: Background received message', message.type);
        
        try {
            switch (message.type) {
                case 'PAGE_LOADED':
                    await this.handlePageLoaded(message.data, sender);
                    sendResponse({ success: true });
                    break;

                case 'API_REQUEST':
                    const result = await this.handleApiRequest(message.data);
                    sendResponse(result);
                    break;

                case 'GET_TAB_SESSIONS':
                    sendResponse({ 
                        success: true, 
                        sessions: Array.from(this.tabSessions.values()) 
                    });
                    break;

                case 'ANALYZE_CURRENT_TAB':
                    const analysis = await this.analyzeCurrentTab();
                    sendResponse(analysis);
                    break;

                default:
                    console.log('SmartBrowser: Unknown message type', message.type);
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('SmartBrowser: Error handling message', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async handlePageLoaded(data, sender) {
        const tabId = sender.tab?.id;
        if (!tabId) return;

        // Update session with page analysis
        const session = this.tabSessions.get(tabId);
        if (session) {
            session.lastActivity = Date.now();
            session.analysis = data.analysis;
            session.contentReady = true;
        }

        console.log('SmartBrowser: Page loaded with analysis', data.analysis);
        
        // Update extension badge based on page type
        if (data.analysis?.pageType) {
            this.updateBadge(tabId, data.analysis.pageType);
        }
    }

    async handleApiRequest(requestData) {
        try {
            const { endpoint, method = 'GET', body, headers = {} } = requestData;
            
            const response = await fetch(`${this.apiBase}${endpoint}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                body: body ? JSON.stringify(body) : undefined
            });

            const data = await response.json();
            
            return {
                success: response.ok,
                data: response.ok ? data : undefined,
                error: response.ok ? undefined : data.error || 'Request failed',
                status: response.status
            };
        } catch (error) {
            console.error('SmartBrowser: API request failed', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async analyzeCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) {
                throw new Error('No active tab found');
            }

            // Request page analysis from content script
            const response = await chrome.tabs.sendMessage(tab.id, {
                type: 'ANALYZE_PAGE'
            });

            return {
                success: true,
                analysis: response.analysis,
                tab: {
                    id: tab.id,
                    url: tab.url,
                    title: tab.title
                }
            };
        } catch (error) {
            console.error('SmartBrowser: Failed to analyze current tab', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    updateBadge(tabId, pageType) {
        const badgeText = {
            'article': '📄',
            'ecommerce': '🛒',
            'search': '🔍',
            'social': '💬',
            'general': ''
        }[pageType] || '';

        chrome.action.setBadgeText({
            text: badgeText,
            tabId: tabId
        });

        const badgeColor = {
            'article': '#28a745',
            'ecommerce': '#007bff',
            'search': '#ffc107',
            'social': '#dc3545',
            'general': '#6c757d'
        }[pageType] || '#6c757d';

        chrome.action.setBadgeBackgroundColor({
            color: badgeColor,
            tabId: tabId
        });
    }

    handleIconClick(tab) {
        // Icon click is handled by popup, but we can track the interaction
        const session = this.tabSessions.get(tab.id);
        if (session) {
            session.interactions++;
            session.lastActivity = Date.now();
        }
    }

    setupContextMenus() {
        // Remove existing context menus
        chrome.contextMenus.removeAll(() => {
            // Create context menu items
            chrome.contextMenus.create({
                id: 'smartbrowser-summarize',
                title: 'Summarize this page',
                contexts: ['page'],
                documentUrlPatterns: ['http://*/*', 'https://*/*']
            });

            chrome.contextMenus.create({
                id: 'smartbrowser-extract',
                title: 'Extract content',
                contexts: ['selection'],
                documentUrlPatterns: ['http://*/*', 'https://*/*']
            });
        });

        // Handle context menu clicks
        chrome.contextMenus.onClicked.addListener((info, tab) => {
            this.handleContextMenuClick(info, tab);
        });
    }

    async handleContextMenuClick(info, tab) {
        try {
            switch (info.menuItemId) {
                case 'smartbrowser-summarize':
                    await this.summarizePageFromContext(tab);
                    break;
                    
                case 'smartbrowser-extract':
                    await this.extractSelectionFromContext(info, tab);
                    break;
            }
        } catch (error) {
            console.error('SmartBrowser: Context menu action failed', error);
        }
    }

    async summarizePageFromContext(tab) {
        if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
            return;
        }

        try {
            // Make API request to summarize
            const result = await this.handleApiRequest({
                endpoint: '/summarize',
                method: 'POST',
                body: {
                    url: tab.url,
                    options: { maxLength: 'brief' }
                },
                headers: {
                    'X-User-Id': 'context-menu-user'
                }
            });

            if (result.success) {
                // Show notification
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'SmartBrowser',
                    message: 'Page summarized! Click the extension icon to view.'
                });
            }
        } catch (error) {
            console.error('SmartBrowser: Failed to summarize from context menu', error);
        }
    }

    async extractSelectionFromContext(info, tab) {
        if (!info.selectionText) return;

        try {
            // Send selected text to content script for processing
            await chrome.tabs.sendMessage(tab.id, {
                type: 'PROCESS_SELECTION',
                text: info.selectionText
            });
        } catch (error) {
            console.error('SmartBrowser: Failed to process selection', error);
        }
    }

    // Cleanup method for when service worker is terminated
    cleanup() {
        console.log('SmartBrowser: Service worker cleanup');
        this.tabSessions.clear();
    }

    // Get statistics
    getStats() {
        return {
            activeSessions: this.tabSessions.size,
            totalInteractions: Array.from(this.tabSessions.values())
                .reduce((sum, session) => sum + session.interactions, 0),
            oldestSession: Math.min(
                ...Array.from(this.tabSessions.values()).map(s => s.startTime)
            )
        };
    }
}

// Initialize background script
const smartBrowserBackground = new SmartBrowserBackground();

// Handle service worker lifecycle
self.addEventListener('message', (event) => {
    if (event.data === 'cleanup') {
        smartBrowserBackground.cleanup();
    }
});