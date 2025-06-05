// Sync Controller - Coordinates SFTP sync operations with the UI
// Browser-side controller that communicates with main process

class SyncController {
    constructor() {
        this.isInitialized = false;
        this.syncStatus = {
            isRunning: false,
            lastSync: null,
            totalProcessed: 0,
            totalDeleted: 0,
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

    // Public methods for manual operations
    async runCleanupOrphanedFiles() {
        try {
            const validation = await this.validateSyncRequirements();
            if (!validation.valid) {
                console.error(`Cannot run cleanup: ${validation.message}`);
                return;
            }

            console.log('Running cleanup of orphaned files...');
            
            const result = await window.electronAPI.cleanupOrphanedFiles({
                credentials: validation.ftpCredentials,
                remotePath: validation.ftpCredentials.directory || '/'
            });

            if (result.success) {
                console.log(`Cleanup completed: ${result.deletedCount} files deleted, ${result.errorCount} errors`);
                
                // Add result to sidebar
                window.sidebarManager.addResult({
                    type: 'cleanup_completed',
                    timestamp: new Date().toISOString(),
                    deletedCount: result.deletedCount,
                    errorCount: result.errorCount,
                    totalOrphaned: result.totalOrphaned
                });
            } else {
                throw new Error(result.error || 'Cleanup failed');
            }

        } catch (error) {
            console.error('Failed to run cleanup:', error);
            window.sidebarManager.addResult({
                type: 'cleanup_error',
                timestamp: new Date().toISOString(),
                error: error.message
            });
        }
    }

    async deleteSpecificFile(fileName) {
        try {
            const validation = await this.validateSyncRequirements();
            if (!validation.valid) {
                console.error(`Cannot delete file: ${validation.message}`);
                return;
            }

            console.log(`Manually deleting file: ${fileName}`);
            
            const result = await window.electronAPI.deleteRemoteFile({
                credentials: validation.ftpCredentials,
                remotePath: validation.ftpCredentials.directory || '/',
                fileName: fileName
            });

            if (result.success) {
                console.log(`Successfully deleted file: ${fileName}`);
                
                // Add result to sidebar
                window.sidebarManager.addResult({
                    type: 'manual_file_deleted',
                    timestamp: new Date().toISOString(),
                    fileName: fileName
                });
            } else {
                throw new Error(result.error || 'File deletion failed');
            }

        } catch (error) {
            console.error(`Failed to delete file ${fileName}:`, error);
            window.sidebarManager.addResult({
                type: 'manual_deletion_error',
                timestamp: new Date().toISOString(),
                fileName: fileName,
                error: error.message
            });
        }
    }

    updateSyncStatus(message, type = 'info') {
        // Log to console and update internal status
        console.log(`Sync Status: ${message}`);
        
        if (type === 'success') {
            this.syncStatus.lastSync = new Date().toISOString();
        }
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

// Enhanced Sidebar Manager for displaying results with deletion support
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
                let syncDetails = `${result.processedCount} files processed`;
                if (result.deletedCount !== undefined) {
                    syncDetails += `, ${result.deletedCount} deleted`;
                }
                if (result.skippedCount !== undefined && result.skippedCount > 0) {
                    syncDetails += `, ${result.skippedCount} skipped`;
                }
                if (result.deletionErrors && result.deletionErrors > 0) {
                    syncDetails += ` (${result.deletionErrors} deletion errors)`;
                }
                
                // Add debug mode indicators
                let debugInfo = '';
                if (result.debugDeleteFiles !== undefined || result.debugSkipProcessed !== undefined) {
                    const deleteStatus = result.debugDeleteFiles ? 'ON' : 'OFF';
                    const skipStatus = result.debugSkipProcessed ? 'ON' : 'OFF';
                    debugInfo = ` [🐛 DEBUG: Delete=${deleteStatus}, Skip=${skipStatus}]`;
                }
                
                content = `Sync completed - ${syncDetails}${debugInfo}`;
                break;
            case 'file_processed':
                content = `File processed: ${result.fileName} (${result.contentLength} chars)`;
                break;
            case 'file_deleted':
                const deletePrefix = result.debugMode ? '🐛 DEBUG: ' : '✅ ';
                content = `${deletePrefix}File deleted from server: ${result.fileName}`;
                break;
            case 'deletion_error':
                const errorPrefix = result.debugMode ? '🐛 DEBUG: ' : '⚠️ ';
                content = `${errorPrefix}Failed to delete: ${result.fileName} - ${result.error}`;
                break;
            case 'deletion_skipped':
                content = `🐛 DEBUG: Deletion SKIPPED: ${result.fileName} (left on server)`;
                break;
            case 'cleanup_completed':
                content = `Cleanup completed - ${result.deletedCount} orphaned files deleted, ${result.errorCount} errors`;
                break;
            case 'cleanup_error':
                content = `Cleanup failed: ${result.error}`;
                break;
            case 'manual_file_deleted':
                content = `Manually deleted: ${result.fileName}`;
                break;
            case 'manual_deletion_error':
                content = `Manual deletion failed: ${result.fileName} - ${result.error}`;
                break;
            case 'auto_sync_started':
                let startContent = result.autoStarted 
                    ? `Auto sync started automatically (${result.intervalMinutes}min interval)`
                    : `Auto sync started (${result.intervalMinutes}min interval)`;
                
                // Only add deletion info if we have debug info available
                if (result.debugDeleteFiles !== undefined) {
                    const deleteStatus = result.debugDeleteFiles ? 'ENABLED' : 'DISABLED';
                    startContent += ` - File deletion ${deleteStatus}`;
                }
                
                content = startContent;
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
            file_deleted: '🗑️',
            deletion_error: '⚠️',
            deletion_skipped: '⏭️',
            cleanup_completed: '🧹',
            cleanup_error: '❌',
            manual_file_deleted: '🗑️',
            manual_deletion_error: '⚠️',
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