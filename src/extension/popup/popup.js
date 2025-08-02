// SmartBrowser Extension Popup Script
class SmartBrowserPopup {
    constructor() {
        this.apiBase = 'http://localhost:3000/api';
        this.currentTab = null;
        this.isLoading = false;
        
        this.init();
    }

    async init() {
        await this.setupEventListeners();
        await this.loadCurrentTab();
        await this.checkServerStatus();
        await this.loadHistory();
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Action buttons
        document.getElementById('summarizeBtn').addEventListener('click', () => {
            this.summarizePage();
        });

        document.getElementById('executeGoalBtn').addEventListener('click', () => {
            this.executeGoal();
        });

        // Notification close buttons
        document.getElementById('closeError').addEventListener('click', () => {
            this.hideNotification('error');
        });

        document.getElementById('closeSuccess').addEventListener('click', () => {
            this.hideNotification('success');
        });

        // Goal input enter key
        document.getElementById('goalInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                this.executeGoal();
            }
        });
    }

    async loadCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTab = tab;
            
            document.getElementById('pageTitle').textContent = tab.title || 'Untitled';
            document.getElementById('pageUrl').textContent = tab.url || '';
            
            // Enable/disable buttons based on URL
            const isValidUrl = tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'));
            document.getElementById('summarizeBtn').disabled = !isValidUrl;
            
            if (!isValidUrl) {
                this.showNotification('error', 'Cannot process this page. Please navigate to a web page.');
            }
        } catch (error) {
            console.error('Failed to load current tab:', error);
            this.showNotification('error', 'Failed to load current page information.');
        }
    }

    async checkServerStatus() {
        try {
            const response = await fetch(`${this.apiBase}/../health`);
            const data = await response.json();
            
            if (data.success) {
                this.updateStatus('connected', 'Connected');
            } else {
                this.updateStatus('error', 'Server Error');
            }
        } catch (error) {
            console.error('Server health check failed:', error);
            this.updateStatus('error', 'Server Offline');
            this.showNotification('error', 'SmartBrowser server is not running. Please start the server and refresh.');
        }
    }

    updateStatus(type, text) {
        const indicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        indicator.className = `status-indicator ${type}`;
        statusText.textContent = text;
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        // Load data for specific tabs
        if (tabName === 'history') {
            this.loadHistory();
        }
    }

    async summarizePage() {
        if (this.isLoading || !this.currentTab || !this.currentTab.url) {
            return;
        }

        this.setLoading(true, 'Analyzing page content...');
        
        try {
            const response = await fetch(`${this.apiBase}/summarize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': this.getUserId()
                },
                body: JSON.stringify({
                    url: this.currentTab.url,
                    options: {
                        maxLength: 'detailed',
                        format: 'structured'
                    }
                })
            });

            const data = await response.json();
            
            if (data.success) {
                this.displaySummaryResult(data.data);
                this.showNotification('success', 'Page summarized successfully!');
            } else {
                throw new Error(data.error || 'Summarization failed');
            }
        } catch (error) {
            console.error('Summarization failed:', error);
            this.showNotification('error', `Summarization failed: ${error.message}`);
        } finally {
            this.setLoading(false);
        }
    }

    async executeGoal() {
        const goalInput = document.getElementById('goalInput');
        const prioritySelect = document.getElementById('prioritySelect');
        
        const goal = goalInput.value.trim();
        if (!goal) {
            this.showNotification('error', 'Please enter a goal to execute.');
            return;
        }

        if (this.isLoading) {
            return;
        }

        this.setLoading(true, 'Analyzing goal and creating action plan...');
        
        try {
            const response = await fetch(`${this.apiBase}/execute-goal`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': this.getUserId()
                },
                body: JSON.stringify({
                    goal: goal,
                    priority: prioritySelect.value,
                    context: {
                        currentUrl: this.currentTab?.url
                    }
                })
            });

            const data = await response.json();
            
            if (data.success) {
                this.displayGoalResult(data.data);
                this.showNotification('success', 'Goal executed successfully!');
                goalInput.value = ''; // Clear input
            } else {
                throw new Error(data.error || 'Goal execution failed');
            }
        } catch (error) {
            console.error('Goal execution failed:', error);
            this.showNotification('error', `Goal execution failed: ${error.message}`);
        } finally {
            this.setLoading(false);
        }
    }

    displaySummaryResult(data) {
        const resultContainer = document.getElementById('summaryResult');
        const summaryContent = document.getElementById('summaryContent');
        const summaryMeta = document.getElementById('summaryMeta');
        const keyPoints = document.getElementById('keyPoints');
        const keyPointsList = document.getElementById('keyPointsList');
        
        // Show result container
        resultContainer.style.display = 'block';
        
        // Display summary
        summaryContent.textContent = data.summary.summary;
        
        // Display metadata
        const processingTime = Math.round(data.processingTime / 1000 * 100) / 100;
        summaryMeta.textContent = `Processing time: ${processingTime}s | Confidence: ${Math.round(data.extraction.confidence * 100)}%`;
        
        // Display key points if available
        if (data.summary.keyPoints && data.summary.keyPoints.length > 0) {
            keyPointsList.innerHTML = '';
            data.summary.keyPoints.forEach(point => {
                const li = document.createElement('li');
                li.textContent = point;
                keyPointsList.appendChild(li);
            });
            keyPoints.style.display = 'block';
        } else {
            keyPoints.style.display = 'none';
        }
        
        // Scroll to result
        resultContainer.scrollIntoView({ behavior: 'smooth' });
    }

    displayGoalResult(data) {
        const resultContainer = document.getElementById('goalResult');
        const goalContent = document.getElementById('goalContent');
        const goalMeta = document.getElementById('goalMeta');
        const taskList = document.getElementById('taskList');
        const taskItems = document.getElementById('taskItems');
        
        // Show result container
        resultContainer.style.display = 'block';
        
        // Display summary
        goalContent.textContent = data.summary;
        
        // Display metadata
        const executionTime = Math.round(data.executionTime / 1000 * 100) / 100;
        goalMeta.textContent = `Execution time: ${executionTime}s | Tasks: ${data.successfulTasks}/${data.tasksExecuted}`;
        
        // Display tasks if available
        if (data.tasks && data.tasks.length > 0) {
            taskItems.innerHTML = '';
            data.tasks.forEach(task => {
                const div = document.createElement('div');
                div.className = 'task-item';
                
                const status = document.createElement('div');
                status.className = `task-status ${task.success ? 'success' : 'error'}`;
                
                const text = document.createElement('span');
                text.textContent = `${task.executor || 'Unknown'}: ${task.success ? 'Success' : task.error || 'Failed'}`;
                
                div.appendChild(status);
                div.appendChild(text);
                taskItems.appendChild(div);
            });
            taskList.style.display = 'block';
        } else {
            taskList.style.display = 'none';
        }
        
        // Scroll to result
        resultContainer.scrollIntoView({ behavior: 'smooth' });
    }

    async loadHistory() {
        const historyList = document.getElementById('historyList');
        
        try {
            const response = await fetch(`${this.apiBase}/history`, {
                headers: {
                    'X-User-Id': this.getUserId()
                }
            });

            const data = await response.json();
            
            if (data.success && data.data.recentTasks) {
                this.displayHistory(data.data.recentTasks);
            } else {
                historyList.innerHTML = '<div class="loading">No recent activity</div>';
            }
        } catch (error) {
            console.error('Failed to load history:', error);
            historyList.innerHTML = '<div class="loading">Failed to load history</div>';
        }
    }

    displayHistory(tasks) {
        const historyList = document.getElementById('historyList');
        
        if (!tasks || tasks.length === 0) {
            historyList.innerHTML = '<div class="loading">No recent activity</div>';
            return;
        }

        historyList.innerHTML = '';
        
        tasks.reverse().forEach(task => {
            const item = document.createElement('div');
            item.className = 'history-item';
            
            const title = document.createElement('div');
            title.className = 'history-title';
            title.textContent = task.success ? 
                `✅ Task completed` : 
                `❌ Task failed: ${task.error || 'Unknown error'}`;
            
            const meta = document.createElement('div');
            meta.className = 'history-meta';
            const date = new Date(task.metadata?.endTime || Date.now());
            meta.textContent = `${date.toLocaleTimeString()} | ${Math.round(task.executionTime / 1000 * 100) / 100}s`;
            
            item.appendChild(title);
            item.appendChild(meta);
            historyList.appendChild(item);
        });
    }

    setLoading(loading, text = 'Processing...') {
        this.isLoading = loading;
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');
        
        if (loading) {
            loadingText.textContent = text;
            overlay.style.display = 'flex';
            
            // Disable buttons
            document.querySelectorAll('.btn').forEach(btn => {
                btn.disabled = true;
            });
        } else {
            overlay.style.display = 'none';
            
            // Re-enable buttons
            document.querySelectorAll('.btn').forEach(btn => {
                btn.disabled = false;
            });
            
            // Re-check URL validity for summarize button
            if (this.currentTab) {
                const isValidUrl = this.currentTab.url && 
                    (this.currentTab.url.startsWith('http://') || this.currentTab.url.startsWith('https://'));
                document.getElementById('summarizeBtn').disabled = !isValidUrl;
            }
        }
    }

    showNotification(type, message) {
        const notification = document.getElementById(`${type}Notification`);
        const text = document.getElementById(`${type}Text`);
        
        text.textContent = message;
        notification.style.display = 'flex';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.hideNotification(type);
        }, 5000);
    }

    hideNotification(type) {
        const notification = document.getElementById(`${type}Notification`);
        notification.style.display = 'none';
    }

    getUserId() {
        // Generate a simple user ID (in production, use proper authentication)
        let userId = localStorage.getItem('smartbrowser-user-id');
        if (!userId) {
            userId = 'user-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('smartbrowser-user-id', userId);
        }
        return userId;
    }
}

// Initialize the popup when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SmartBrowserPopup();
});