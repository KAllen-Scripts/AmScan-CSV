// Simple Processing Results Manager for AmScan Order Processor

class ProcessingResultsManager {
    constructor() {
        this.results = {};
        this.initializeElements();
        this.setupEventListeners();
        this.updateDisplay();
    }

    initializeElements() {
        this.sidebar = document.getElementById('processingsidebar');
        this.sidebarContent = document.getElementById('sidebarContent');
        this.resultsList = document.getElementById('resultsList');
        this.noResults = document.getElementById('noResults');
        this.sidebarToggle = document.getElementById('sidebarToggle');
        this.floatingSidebarToggle = document.getElementById('floatingSidebarToggle');
        this.clearResults = document.getElementById('clearResults');
        
        // Initialize the sidebar state
        this.initializeSidebarState();
    }
    
    initializeSidebarState() {
        const appContainer = document.querySelector('.app-container');
        
        // Set initial state based on sidebar classes
        const isCollapsed = this.sidebar.classList.contains('collapsed');
        
        if (isCollapsed) {
            appContainer.classList.add('sidebar-collapsed');
            this.sidebarToggle.textContent = 'Show';
        } else {
            appContainer.classList.remove('sidebar-collapsed');
            this.sidebarToggle.textContent = 'Hide';
        }
    }

    setupEventListeners() {
        // Sidebar controls
        if (this.sidebarToggle) {
            this.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }
        
        if (this.floatingSidebarToggle) {
            this.floatingSidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }
        
        if (this.clearResults) {
            this.clearResults.addEventListener('click', () => this.clearAllResults());
        }
    }

    toggleSidebar() {
        const appContainer = document.querySelector('.app-container');
        if (!appContainer || !this.sidebar) {
            return;
        }
        
        // Check current state
        const isCollapsed = this.sidebar.classList.contains('collapsed');
        
        if (isCollapsed) {
            // Showing sidebar
            this.sidebar.classList.remove('collapsed');
            appContainer.classList.remove('sidebar-collapsed');
            
            if (this.sidebarToggle) {
                this.sidebarToggle.textContent = 'Hide';
            }
        } else {
            // Hiding sidebar
            this.sidebar.classList.add('collapsed');
            appContainer.classList.add('sidebar-collapsed');
            
            if (this.sidebarToggle) {
                this.sidebarToggle.textContent = 'Show';
            }
        }
    }

    // Add a processing result
    addResult(fileName, result) {
        const timestamp = new Date().toISOString();
        const uniqueKey = `${fileName}_${Date.now()}`;
        
        this.results[uniqueKey] = {
            fileName: fileName,
            timestamp: timestamp,
            success: result.success,
            hasWarnings: result.hasWarnings || false,
            skipped: result.skipped || false,
            data: result.orderData || null,
            error: result.error || null
        };
        
        this.updateDisplay();
    }

    // Get current count of results
    getResultsCount() {
        return Object.keys(this.results).length;
    }

    // Get all results as array
    getAllResults() {
        return Object.values(this.results);
    }

    // Update the display
    updateDisplay() {
        if (!this.resultsList || !this.noResults) {
            return;
        }
        
        // Clear existing results
        this.resultsList.innerHTML = '';
        
        const resultsCount = this.getResultsCount();
        
        // Show/hide no results message
        if (resultsCount === 0) {
            this.noResults.style.display = 'block';
            this.resultsList.style.display = 'none';
            return;
        } else {
            this.noResults.style.display = 'none';
            this.resultsList.style.display = 'block';
        }

        // Get all results and sort by timestamp (newest first)
        const allResults = this.getAllResults();
        const sortedResults = allResults.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Create and append all result elements
        const fragment = document.createDocumentFragment();
        
        sortedResults.forEach((result) => {
            const resultElement = this.createResultElement(result);
            fragment.appendChild(resultElement);
        });
        
        this.resultsList.appendChild(fragment);
    }

    // Create a result element with enhanced error handling and warning support
    createResultElement(result) {
        const div = document.createElement('div');
        
        // Determine the status and styling
        let statusClass, statusIcon, statusText;
        
        if (result.success) {
            if (result.hasWarnings) {
                statusClass = 'warning';
                statusIcon = '⚠️';
                statusText = 'Success with Warnings';
            } else {
                statusClass = 'success';
                statusIcon = '✅';
                statusText = 'Success';
            }
        } else if (result.skipped) {
            statusClass = 'skipped';
            statusIcon = '⏭️';
            statusText = 'Skipped';
        } else {
            statusClass = 'error';
            statusIcon = '❌';
            statusText = 'Failed';
        }
        
        div.className = `result-item ${statusClass}`;

        div.innerHTML = `
            <div class="result-header">
                <div class="result-title">
                    <span class="result-icon">${statusIcon}</span>
                    <span class="result-label">${result.fileName}</span>
                    <span class="result-timestamp">${this.formatTime(new Date(result.timestamp))}</span>
                </div>
                <div class="result-status">${statusText}</div>
            </div>
            <div class="result-details">
                ${result.success ? this.createSuccessDetails(result.data) : 
                  result.skipped ? this.createSkippedDetails(result.error) : 
                  this.createErrorDetails(result.error)}
            </div>
        `;

        return div;
    }

    // Enhanced createSuccessDetails to show warnings
    createSuccessDetails(data) {
        if (!data) {
            return '<p>Processing completed successfully</p>';
        }

        let warningSection = '';
        if (data.skippedItems > 0) {
            warningSection = `
                <div class="warning-section">
                    <p><strong>⚠️ Warnings:</strong></p>
                    <p><strong>Items Skipped:</strong> ${data.skippedItems} (missing SKUs)</p>
                    <p><strong>Missing SKUs:</strong> ${data.missingSkus.slice(0, 3).join(', ')}${data.missingSkus.length > 3 ? '...' : ''}</p>
                </div>
            `;
        }

        return `
            <div class="success-details">
                <p><strong>Order ID:</strong> ${data.orderId || 'N/A'}</p>
                <p><strong>Items Processed:</strong> ${data.itemCount || 0}${data.totalItems ? ` of ${data.totalItems}` : ''}</p>
                <p><strong>Processed Value:</strong> £${data.processedValue ? data.processedValue.toFixed(2) : (data.totalValue ? data.totalValue.toFixed(2) : '0.00')}</p>
                <p><strong>Customer ID:</strong> ${data.customerId || 'N/A'}</p>
                ${warningSection}
            </div>
        `;
    }

    // Create skipped details HTML
    createSkippedDetails(reason) {
        return `
            <div class="skipped-details">
                <p><strong>Reason:</strong> ${reason || 'File was skipped'}</p>
            </div>
        `;
    }

    // Enhanced error details with categorization and advice
    createErrorDetails(error) {
        let errorCategory = 'Unknown error';
        let errorAdvice = '';
        
        if (error) {
            const errorLower = error.toLowerCase();
            
            if (errorLower.includes('api') || errorLower.includes('authentication') || errorLower.includes('credentials')) {
                errorCategory = 'API Error';
                errorAdvice = 'Check API credentials and connection';
            } else if (errorLower.includes('customer') || errorLower.includes('not found')) {
                errorCategory = 'Customer Error';
                errorAdvice = 'Customer lookup or creation failed';
            } else if (errorLower.includes('parse') || errorLower.includes('format')) {
                errorCategory = 'File Format Error';
                errorAdvice = 'Check file format and structure';
            } else if (errorLower.includes('network') || errorLower.includes('timeout')) {
                errorCategory = 'Network Error';
                errorAdvice = 'Check internet connection';
            } else if (errorLower.includes('initialization') || errorLower.includes('initialize')) {
                errorCategory = 'Initialization Error';
                errorAdvice = 'Check API credentials configuration';
            } else if (errorLower.includes('url') || errorLower.includes('encoding')) {
                errorCategory = 'URL/Encoding Error';
                errorAdvice = 'Special characters in customer name may need encoding';
            } else if (errorLower.includes('no valid items') || errorLower.includes('missing from the system')) {
                errorCategory = 'Missing SKU Error';
                errorAdvice = 'All product SKUs are missing from your system inventory';
            } else {
                errorCategory = 'Processing Error';
            }
        }
        
        return `
            <div class="error-details">
                <p><strong>Category:</strong> ${errorCategory}</p>
                <p><strong>Error:</strong> ${error || 'Unknown error occurred'}</p>
                ${errorAdvice ? `<p class="error-advice"><strong>Suggestion:</strong> ${errorAdvice}</p>` : ''}
            </div>
        `;
    }

    // Format time for display
    formatTime(date) {
        return date.toLocaleTimeString('en-GB', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    // Clear all results
    clearAllResults() {
        if (this.getResultsCount() === 0) return;
        
        if (confirm('Are you sure you want to clear all processing results?')) {
            this.results = {};
            this.updateDisplay();
        }
    }

    // Enhanced statistics with skipped files and warnings
    getStatistics() {
        const allResults = this.getAllResults();
        const total = allResults.length;
        const successful = allResults.filter(r => r.success && !r.hasWarnings).length;
        const successWithWarnings = allResults.filter(r => r.success && r.hasWarnings).length;
        const failed = allResults.filter(r => !r.success && !r.skipped).length;
        const skipped = allResults.filter(r => r.skipped).length;
        
        return {
            total,
            successful,
            successWithWarnings,
            failed,
            skipped,
            successRate: total > 0 ? ((successful + successWithWarnings) / total * 100).toFixed(1) : 0,
            cleanSuccessRate: total > 0 ? (successful / total * 100).toFixed(1) : 0
        };
    }
}

// Initialize the processing results manager
const processingResults = new ProcessingResultsManager();

// Export for use in other modules
window.processingResults = processingResults;

// Make it available for the order processor
window.sidebarManager = {
    addResult: (result) => {
        if (result.type === 'order_processed') {
            processingResults.addResult(result.fileName, {
                success: true,
                orderData: result.orderData
            });
        }
    }
};