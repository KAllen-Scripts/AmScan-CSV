// Enhanced Credentials Handler for API and FTP credentials
// Credentials stored permanently until manually cleared - no expiration

class SecureCredentialsManager {
    constructor() {
        this.credentials = new Map();
        this.accessLog = new Map();
        this.isLocked = false;
        
        this.bindCleanupEvents();
    }

    store(key, value, options = {}) {
        if (this.isLocked) {
            throw new Error('Credentials manager is locked');
        }

        const secureValue = {
            data: value,
            created: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 0,
            sensitive: options.sensitive !== false
        };

        this.credentials.set(key, secureValue);
        this.accessLog.set(key, []);
    }

    get(key) {
        if (this.isLocked) {
            throw new Error('Credentials manager is locked');
        }

        const wrapper = this.credentials.get(key);
        if (!wrapper) {
            return null;
        }

        wrapper.lastAccessed = Date.now();
        wrapper.accessCount++;
        
        const log = this.accessLog.get(key) || [];
        log.push({ timestamp: Date.now(), action: 'access' });
        if (log.length > 10) {
            log.shift();
        }
        this.accessLog.set(key, log);

        return wrapper.data;
    }

    has(key) {
        return this.credentials.has(key);
    }

    remove(key) {
        const wrapper = this.credentials.get(key);
        if (!wrapper) return false;

        if (wrapper.sensitive && typeof wrapper.data === 'object') {
            this.overwriteObject(wrapper.data);
        } else if (wrapper.sensitive && typeof wrapper.data === 'string') {
            wrapper.data = this.generateOverwriteString(wrapper.data.length);
        }

        this.credentials.delete(key);
        this.accessLog.delete(key);
        
        return true;
    }

    getStatus(key) {
        const wrapper = this.credentials.get(key);
        if (!wrapper) {
            return { exists: false };
        }

        const now = Date.now();
        const age = now - wrapper.created;
        const timeSinceAccess = now - wrapper.lastAccessed;

        return {
            exists: true,
            age: age,
            lastAccessed: timeSinceAccess,
            accessCount: wrapper.accessCount,
            isExpired: false,
            isIdle: false,
            expiresIn: null
        };
    }

    lock(reason = 'Manual lock') {
        this.isLocked = true;
        this.clearAll(true);
    }

    unlock(reason = 'Manual unlock') {
        this.isLocked = false;
    }

    clearAll(force = false) {
        if (this.isLocked && !force) {
            throw new Error('Cannot clear credentials: manager is locked');
        }
        
        for (const [key, wrapper] of this.credentials) {
            if (wrapper.sensitive && typeof wrapper.data === 'object') {
                this.overwriteObject(wrapper.data);
            } else if (wrapper.sensitive && typeof wrapper.data === 'string') {
                wrapper.data = this.generateOverwriteString(wrapper.data.length);
            }
        }

        this.credentials.clear();
        this.accessLog.clear();
        
        if (global.gc) {
            global.gc();
        }
    }

    overwriteObject(obj) {
        if (!obj || typeof obj !== 'object') return;
        
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === 'string') {
                    obj[key] = this.generateOverwriteString(obj[key].length);
                } else if (typeof obj[key] === 'object') {
                    this.overwriteObject(obj[key]);
                } else {
                    obj[key] = null;
                }
            }
        }
    }

    generateOverwriteString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    bindCleanupEvents() {
        const cleanup = () => {
            this.clearAll(true);
        };

        if (typeof process !== 'undefined') {
            process.on('exit', cleanup);
            process.on('SIGINT', cleanup);
            process.on('SIGTERM', cleanup);
            process.on('uncaughtException', (err) => {
                cleanup();
            });
        }

        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', cleanup);
        }
    }

    getStatistics() {
        const stats = {
            totalCredentials: this.credentials.size,
            locked: this.isLocked,
            credentials: {}
        };

        for (const [key, wrapper] of this.credentials) {
            const now = Date.now();
            stats.credentials[key] = {
                age: now - wrapper.created,
                lastAccessed: now - wrapper.lastAccessed,
                accessCount: wrapper.accessCount,
                sensitive: wrapper.sensitive
            };
        }

        return stats;
    }

    destroy() {
        this.clearAll(true);
    }
}

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
        
        // Initialize secure credentials manager
        this.secureManager = new SecureCredentialsManager();
        this.failureCount = 0;
        
        // Create secure proxies for global credentials access
        window.appCredentials = new Proxy({}, {
            get: (target, prop) => {
                if (prop === 'isLoaded') {
                    return this.secureManager.has('apiCredentials');
                }
                
                const creds = this.secureManager.get('apiCredentials');
                return creds ? creds[prop] : null;
            },
            
            set: (target, prop, value) => {
                return false;
            }
        });
        
        window.ftpCredentials = new Proxy({}, {
            get: (target, prop) => {
                if (prop === 'isLoaded') {
                    return this.secureManager.has('ftpCredentials');
                }
                
                const creds = this.secureManager.get('ftpCredentials');
                return creds ? creds[prop] : null;
            },
            
            set: (target, prop, value) => {
                return false;
            }
        });
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadCredentialsOnStartup();
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
        if (this.secureManager.isLocked) {
            this.showNotification('Credentials are locked. Please restart the application.', 'error');
            return;
        }

        this.apiCredentialsModal.classList.add('show');
        
        setTimeout(() => {
            this.recreateApiInputs();
        }, 50);
        
        this.loadApiCredentialsToForm().catch(error => {
            console.error('Error loading API credentials to form:', error);
        });
    }

    async openFtpModal() {
        if (this.secureManager.isLocked) {
            this.showNotification('Credentials are locked. Please restart the application.', 'error');
            return;
        }

        this.ftpCredentialsModal.classList.add('show');
        
        setTimeout(() => {
            this.recreateFtpInputs();
        }, 50);
        
        this.loadFtpCredentialsToForm().catch(error => {
            console.error('Error loading FTP credentials to form:', error);
        });
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
        
        this.addInputHandlers('apiClientId');
        this.addInputHandlers('apiSecretKey');
        this.addInputHandlers('apiAccountKey');
        
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
        
        this.addInputHandlers('ftpHost');
        this.addInputHandlers('ftpPort');
        this.addInputHandlers('ftpUsername');
        this.addInputHandlers('ftpPassword');
        this.addInputHandlers('ftpDirectory');
        
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

    addInputHandlers(inputId) {
        const input = document.getElementById(inputId);
        
        input.addEventListener('keydown', (e) => {
            if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const currentValue = input.value;
                
                const newValue = currentValue.substring(0, start) + e.key + currentValue.substring(end);
                input.value = newValue;
                
                input.setSelectionRange(start + 1, start + 1);
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            else if (e.key === 'Backspace') {
                e.preventDefault();
                
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const currentValue = input.value;
                
                if (start === end && start > 0) {
                    const newValue = currentValue.substring(0, start - 1) + currentValue.substring(end);
                    input.value = newValue;
                    input.setSelectionRange(start - 1, start - 1);
                } else if (start !== end) {
                    const newValue = currentValue.substring(0, start) + currentValue.substring(end);
                    input.value = newValue;
                    input.setSelectionRange(start, start);
                }
                
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            else if (e.key === 'Delete') {
                e.preventDefault();
                
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const currentValue = input.value;
                
                if (start === end && start < currentValue.length) {
                    const newValue = currentValue.substring(0, start) + currentValue.substring(end + 1);
                    input.value = newValue;
                    input.setSelectionRange(start, start);
                } else if (start !== end) {
                    const newValue = currentValue.substring(0, start) + currentValue.substring(end);
                    input.value = newValue;
                    input.setSelectionRange(start, start);
                }
                
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
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
            const credentials = await this.getDecryptedCredentials('apiCredentials');
            
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
            const credentials = await this.getDecryptedCredentials('ftpCredentials');
            
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

        if (!this.validateApiCredentialFormat(clientId, secretKey, accountKey)) {
            return;
        }

        try {
            await this.saveEncryptedCredentials('apiCredentials', {
                clientId: clientId,
                secretKey: secretKey,
                accountKey: accountKey
            });
            
            this.secureManager.store('apiCredentials', {
                clientId: clientId,
                secretKey: secretKey,
                accountKey: accountKey
            }, {
                sensitive: true
            });
            
            this.updateApiCredentialsStatus(true);
            this.closeApiModalHandler();
            this.showNotification('API credentials saved permanently!', 'success');
            this.failureCount = 0;
            
        } catch (error) {
            console.error('Error saving API credentials:', error);
            this.showNotification('Error saving API credentials', 'error');
            this.failureCount++;
        }
    }

    async handleSaveFtpCredentials() {
        const host = document.getElementById('ftpHost').value.trim();
        const port = parseInt(document.getElementById('ftpPort').value) || 22;
        const username = document.getElementById('ftpUsername').value.trim();
        const password = document.getElementById('ftpPassword').value;
        const directory = document.getElementById('ftpDirectory').value.trim();
        const secure = document.getElementById('ftpSecure').checked;

        if (!this.validateFtpCredentialFormat(host, port, username, password)) {
            return;
        }

        try {
            // Use the EXACT same method as API credentials
            await this.saveEncryptedCredentials('ftpCredentials', {
                host: host,
                port: port,
                username: username,
                password: password,
                directory: directory,
                secure: secure
            });
            
            // Store in memory using the EXACT same method as API credentials  
            this.secureManager.store('ftpCredentials', {
                host: host,
                port: port,
                username: username,
                password: password,
                directory: directory,
                secure: secure
            }, {
                sensitive: true
            });
            
            this.updateFtpCredentialsStatus(true);
            this.closeFtpModalHandler();
            this.showNotification('FTP credentials saved permanently!', 'success');
            this.failureCount = 0;
            
        } catch (error) {
            console.error('Error saving FTP credentials:', error);
            this.showNotification('Error saving FTP credentials', 'error');
            this.failureCount++;
        }
    }

    validateApiCredentialFormat(clientId, secretKey, accountKey) {
        const errors = [];
        
        if (!clientId || clientId.length < 8) {
            errors.push('Client ID must be at least 8 characters');
        }
        
        if (!secretKey || secretKey.length < 16) {
            errors.push('Secret Key must be at least 16 characters');
        }
        
        if (!accountKey || accountKey.length < 8) {
            errors.push('Account Key must be at least 8 characters');
        }
        
        if (secretKey && (secretKey.toLowerCase().includes('password') || secretKey.includes('123456'))) {
            errors.push('Secret Key appears to be weak');
        }
        
        if (errors.length > 0) {
            this.showNotification(errors.join('; '), 'error');
            return false;
        }
        
        return true;
    }

    validateFtpCredentialFormat(host, port, username, password) {
        const errors = [];
        
        if (!host || host.length < 3) {
            errors.push('FTP Host must be at least 3 characters');
        }
        
        if (!port || port < 1 || port > 65535) {
            errors.push('Port must be between 1 and 65535');
        }
        
        if (!username || username.length < 1) {
            errors.push('Username is required');
        }
        
        if (!password || password.length < 1) {
            errors.push('Password is required');
        }
        
        if (errors.length > 0) {
            this.showNotification(errors.join('; '), 'error');
            return false;
        }
        
        return true;
    }

    async handleClearApiCredentials() {
        if (confirm('Are you sure you want to clear stored API credentials?')) {
            try {
                await this.clearStoredCredentials('apiCredentials');
                this.secureManager.remove('apiCredentials');
                
                document.getElementById('apiClientId').value = '';
                document.getElementById('apiSecretKey').value = '';
                document.getElementById('apiAccountKey').value = '';
                
                this.updateApiCredentialsStatus(false);
                this.closeApiModalHandler();
                this.showNotification('API credentials cleared successfully!', 'success');
                
            } catch (error) {
                console.error('Error clearing API credentials:', error);
                this.showNotification('Error clearing API credentials', 'error');
            }
        }
    }

    async handleClearFtpCredentials() {
        if (confirm('Are you sure you want to clear stored FTP credentials?')) {
            try {
                await this.clearStoredCredentials('ftpCredentials');
                this.secureManager.remove('ftpCredentials');
                
                document.getElementById('ftpHost').value = '';
                document.getElementById('ftpPort').value = '22';
                document.getElementById('ftpUsername').value = '';
                document.getElementById('ftpPassword').value = '';
                document.getElementById('ftpDirectory').value = '';
                document.getElementById('ftpSecure').checked = false;
                
                this.updateFtpCredentialsStatus(false);
                this.closeFtpModalHandler();
                this.showNotification('FTP credentials cleared successfully!', 'success');
                
            } catch (error) {
                console.error('Error clearing FTP credentials:', error);
                this.showNotification('Error clearing FTP credentials', 'error');
            }
        }
    }

    async saveEncryptedCredentials(type, credentials) {
        const credentialsWithTimestamp = {
            ...credentials,
            timestamp: new Date().toISOString()
        };

        if (window.electronAPI && window.electronAPI.saveCredentials) {
            await window.electronAPI.saveCredentials(`${type}`, credentialsWithTimestamp);
        } else {
            const encoded = btoa(JSON.stringify(credentialsWithTimestamp));
            localStorage.setItem(`morrisonsEDI_${type.charAt(0).toUpperCase() + type.slice(1)}`, encoded);
        }
    }

    async getDecryptedCredentials(type) {
        try {
            let credentials = null;
            
            if (window.electronAPI && window.electronAPI.loadCredentials) {
                credentials = await window.electronAPI.loadCredentials(`${type}`);
            } else {
                const stored = localStorage.getItem(`morrisonsEDI_${type.charAt(0).toUpperCase() + type.slice(1)}`);
                if (stored) {
                    credentials = JSON.parse(atob(stored));
                }
            }
            
            return credentials;
        } catch (error) {
            console.error(`Error getting decrypted ${type} credentials:`, error);
            return null;
        }
    }

    async clearStoredCredentials(type) {
        if (window.electronAPI && window.electronAPI.clearCredentials) {
            await window.electronAPI.clearCredentials(`${type}`);
        } else {
            localStorage.removeItem(`morrisonsEDI_${type.charAt(0).toUpperCase() + type.slice(1)}`);
        }
    }

    async loadCredentialsOnStartup() {
        try {
            // Load API credentials
            console.log('Loading API credentials...');
            const apiCredentials = await this.getDecryptedCredentials('apiCredentials');
            console.log('API credentials loaded:', apiCredentials ? 'Yes' : 'No');
            
            if (apiCredentials && apiCredentials.clientId && apiCredentials.secretKey && apiCredentials.accountKey) {
                this.secureManager.store('apiCredentials', {
                    clientId: apiCredentials.clientId,
                    secretKey: apiCredentials.secretKey,
                    accountKey: apiCredentials.accountKey
                }, {
                    sensitive: true
                });
                this.updateApiCredentialsStatus(true);
            } else {
                this.updateApiCredentialsStatus(false);
            }

            // Load FTP credentials  
            console.log('Loading FTP credentials...');
            const ftpCredentials = await this.getDecryptedCredentials('ftpCredentials');
            console.log('FTP credentials loaded:', ftpCredentials ? 'Yes' : 'No');
            console.log('FTP credentials data:', ftpCredentials);
            
            if (ftpCredentials && ftpCredentials.host && ftpCredentials.username && ftpCredentials.password) {
                this.secureManager.store('ftpCredentials', {
                    host: ftpCredentials.host,
                    port: ftpCredentials.port || 22,
                    username: ftpCredentials.username,
                    password: ftpCredentials.password,
                    directory: ftpCredentials.directory || '',
                    secure: ftpCredentials.secure || false
                }, {
                    sensitive: true
                });
                this.updateFtpCredentialsStatus(true);
            } else {
                this.updateFtpCredentialsStatus(false);
            }

        } catch (error) {
            console.error('Error loading credentials on startup:', error);
            this.updateApiCredentialsStatus(false);
            this.updateFtpCredentialsStatus(false);
            this.failureCount++;
            
            if (this.failureCount > 3) {
                this.secureManager.lock('Repeated credential loading failures');
            }
        }
    }

    updateApiCredentialsStatus(hasCredentials) {
        if (hasCredentials && this.secureManager.has('apiCredentials')) {
            this.apiStatusIndicator.className = 'status-indicator stored';
            this.apiStatusText.textContent = 'API credentials stored permanently';
            this.apiCredentialsBtn.innerHTML = '<span class="btn-icon">🔐</span>Update API Credentials';
        } else {
            this.apiStatusIndicator.className = 'status-indicator empty';
            this.apiStatusText.textContent = 'No API credentials stored';
            this.apiCredentialsBtn.innerHTML = '<span class="btn-icon">🔐</span>Manage API Credentials';
        }
    }

    updateFtpCredentialsStatus(hasCredentials) {
        if (hasCredentials && this.secureManager.has('ftpCredentials')) {
            this.ftpStatusIndicator.className = 'status-indicator stored';
            this.ftpStatusText.textContent = 'FTP credentials stored permanently';
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

    // Enhanced utility methods for external access
    getCredentialStatus(type) {
        return this.secureManager.getStatus(type);
    }

    getSecurityStats() {
        return this.secureManager.getStatistics();
    }

    // Static utility methods for backward compatibility
    static getStoredApiCredentials() {
        return window.appCredentials;
    }

    static getStoredFtpCredentials() {
        return window.ftpCredentials;
    }

    static hasApiCredentials() {
        return window.appCredentials && window.appCredentials.isLoaded && 
               window.appCredentials.clientId && window.appCredentials.secretKey && 
               window.appCredentials.accountKey;
    }

    static hasFtpCredentials() {
        return window.ftpCredentials && window.ftpCredentials.isLoaded && 
               window.ftpCredentials.host && window.ftpCredentials.username && 
               window.ftpCredentials.password;
    }
}

// Initialize the credentials handler
const credentialsHandler = new CredentialsHandler();

// Export for use in other modules
window.credentialsHandler = credentialsHandler;