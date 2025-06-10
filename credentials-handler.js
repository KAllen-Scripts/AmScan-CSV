// Simple Credentials Handler - NO LEGACY BULLSHIT
// Just save and load credentials with hardcoded names

class CredentialsHandler {
    constructor() {
        // API Credentials elements
        this.apiCredentialsBtn = document.getElementById('apiCredentialsBtn');
        this.apiCredentialsModal = document.getElementById('apiCredentialsModal');
        this.closeApiModal = document.getElementById('closeApiModal');
        this.apiCredentialsForm = document.getElementById('apiCredentialsForm');
        this.saveApiCredentials = document.getElementById('saveApiCredentials');
        this.clearApiCredentials = document.getElementById('clearApiCredentials');
        this.showApiPassword = document.getElementById('showApiPassword');
        this.apiStatusIndicator = document.getElementById('apiStatusIndicator');
        this.apiStatusText = document.getElementById('apiStatusText');
        
        // FTP Credentials elements
        this.ftpCredentialsBtn = document.getElementById('ftpCredentialsBtn');
        this.ftpCredentialsModal = document.getElementById('ftpCredentialsModal');
        this.closeFtpModal = document.getElementById('closeFtpModal');
        this.ftpCredentialsForm = document.getElementById('ftpCredentialsForm');
        this.saveFtpCredentials = document.getElementById('saveFtpCredentials');
        this.clearFtpCredentials = document.getElementById('clearFtpCredentials');
        this.showFtpPassword = document.getElementById('showFtpPassword');
        this.ftpStatusIndicator = document.getElementById('ftpStatusIndicator');
        this.ftpStatusText = document.getElementById('ftpStatusText');
        
        // INITIALIZE GLOBAL CREDENTIALS OBJECT
        this.initializeGlobalCredentials();
        
        this.init();
    }

    /**
     * Initialize global credentials object that other modules can access
     */
    initializeGlobalCredentials() {
        window.appCredentials = {
            isLoaded: false,
            accountKey: null,
            clientId: null,
            secretKey: null
        };
        console.log('🔧 INIT: Global credentials object initialized');
    }

    /**
     * Update global credentials object whenever credentials change
     */
    updateGlobalCredentials(credentials) {
        if (credentials && credentials.accountKey && credentials.clientId && credentials.secretKey) {
            window.appCredentials = {
                isLoaded: true,
                accountKey: credentials.accountKey,
                clientId: credentials.clientId,
                secretKey: credentials.secretKey
            };
            console.log('✅ GLOBAL: API credentials loaded into global object');
        } else {
            window.appCredentials = {
                isLoaded: false,
                accountKey: null,
                clientId: null,
                secretKey: null
            };
            console.log('🗑️ GLOBAL: API credentials cleared from global object');
        }
    }

    init() {
        this.setupEventListeners();
        this.loadCredentialsOnStartup();
    }

    /**
     * SIMPLE: Save API credentials
     */
    async saveApiCredentialsToStorage(credentials) {
        try {
            const credentialsWithTimestamp = {
                ...credentials,
                timestamp: new Date().toISOString()
            };

            if (window.electronAPI && window.electronAPI.saveCredentials) {
                await window.electronAPI.saveCredentials('apiCredentials', credentialsWithTimestamp);
            } else {
                const encoded = btoa(JSON.stringify(credentialsWithTimestamp));
                localStorage.setItem('ftpSyncApp_apiCredentials', encoded);
            }
            
            console.log('✅ API credentials saved');
            
            // UPDATE GLOBAL CREDENTIALS IMMEDIATELY
            this.updateGlobalCredentials(credentials);
            
            return { success: true };
        } catch (error) {
            console.error('❌ Error saving API credentials:', error);
            throw error;
        }
    }

    /**
     * SIMPLE: Load API credentials
     */
    async loadApiCredentials() {
        try {
            let credentials = null;
            
            if (window.electronAPI && window.electronAPI.loadCredentials) {
                credentials = await window.electronAPI.loadCredentials('apiCredentials');
            } else {
                const stored = localStorage.getItem('ftpSyncApp_apiCredentials');
                if (stored) {
                    credentials = JSON.parse(atob(stored));
                }
            }
            
            if (credentials) {
                console.log('✅ API credentials loaded');
                // UPDATE GLOBAL CREDENTIALS IMMEDIATELY
                this.updateGlobalCredentials(credentials);
            } else {
                console.log('❌ No API credentials found');
                this.updateGlobalCredentials(null);
            }
            
            return credentials;
        } catch (error) {
            console.error('❌ Error loading API credentials:', error);
            this.updateGlobalCredentials(null);
            return null;
        }
    }

    /**
     * SIMPLE: Clear API credentials
     */
    async clearApiCredentialsFromStorage() {
        try {
            if (window.electronAPI && window.electronAPI.clearCredentials) {
                await window.electronAPI.clearCredentials('apiCredentials');
            } else {
                localStorage.removeItem('ftpSyncApp_apiCredentials');
            }
            
            console.log('🗑️ API credentials cleared');
            
            // CLEAR GLOBAL CREDENTIALS IMMEDIATELY
            this.updateGlobalCredentials(null);
            
            return { success: true };
        } catch (error) {
            console.error('❌ Error clearing API credentials:', error);
            throw error;
        }
    }

    /**
     * SIMPLE: Save FTP credentials
     */
    async saveFtpCredentialsToStorage(credentials) {
        try {
            const credentialsWithTimestamp = {
                ...credentials,
                timestamp: new Date().toISOString()
            };

            if (window.electronAPI && window.electronAPI.saveCredentials) {
                await window.electronAPI.saveCredentials('ftpCredentials', credentialsWithTimestamp);
            } else {
                const encoded = btoa(JSON.stringify(credentialsWithTimestamp));
                localStorage.setItem('ftpSyncApp_ftpCredentials', encoded);
            }
            
            console.log('✅ FTP credentials saved');
            return { success: true };
        } catch (error) {
            console.error('❌ Error saving FTP credentials:', error);
            throw error;
        }
    }

    /**
     * SIMPLE: Load FTP credentials
     */
    async loadFtpCredentials() {
        try {
            let credentials = null;
            
            if (window.electronAPI && window.electronAPI.loadCredentials) {
                credentials = await window.electronAPI.loadCredentials('ftpCredentials');
            } else {
                const stored = localStorage.getItem('ftpSyncApp_ftpCredentials');
                if (stored) {
                    credentials = JSON.parse(atob(stored));
                }
            }
            
            if (credentials) {
                console.log('✅ FTP credentials loaded');
            }
            
            return credentials;
        } catch (error) {
            console.error('❌ Error loading FTP credentials:', error);
            return null;
        }
    }

    /**
     * SIMPLE: Clear FTP credentials
     */
    async clearFtpCredentialsFromStorage() {
        try {
            if (window.electronAPI && window.electronAPI.clearCredentials) {
                await window.electronAPI.clearCredentials('ftpCredentials');
            } else {
                localStorage.removeItem('ftpSyncApp_ftpCredentials');
            }
            
            console.log('🗑️ FTP credentials cleared');
            return { success: true };
        } catch (error) {
            console.error('❌ Error clearing FTP credentials:', error);
            throw error;
        }
    }

    setupEventListeners() {
        // API Credentials Modal
        this.apiCredentialsBtn.addEventListener('click', () => this.openApiModal());
        this.closeApiModal.addEventListener('click', () => this.closeApiModalHandler());
        this.apiCredentialsModal.addEventListener('click', (e) => {
            if (e.target === this.apiCredentialsModal) {
                this.closeApiModalHandler();
            }
        });
        
        // FTP Credentials Modal
        this.ftpCredentialsBtn.addEventListener('click', () => this.openFtpModal());
        this.closeFtpModal.addEventListener('click', () => this.closeFtpModalHandler());
        this.ftpCredentialsModal.addEventListener('click', (e) => {
            if (e.target === this.ftpCredentialsModal) {
                this.closeFtpModalHandler();
            }
        });
        
        // Handle Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.apiCredentialsModal.classList.contains('show')) {
                    this.closeApiModalHandler();
                }
                if (this.ftpCredentialsModal.classList.contains('show')) {
                    this.closeFtpModalHandler();
                }
            }
        });
        
        // API Credentials form handlers
        this.saveApiCredentials.addEventListener('click', () => this.handleSaveApiCredentials());
        this.clearApiCredentials.addEventListener('click', () => this.handleClearApiCredentials());
        this.showApiPassword.addEventListener('change', (e) => {
            const passwordInput = document.getElementById('apiSecretKey');
            passwordInput.type = e.target.checked ? 'text' : 'password';
        });
        this.apiCredentialsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSaveApiCredentials();
        });
        
        // FTP Credentials form handlers
        this.saveFtpCredentials.addEventListener('click', () => this.handleSaveFtpCredentials());
        this.clearFtpCredentials.addEventListener('click', () => this.handleClearFtpCredentials());
        this.showFtpPassword.addEventListener('change', (e) => {
            const passwordInput = document.getElementById('ftpPassword');
            passwordInput.type = e.target.checked ? 'text' : 'password';
        });
        this.ftpCredentialsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSaveFtpCredentials();
        });
    }

    async openApiModal() {
        this.apiCredentialsModal.classList.add('show');
        
        setTimeout(() => {
            this.recreateApiInputs();
        }, 50);
        
        await this.loadApiCredentialsToForm();
    }

    async openFtpModal() {
        this.ftpCredentialsModal.classList.add('show');
        
        setTimeout(() => {
            this.recreateFtpInputs();
        }, 50);
        
        await this.loadFtpCredentialsToForm();
    }

    recreateApiInputs() {
        const clientIdValue = document.getElementById('apiClientId').value;
        const secretKeyValue = document.getElementById('apiSecretKey').value;
        const accountKeyValue = document.getElementById('apiAccountKey').value;
        const showPasswordChecked = document.getElementById('showApiPassword').checked;
        
        this.recreateInput('apiClientId', clientIdValue);
        this.recreateInput('apiSecretKey', secretKeyValue, showPasswordChecked ? 'text' : 'password');
        this.recreateInput('apiAccountKey', accountKeyValue);
        
        const showPasswordCheckbox = document.getElementById('showApiPassword');
        showPasswordCheckbox.addEventListener('change', (e) => {
            const passwordInput = document.getElementById('apiSecretKey');
            passwordInput.type = e.target.checked ? 'text' : 'password';
        });
        
        setTimeout(() => {
            document.getElementById('apiClientId').focus();
        }, 10);
    }

    recreateFtpInputs() {
        const hostValue = document.getElementById('ftpHost').value;
        const portValue = document.getElementById('ftpPort').value;
        const usernameValue = document.getElementById('ftpUsername').value;
        const passwordValue = document.getElementById('ftpPassword').value;
        const directoryValue = document.getElementById('ftpDirectory').value;
        const secureChecked = document.getElementById('ftpSecure').checked;
        const showPasswordChecked = document.getElementById('showFtpPassword').checked;
        
        this.recreateInput('ftpHost', hostValue);
        this.recreateInput('ftpPort', portValue);
        this.recreateInput('ftpUsername', usernameValue);
        this.recreateInput('ftpPassword', passwordValue, showPasswordChecked ? 'text' : 'password');
        this.recreateInput('ftpDirectory', directoryValue);
        
        document.getElementById('ftpSecure').checked = secureChecked;
        
        const showPasswordCheckbox = document.getElementById('showFtpPassword');
        showPasswordCheckbox.addEventListener('change', (e) => {
            const passwordInput = document.getElementById('ftpPassword');
            passwordInput.type = e.target.checked ? 'text' : 'password';
        });
        
        setTimeout(() => {
            document.getElementById('ftpHost').focus();
        }, 10);
    }

    recreateInput(inputId, value, type = null) {
        const oldInput = document.getElementById(inputId);
        const newInput = oldInput.cloneNode(true);
        newInput.value = value;
        if (type) newInput.type = type;
        oldInput.parentNode.replaceChild(newInput, oldInput);
    }

    closeApiModalHandler() {
        this.apiCredentialsModal.classList.remove('show');
        this.apiCredentialsForm.reset();
        document.getElementById('apiSecretKey').type = 'password';
        document.getElementById('showApiPassword').checked = false;
    }

    closeFtpModalHandler() {
        this.ftpCredentialsModal.classList.remove('show');
        this.ftpCredentialsForm.reset();
        document.getElementById('ftpPassword').type = 'password';
        document.getElementById('showFtpPassword').checked = false;
    }

    async loadApiCredentialsToForm() {
        try {
            const credentials = await this.loadApiCredentials();
            
            if (credentials) {
                document.getElementById('apiClientId').value = credentials.clientId || '';
                document.getElementById('apiSecretKey').value = credentials.secretKey || '';
                document.getElementById('apiAccountKey').value = credentials.accountKey || '';
            }
        } catch (error) {
            console.error('Error loading API credentials to form:', error);
        }
    }

    async loadFtpCredentialsToForm() {
        try {
            const credentials = await this.loadFtpCredentials();
            
            if (credentials) {
                document.getElementById('ftpHost').value = credentials.host || '';
                document.getElementById('ftpPort').value = credentials.port || '22';
                document.getElementById('ftpUsername').value = credentials.username || '';
                document.getElementById('ftpPassword').value = credentials.password || '';
                document.getElementById('ftpDirectory').value = credentials.directory || '';
                document.getElementById('ftpSecure').checked = credentials.secure || false;
            }
        } catch (error) {
            console.error('Error loading FTP credentials to form:', error);
        }
    }

    async handleSaveApiCredentials() {
        const clientId = document.getElementById('apiClientId').value.trim();
        const secretKey = document.getElementById('apiSecretKey').value;
        const accountKey = document.getElementById('apiAccountKey').value.trim();

        try {
            const credentials = {
                clientId: clientId,
                secretKey: secretKey,
                accountKey: accountKey
            };
            
            await this.saveApiCredentialsToStorage(credentials);
            
            this.updateApiCredentialsStatus(true);
            this.closeApiModalHandler();
            this.showNotification('API credentials saved!', 'success');
            
            // ENSURE GLOBAL CREDENTIALS ARE SET BEFORE INITIALIZING API
            console.log('🔧 SAVE: Ensuring global credentials are set...');
            console.log('🔧 SAVE: window.appCredentials:', window.appCredentials);
            
            await this.initializeStoklyAPI();
            
        } catch (error) {
            console.error('Error saving API credentials:', error);
            this.showNotification('Error saving API credentials', 'error');
        }
    }

    async handleSaveFtpCredentials() {
        const host = document.getElementById('ftpHost').value.trim();
        const port = document.getElementById('ftpPort').value.trim();
        const username = document.getElementById('ftpUsername').value.trim();
        const password = document.getElementById('ftpPassword').value;
        const directory = document.getElementById('ftpDirectory').value.trim();
        const secure = document.getElementById('ftpSecure').checked;

        try {
            await this.saveFtpCredentialsToStorage({
                host: host,
                port: port,
                username: username,
                password: password,
                directory: directory,
                secure: secure
            });
            
            this.updateFtpCredentialsStatus(true);
            this.closeFtpModalHandler();
            this.showNotification('FTP credentials saved!', 'success');
            
        } catch (error) {
            console.error('Error saving FTP credentials:', error);
            this.showNotification('Error saving FTP credentials', 'error');
        }
    }

    async handleClearApiCredentials() {
        if (confirm('Are you sure you want to clear stored API credentials?')) {
            try {
                await this.clearApiCredentialsFromStorage();
                
                document.getElementById('apiClientId').value = '';
                document.getElementById('apiSecretKey').value = '';
                document.getElementById('apiAccountKey').value = '';
                
                this.updateApiCredentialsStatus(false);
                this.closeApiModalHandler();
                this.showNotification('API credentials cleared!', 'success');
                
            } catch (error) {
                console.error('Error clearing API credentials:', error);
                this.showNotification('Error clearing API credentials', 'error');
            }
        }
    }

    async handleClearFtpCredentials() {
        if (confirm('Are you sure you want to clear stored FTP credentials?')) {
            try {
                await this.clearFtpCredentialsFromStorage();
                
                document.getElementById('ftpHost').value = '';
                document.getElementById('ftpPort').value = '22';
                document.getElementById('ftpUsername').value = '';
                document.getElementById('ftpPassword').value = '';
                document.getElementById('ftpDirectory').value = '';
                document.getElementById('ftpSecure').checked = false;
                
                this.updateFtpCredentialsStatus(false);
                this.closeFtpModalHandler();
                this.showNotification('FTP credentials cleared!', 'success');
                
            } catch (error) {
                console.error('Error clearing FTP credentials:', error);
                this.showNotification('Error clearing FTP credentials', 'error');
            }
        }
    }

    async loadCredentialsOnStartup() {
        try {
            console.log('🔧 STARTUP: Loading credentials on startup...');
            
            // Check API credentials
            const apiCredentials = await this.loadApiCredentials();
            this.updateApiCredentialsStatus(!!apiCredentials);
            
            if (apiCredentials && apiCredentials.clientId && apiCredentials.secretKey && apiCredentials.accountKey) {
                console.log('🔧 STARTUP: Valid API credentials found, initializing API...');
                await this.initializeStoklyAPI();
            } else {
                console.log('🔧 STARTUP: No valid API credentials found');
            }

            // Check FTP credentials  
            const ftpCredentials = await this.loadFtpCredentials();
            this.updateFtpCredentialsStatus(!!ftpCredentials);

        } catch (error) {
            console.error('Error loading credentials on startup:', error);
            this.updateApiCredentialsStatus(false);
            this.updateFtpCredentialsStatus(false);
        }
    }

    async initializeStoklyAPI() {
        try {
            if (!window.stoklyAPI || !window.stoklyAPI.initializeStoklyAPI) {
                console.log('❌ Stokly API not available');
                return;
            }

            // CHECK GLOBAL CREDENTIALS FIRST
            if (!window.appCredentials || !window.appCredentials.isLoaded) {
                console.log('❌ INIT: Global credentials not loaded, loading from storage...');
                const credentials = await this.loadApiCredentials();
                if (!credentials) {
                    console.log('❌ INIT: No API credentials available');
                    return;
                }
            }

            console.log('🔧 INIT: Initializing Stokly API with global credentials...');
            console.log('🔧 INIT: Has accountKey:', !!window.appCredentials.accountKey);
            console.log('🔧 INIT: Has clientId:', !!window.appCredentials.clientId);
            console.log('🔧 INIT: Has secretKey:', !!window.appCredentials.secretKey);
            
            const success = await window.stoklyAPI.initializeStoklyAPI({
                accountKey: window.appCredentials.accountKey,
                clientId: window.appCredentials.clientId,
                secretKey: window.appCredentials.secretKey,
                environment: 'api.stok.ly'
            });

            if (success) {
                console.log('✅ INIT: Stokly API initialized successfully');
                this.showNotification('API initialized successfully', 'success');
            } else {
                console.error('❌ INIT: Failed to initialize Stokly API');
                this.showNotification('Failed to initialize API', 'error');
            }
        } catch (error) {
            console.error('❌ INIT: Error initializing Stokly API:', error);
            this.showNotification(`API initialization error: ${error.message}`, 'error');
        }
    }

    updateApiCredentialsStatus(hasCredentials) {
        if (hasCredentials) {
            this.apiStatusIndicator.className = 'status-indicator stored';
            this.apiStatusText.textContent = 'API credentials stored';
            this.apiCredentialsBtn.innerHTML = '<span class="btn-icon">🔐</span>Update API Credentials';
        } else {
            this.apiStatusIndicator.className = 'status-indicator empty';
            this.apiStatusText.textContent = 'No API credentials stored';
            this.apiCredentialsBtn.innerHTML = '<span class="btn-icon">🔐</span>Manage API Credentials';
        }
    }

    updateFtpCredentialsStatus(hasCredentials) {
        if (hasCredentials) {
            this.ftpStatusIndicator.className = 'status-indicator stored';
            this.ftpStatusText.textContent = 'FTP credentials stored';
            this.ftpCredentialsBtn.innerHTML = '<span class="btn-icon">📁</span>Update FTP Credentials';
        } else {
            this.ftpStatusIndicator.className = 'status-indicator empty';
            this.ftpStatusText.textContent = 'No FTP credentials stored';
            this.ftpCredentialsBtn.innerHTML = '<span class="btn-icon">📁</span>Manage FTP Credentials';
        }
    }

    showNotification(message, type = 'info') {
        const resultElement = document.getElementById('result');
        const resultContentElement = document.getElementById('resultContent');
        
        if (resultContentElement) {
            resultContentElement.innerHTML = `<p class="${type}">${message}</p>`;
        }
        
        if (resultElement) {
            resultElement.style.display = 'block';
            
            if (type === 'success') {
                setTimeout(() => {
                    resultElement.style.display = 'none';
                }, 3000);
            }
        }
    }
}

// Initialize the credentials handler
const credentialsHandler = new CredentialsHandler();

// Export for use in other modules
window.credentialsHandler = credentialsHandler;