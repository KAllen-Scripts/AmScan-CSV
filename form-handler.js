// Form Handler for Electron App
// Uses Electron's contextBridge API to access electron-store

class FormHandler {
    constructor() {
        this.formId = 'configForm';
        this.resultId = 'result';
        this.resultContentId = 'resultContent';
        
        this.init();
    }

    init() {
        // Wait for DOM to be fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
        } else {
            this.setupEventListeners();
        }
    }

    setupEventListeners() {
        const form = document.getElementById(this.formId);
        const syncIntervalSelect = document.getElementById('syncInterval');
        
        if (form) {
            // Save immediately when sync interval changes
            if (syncIntervalSelect) {
                syncIntervalSelect.addEventListener('change', (e) => this.handleSave(e));
            }
            
            // Handle form submission (though we don't have a submit button anymore)
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSave(e);
            });
        }
        
        // Load saved data when page loads
        this.loadSavedData();
    }

    /**
     * Dynamically collect all form data regardless of field types
     * This method automatically adapts to new fields without code changes
     */
    collectFormData() {
        const form = document.getElementById(this.formId);
        if (!form) {
            throw new Error('Form not found');
        }

        const formData = {};
        const formElements = form.elements;

        // Iterate through all form elements
        for (let i = 0; i < formElements.length; i++) {
            const element = formElements[i];
            
            // Skip elements without names or buttons
            if (!element.name || element.type === 'button' || element.type === 'submit') {
                continue;
            }

            // Handle different input types
            switch (element.type) {
                case 'checkbox':
                    formData[element.name] = element.checked;
                    break;
                case 'radio':
                    if (element.checked) {
                        formData[element.name] = element.value;
                    }
                    break;
                case 'select-multiple':
                    formData[element.name] = Array.from(element.selectedOptions).map(option => option.value);
                    break;
                case 'file':
                    // For file inputs, store the file path or name
                    formData[element.name] = element.files.length > 0 ? element.files[0].name : '';
                    break;
                default:
                    // Handle text, email, password, number, date, select-one, textarea, etc.
                    formData[element.name] = element.value;
            }
        }

        return formData;
    }

    /**
     * Save form data using Electron's IPC
     */
    async handleSave(event) {
        event.preventDefault();
        
        try {
            const formData = this.collectFormData();
            
            // Validate required fields
            const validationResult = this.validateFormData(formData);
            if (!validationResult.isValid) {
                this.showResult(`Validation Error: ${validationResult.message}`, 'error');
                return;
            }

            // Save using Electron's exposed API
            if (window.electronAPI && window.electronAPI.saveConfig) {
                await window.electronAPI.saveConfig(formData);
                this.showResult('Configuration saved successfully!', 'success');
            } else {
                // Fallback to localStorage if Electron API not available (for testing)
                localStorage.setItem('morrisonsEDI_syncToolConfig', JSON.stringify(formData));
                localStorage.setItem('morrisonsEDI_syncToolConfigTimestamp', new Date().toISOString());
                this.showResult('Configuration saved to local storage!', 'success');
            }
            
        } catch (error) {
            console.error('Error saving form data:', error);
            this.showResult(`Error saving configuration: ${error.message}`, 'error');
        }
    }

    /**
     * Load saved data and populate form fields
     */
    async loadSavedData() {
        try {
            let savedData = null;
            
            // Try to load from Electron store first
            if (window.electronAPI && window.electronAPI.loadConfig) {
                savedData = await window.electronAPI.loadConfig();
            } else {
                // Fallback to localStorage
                const stored = localStorage.getItem('morrisonsEDI_syncToolConfig');
                if (stored) {
                    savedData = JSON.parse(stored);
                }
            }

            if (!savedData) {
                return;
            }

            // Populate form fields with saved data
            Object.keys(savedData).forEach(fieldName => {
                const element = document.querySelector(`[name="${fieldName}"]`);
                if (!element) return;

                const value = savedData[fieldName];

                switch (element.type) {
                    case 'checkbox':
                        element.checked = Boolean(value);
                        break;
                    case 'radio':
                        if (element.value === value) {
                            element.checked = true;
                        }
                        break;
                    case 'select-multiple':
                        if (Array.isArray(value)) {
                            Array.from(element.options).forEach(option => {
                                option.selected = value.includes(option.value);
                            });
                        }
                        break;
                    default:
                        element.value = value || '';
                }
            });

        } catch (error) {
            console.error('Error loading saved data:', error);
        }
    }

    /**
     * Basic validation for required fields
     * This dynamically checks all required fields
     */
    validateFormData(formData) {
        const form = document.getElementById(this.formId);
        const requiredFields = form.querySelectorAll('[required]');
        
        for (let field of requiredFields) {
            const fieldName = field.name;
            const value = formData[fieldName];
            
            if (!value || (typeof value === 'string' && value.trim() === '')) {
                const label = field.previousElementSibling;
                const fieldLabel = label && label.tagName === 'LABEL' 
                    ? label.textContent 
                    : fieldName;
                
                return {
                    isValid: false,
                    message: `${fieldLabel} is required`
                };
            }
        }
        
        return { isValid: true };
    }

    /**
     * Display result messages
     */
    showResult(message, type = 'info') {
        const resultElement = document.getElementById(this.resultId);
        const resultContentElement = document.getElementById(this.resultContentId);
        
        if (resultContentElement) {
            resultContentElement.innerHTML = `<p class="${type}">${message}</p>`;
        }
        
        if (resultElement) {
            resultElement.style.display = 'block';
            
            // Auto-hide success messages after 3 seconds
            if (type === 'success') {
                setTimeout(() => {
                    resultElement.style.display = 'none';
                }, 3000);
            }
        }
    }

    /**
     * Get saved configuration data
     */
    async getSavedConfig() {
        if (window.electronAPI && window.electronAPI.loadConfig) {
            return await window.electronAPI.loadConfig();
        } else {
            const stored = localStorage.getItem('morrisonsEDI_syncToolConfig');
            return stored ? JSON.parse(stored) : {};
        }
    }

    /**
     * Clear saved configuration
     */
    async clearSavedConfig() {
        if (window.electronAPI && window.electronAPI.clearConfig) {
            await window.electronAPI.clearConfig();
        } else {
            localStorage.removeItem('morrisonsEDI_syncToolConfig');
            localStorage.removeItem('morrisonsEDI_syncToolConfigTimestamp');
        }
        
        // Clear form fields
        const form = document.getElementById(this.formId);
        if (form) {
            form.reset();
        }
    }

    /**
     * Export configuration to file
     */
    async exportConfig() {
        const config = await this.getSavedConfig();
        const dataStr = JSON.stringify(config, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = 'sync-tool-config.json';
        link.click();
    }

    /**
     * Import configuration from file
     */
    importConfig(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const config = JSON.parse(e.target.result);
                    
                    if (window.electronAPI && window.electronAPI.saveConfig) {
                        await window.electronAPI.saveConfig(config);
                    } else {
                        localStorage.setItem('morrisonsEDI_syncToolConfig', JSON.stringify(config));
                        localStorage.setItem('morrisonsEDI_syncToolConfigTimestamp', new Date().toISOString());
                    }
                    
                    await this.loadSavedData();
                    resolve(config);
                } catch (error) {
                    reject(new Error('Invalid configuration file'));
                }
            };
            reader.onerror = () => reject(new Error('Error reading file'));
            reader.readAsText(file);
        });
    }
}

// Initialize the form handler when the script loads
const formHandler = new FormHandler();

// Add utility functions to window for easy access
window.formHandler = formHandler;