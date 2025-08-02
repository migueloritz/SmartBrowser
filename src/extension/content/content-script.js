// SmartBrowser Content Script
class SmartBrowserContent {
    constructor() {
        this.isInitialized = false;
        this.pageAnalysis = null;
        
        this.init();
    }

    async init() {
        if (this.isInitialized) return;
        
        // Wait for page to be fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.onPageReady());
        } else {
            this.onPageReady();
        }
        
        this.setupMessageHandlers();
        this.isInitialized = true;
    }

    onPageReady() {
        console.log('SmartBrowser: Content script loaded for', window.location.href);
        
        // Analyze page structure
        this.analyzePageStructure();
        
        // Notify background script
        chrome.runtime.sendMessage({
            type: 'PAGE_LOADED',
            data: {
                url: window.location.href,
                title: document.title,
                analysis: this.pageAnalysis
            }
        });
    }

    setupMessageHandlers() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('SmartBrowser: Received message', message);
            
            switch (message.type) {
                case 'GET_PAGE_CONTENT':
                    this.handleGetPageContent(sendResponse);
                    return true; // Keep message channel open for async response
                
                case 'EXTRACT_STRUCTURED_DATA':
                    this.handleExtractStructuredData(message.schema, sendResponse);
                    return true;
                
                case 'INTERACT_WITH_PAGE':
                    this.handlePageInteraction(message.action, sendResponse);
                    return true;
                
                case 'ANALYZE_PAGE':
                    this.handleAnalyzePage(sendResponse);
                    return true;
                
                default:
                    console.log('SmartBrowser: Unknown message type', message.type);
            }
        });
    }

    analyzePageStructure() {
        try {
            const analysis = {
                hasArticleContent: this.detectArticleContent(),
                hasSearchForm: this.detectSearchForm(),
                hasProductInfo: this.detectProductInfo(),
                hasSocialContent: this.detectSocialContent(),
                interactiveElements: this.findInteractiveElements(),
                pageType: this.detectPageType(),
                readabilityScore: this.calculateReadabilityScore(),
                timestamp: new Date().toISOString()
            };
            
            this.pageAnalysis = analysis;
            console.log('SmartBrowser: Page analysis completed', analysis);
        } catch (error) {
            console.error('SmartBrowser: Page analysis failed', error);
            this.pageAnalysis = { error: error.message };
        }
    }

    detectArticleContent() {
        const articleSelectors = [
            'article',
            '[role="article"]',
            '.article',
            '.post',
            '.content',
            'main',
            '.main-content'
        ];
        
        for (const selector of articleSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.length > 500) {
                return true;
            }
        }
        
        // Check for multiple paragraphs
        const paragraphs = document.querySelectorAll('p');
        if (paragraphs.length >= 3) {
            const totalText = Array.from(paragraphs)
                .map(p => p.textContent || '')
                .join(' ');
            return totalText.length > 500;
        }
        
        return false;
    }

    detectSearchForm() {
        const searchSelectors = [
            'input[type="search"]',
            'input[name*="search"]',
            'input[placeholder*="search"]',
            'input[id*="search"]',
            '.search-input',
            '#search'
        ];
        
        return searchSelectors.some(selector => document.querySelector(selector));
    }

    detectProductInfo() {
        const productSelectors = [
            '.price',
            '.product-price',
            '[data-price]',
            '.add-to-cart',
            '.buy-now',
            '.product-title',
            '.product-description'
        ];
        
        return productSelectors.some(selector => document.querySelector(selector));
    }

    detectSocialContent() {
        const socialSelectors = [
            '.tweet',
            '.post',
            '.status',
            '[data-testid="tweet"]',
            '.feed-item',
            '.social-post'
        ];
        
        return socialSelectors.some(selector => document.querySelector(selector));
    }

    findInteractiveElements() {
        const elements = [];
        
        // Find buttons
        document.querySelectorAll('button, input[type="submit"], input[type="button"]').forEach(btn => {
            if (btn.offsetWidth > 0 && btn.offsetHeight > 0) { // Visible elements only
                elements.push({
                    type: 'button',
                    text: btn.textContent.trim() || btn.value || btn.getAttribute('aria-label'),
                    selector: this.generateSelector(btn)
                });
            }
        });
        
        // Find links
        document.querySelectorAll('a[href]').forEach(link => {
            if (link.offsetWidth > 0 && link.offsetHeight > 0) {
                elements.push({
                    type: 'link',
                    text: link.textContent.trim(),
                    href: link.href,
                    selector: this.generateSelector(link)
                });
            }
        });
        
        // Find form inputs
        document.querySelectorAll('input, textarea, select').forEach(input => {
            if (input.offsetWidth > 0 && input.offsetHeight > 0) {
                elements.push({
                    type: 'input',
                    inputType: input.type || input.tagName.toLowerCase(),
                    placeholder: input.placeholder,
                    name: input.name,
                    selector: this.generateSelector(input)
                });
            }
        });
        
        return elements.slice(0, 20); // Limit to first 20 elements
    }

    detectPageType() {
        const url = window.location.href.toLowerCase();
        const title = document.title.toLowerCase();
        const content = document.body.textContent.toLowerCase();
        
        // E-commerce patterns
        if (this.detectProductInfo() || 
            url.includes('shop') || 
            url.includes('store') || 
            url.includes('product')) {
            return 'ecommerce';
        }
        
        // Search results
        if (url.includes('search') || 
            title.includes('search results') ||
            document.querySelector('.search-results')) {
            return 'search';
        }
        
        // News/Blog
        if (this.detectArticleContent() || 
            url.includes('blog') || 
            url.includes('news') ||
            url.includes('article')) {
            return 'article';
        }
        
        // Social media
        if (this.detectSocialContent() ||
            url.includes('twitter.com') ||
            url.includes('facebook.com') ||
            url.includes('linkedin.com')) {
            return 'social';
        }
        
        return 'general';
    }

    calculateReadabilityScore() {
        try {
            const textContent = document.body.textContent || '';
            const words = textContent.trim().split(/\s+/).length;
            const sentences = textContent.split(/[.!?]+/).length;
            
            if (words === 0 || sentences === 0) return 0;
            
            // Simple readability approximation
            const avgWordsPerSentence = words / sentences;
            
            // Score based on average sentence length (lower is better)
            let score = 1.0;
            if (avgWordsPerSentence > 20) score -= 0.3;
            if (avgWordsPerSentence > 30) score -= 0.3;
            if (avgWordsPerSentence < 10) score += 0.2;
            
            return Math.max(0, Math.min(1, score));
        } catch (error) {
            return 0.5; // Default score on error
        }
    }

    generateSelector(element) {
        // Generate a simple CSS selector for an element
        if (element.id) {
            return `#${element.id}`;
        }
        
        if (element.className) {
            const classes = element.className.split(' ').filter(c => c.length > 0);
            if (classes.length > 0) {
                return `.${classes[0]}`;
            }
        }
        
        const tagName = element.tagName.toLowerCase();
        const parent = element.parentElement;
        
        if (parent) {
            const siblings = Array.from(parent.children).filter(el => el.tagName === element.tagName);
            if (siblings.length > 1) {
                const index = siblings.indexOf(element);
                return `${tagName}:nth-child(${index + 1})`;
            }
        }
        
        return tagName;
    }

    handleGetPageContent(sendResponse) {
        try {
            const content = {
                url: window.location.href,
                title: document.title,
                html: document.documentElement.outerHTML.substring(0, 50000), // Limit HTML size
                text: document.body.textContent || '',
                metadata: {
                    description: document.querySelector('meta[name="description"]')?.content,
                    keywords: document.querySelector('meta[name="keywords"]')?.content,
                    author: document.querySelector('meta[name="author"]')?.content,
                    language: document.documentElement.lang || 'en'
                },
                analysis: this.pageAnalysis,
                extractedAt: new Date().toISOString()
            };
            
            sendResponse({ success: true, content });
        } catch (error) {
            console.error('SmartBrowser: Failed to get page content', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    handleExtractStructuredData(schema, sendResponse) {
        try {
            const data = {};
            
            // This is a simple implementation - in production, use more sophisticated extraction
            schema.fields?.forEach(field => {
                const selectors = this.getSelectorsForField(field);
                
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        data[field.name] = this.extractValueFromElement(element, field.type);
                        break;
                    }
                }
            });
            
            sendResponse({ success: true, data });
        } catch (error) {
            console.error('SmartBrowser: Failed to extract structured data', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    getSelectorsForField(field) {
        const fieldName = field.name.toLowerCase();
        const commonSelectors = [];
        
        // Generate potential selectors based on field name
        commonSelectors.push(
            `[data-${fieldName}]`,
            `#${fieldName}`,
            `.${fieldName}`,
            `[name="${fieldName}"]`,
            `[class*="${fieldName}"]`
        );
        
        // Add specific selectors based on field type
        switch (field.type) {
            case 'price':
                commonSelectors.push('.price', '.cost', '[data-price]', '.amount');
                break;
            case 'title':
                commonSelectors.push('h1', 'h2', '.title', '.headline', '.product-title');
                break;
            case 'description':
                commonSelectors.push('.description', '.summary', '.excerpt', 'p');
                break;
        }
        
        return commonSelectors;
    }

    extractValueFromElement(element, type) {
        const text = element.textContent.trim();
        
        switch (type) {
            case 'number':
                const num = parseFloat(text.replace(/[^\d.-]/g, ''));
                return isNaN(num) ? null : num;
            case 'date':
                const date = new Date(text);
                return isNaN(date.getTime()) ? null : date.toISOString();
            case 'array':
                return text.split(/[,;]/).map(item => item.trim()).filter(item => item.length > 0);
            default:
                return text;
        }
    }

    handlePageInteraction(action, sendResponse) {
        try {
            const { type, selector, value, timeout = 5000 } = action;
            
            const element = document.querySelector(selector);
            if (!element) {
                throw new Error(`Element not found: ${selector}`);
            }
            
            switch (type) {
                case 'click':
                    element.click();
                    break;
                case 'fill':
                    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                        element.value = value;
                        element.dispatchEvent(new Event('input', { bubbles: true }));
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    break;
                case 'scroll':
                    element.scrollIntoView({ behavior: 'smooth' });
                    break;
                default:
                    throw new Error(`Unknown interaction type: ${type}`);
            }
            
            sendResponse({ success: true });
        } catch (error) {
            console.error('SmartBrowser: Failed to interact with page', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    handleAnalyzePage(sendResponse) {
        this.analyzePageStructure();
        sendResponse({ 
            success: true, 
            analysis: this.pageAnalysis 
        });
    }
}

// Initialize content script
if (typeof window !== 'undefined' && window.location) {
    new SmartBrowserContent();
}