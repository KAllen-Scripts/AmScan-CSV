// Sync Controller - Coordinates SFTP sync operations with the UI
// Browser-side controller that communicates with main process

class SyncController {
    constructor() {
        this.isInitialized = false;
        this.syncStatus = {
            isRunning: false,
            lastSync: null,
            totalProcessed: 0,
            errors: 0
        };
        
        this.init();
    }

    async init() {
        // Wait for DOM and credentials handler to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupUI());
        } else {
            this.setupUI();
        }
        
        this.isInitialized = true;
    }

    setupUI() {
        // Initialize sidebar manager if not already done
        if (!window.sidebarManager) {
            window.sidebarManager = new SidebarManager();
        }
        
        // Auto-start sync after a short delay to allow everything to initialize
        setTimeout(() => {
            this.autoStartSync();
        }, 2000);
    }

    addSyncControls() {
        // No UI controls needed - sync runs automatically
    }

    addSyncStyles() {
        // No styles needed for sync controls
    }

    setupEventListeners() {
        // No event listeners needed for sync controls
    }

    async autoStartSync() {
        try {
            // Check if credentials and config are available
            const validation = await this.validateSyncRequirements();
            if (!validation.valid) {
                console.log(`Cannot auto-start sync: ${validation.message}`);
                return;
            }

            console.log('Auto-starting sync...');

            // Start auto sync automatically
            const result = await window.electronAPI.startAutoSync({
                credentials: validation.ftpCredentials,
                remotePath: validation.ftpCredentials.directory || '/',
                intervalMinutes: validation.syncInterval
            });

            if (result.success) {
                this.syncStatus.isRunning = true;
                console.log(`Auto sync started - running every ${validation.syncInterval} minutes`);
                
                // Add result to sidebar
                window.sidebarManager.addResult({
                    type: 'auto_sync_started',
                    timestamp: new Date().toISOString(),
                    intervalMinutes: validation.syncInterval,
                    autoStarted: true
                });
            } else {
                throw new Error(result.error || 'Failed to auto-start sync');
            }

        } catch (error) {
            console.error('Failed to auto-start sync:', error);
        }
    }

    async validateSyncRequirements() {
        // Check FTP credentials
        if (!window.ftpCredentials || !window.ftpCredentials.isLoaded) {
            return { valid: false, message: 'FTP credentials not configured' };
        }

        const ftpCredentials = {
            host: window.ftpCredentials.host,
            port: window.ftpCredentials.port || 22,
            username: window.ftpCredentials.username,
            password: window.ftpCredentials.password,
            directory: window.ftpCredentials.directory || '/'
        };

        if (!ftpCredentials.host || !ftpCredentials.username || !ftpCredentials.password) {
            return { valid: false, message: 'Incomplete FTP credentials' };
        }

        // Check sync interval
        const syncInterval = document.getElementById('syncInterval')?.value;
        if (!syncInterval) {
            return { valid: false, message: 'Sync interval not configured' };
        }

        const intervalMinutes = parseFloat(syncInterval);
        if (isNaN(intervalMinutes) || intervalMinutes <= 0) {
            return { valid: false, message: 'Invalid sync interval' };
        }

        return {
            valid: true,
            ftpCredentials,
            syncInterval: intervalMinutes
        };
    }

    updateSyncStatus(message, type = 'info') {
        // No UI status updates needed - just log to console
        console.log(`Sync Status: ${message}`);
    }

    // Public methods for external access
    getSyncStatus() {
        return this.syncStatus;
    }

    async refreshStatus() {
        if (window.electronAPI && window.electronAPI.getSyncStatus) {
            try {
                const status = await window.electronAPI.getSyncStatus();
                this.syncStatus = { ...this.syncStatus, ...status };
                
                if (status.isRunning) {
                    console.log('Auto sync is running');
                }
            } catch (error) {
                console.error('Error refreshing sync status:', error);
            }
        }
    }
}

// Simple Sidebar Manager for displaying results
class SidebarManager {
    constructor() {
        this.results = [];
        this.maxResults = 50; // Keep last 50 results
        this.setupSidebar();
    }

    setupSidebar() {
        // Set up sidebar toggle functionality
        const floatingToggle = document.getElementById('floatingSidebarToggle');
        const sidebarToggle = document.getElementById('sidebarToggle');
        const clearResults = document.getElementById('clearResults');
        const sidebar = document.getElementById('processingsidebar');
        const appContainer = document.querySelector('.app-container');

        if (floatingToggle && sidebar && appContainer) {
            floatingToggle.addEventListener('click', () => {
                sidebar.classList.remove('collapsed');
                appContainer.classList.remove('sidebar-collapsed');
            });

            sidebarToggle.addEventListener('click', () => {
                sidebar.classList.add('collapsed');
                appContainer.classList.add('sidebar-collapsed');
            });

            clearResults.addEventListener('click', () => {
                this.clearResults();
            });
        }
    }

    addResult(result) {
        const resultWithId = {
            id: Date.now() + Math.random(),
            ...result
        };

        this.results.unshift(resultWithId);
        
        // Keep only the last maxResults
        if (this.results.length > this.maxResults) {
            this.results = this.results.slice(0, this.maxResults);
        }

        this.updateSidebarContent();
    }

    updateSidebarContent() {
        const resultsList = document.getElementById('resultsList');
        const noResults = document.getElementById('noResults');

        if (!resultsList || !noResults) return;

        if (this.results.length === 0) {
            noResults.style.display = 'flex';
            resultsList.style.display = 'none';
            return;
        }

        noResults.style.display = 'none';
        resultsList.style.display = 'block';

        resultsList.innerHTML = this.results.map(result => this.formatResult(result)).join('');
    }

    formatResult(result) {
        const time = new Date(result.timestamp).toLocaleTimeString();
        const icon = this.getResultIcon(result.type);
        const status = result.success === false ? 'error' : 'success';

        let content = '';
        switch (result.type) {
            case 'test_sync':
                content = result.success 
                    ? `Test completed - ${result.processedCount} new files`
                    : `Test failed: ${result.error}`;
                break;
            case 'sync_completed':
                content = `Sync completed - ${result.processedCount} new files processed`;
                break;
            case 'file_processed':
                content = `File processed: ${result.fileName} (${result.contentLength} chars)`;
                break;
            case 'auto_sync_started':
                content = result.autoStarted 
                    ? `Auto sync started automatically (${result.intervalMinutes}min interval)`
                    : `Auto sync started (${result.intervalMinutes}min interval)`;
                break;
            case 'auto_sync_stopped':
                content = result.manualStop 
                    ? 'Auto sync stopped manually - will restart on app restart'
                    : 'Auto sync stopped';
                break;
            case 'sync_error':
                content = `Sync error: ${result.error}`;
                break;
            default:
                content = 'Sync operation completed';
        }

        return `
            <div class="result-item ${status}">
                <div class="result-header">
                    <span class="result-icon">${icon}</span>
                    <span class="result-time">${time}</span>
                </div>
                <div class="result-content">${content}</div>
            </div>
        `;
    }

    getResultIcon(type) {
        const icons = {
            test_sync: '🧪',
            sync_completed: '✅',
            file_processed: '📄',
            auto_sync_started: '▶️',
            auto_sync_stopped: '⏹️',
            sync_error: '❌'
        };
        return icons[type] || '📊';
    }

    clearResults() {
        this.results = [];
        this.updateSidebarContent();
    }
}

// Initialize sync controller when script loads
const syncController = new SyncController();
window.syncController = syncController;