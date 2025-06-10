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

    // Create a result element
    createResultElement(result) {
        const div = document.createElement('div');
        div.className = `result-item ${result.success ? 'success' : 'error'}`;

        const statusIcon = result.success ? '✅' : '❌';
        const statusText = result.success ? 'Success' : 'Failed';

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
                ${result.success ? this.createSuccessDetails(result.data) : this.createErrorDetails(result.error)}
            </div>
        `;

        return div;
    }

    // Create success details HTML
    createSuccessDetails(data) {
        if (!data) {
            return '<p>Processing completed successfully</p>';
        }

        return `
            <div class="success-details">
                <p><strong>Order ID:</strong> ${data.orderId || 'N/A'}</p>
                <p><strong>Items:</strong> ${data.itemCount || 0}</p>
                <p><strong>Total Value:</strong> £${data.totalValue ? data.totalValue.toFixed(2) : '0.00'}</p>
                <p><strong>Customer ID:</strong> ${data.customerId || 'N/A'}</p>
            </div>
        `;
    }

    // Create error details HTML
    createErrorDetails(error) {
        return `
            <div class="error-details">
                <p><strong>Error:</strong> ${error || 'Unknown error occurred'}</p>
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

    // Get current statistics
    getStatistics() {
        const allResults = this.getAllResults();
        const total = allResults.length;
        const successful = allResults.filter(r => r.success).length;
        const failed = allResults.filter(r => !r.success).length;
        
        return {
            total,
            successful,
            failed,
            successRate: total > 0 ? (successful / total * 100).toFixed(1) : 0
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