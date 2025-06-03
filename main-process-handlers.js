const { ipcMain, dialog, app, BrowserWindow } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const EncryptionUtils = require('./encryption-utils');
const SFTPManager = require('./sftp-manager');

let Store;
let store;
let encryptionUtils;
let sftpManager;

// Initialize the store with dynamic import
async function initializeStore() {
    if (!Store) {
        const storeModule = await import('electron-store');
        Store = storeModule.default;
        
        store = new Store({
            name: 'morrisons-edi-sync-tool-config',
            // Note: We're handling encryption manually now for better control
        });
        
        // Initialize encryption utilities
        encryptionUtils = new EncryptionUtils();
        
        // Initialize SFTP manager
        sftpManager = new SFTPManager();
    }
    return store;
}

// Set up IPC handlers for the renderer process
async function setupIPCHandlers() {
    // Ensure store is initialized
    await initializeStore();
    
    // Save configuration
    ipcMain.handle('save-config', async (event, config) => {
        try {
            if (!store) await initializeStore();
            
            store.set('morrisonsEDI_formConfig', config);
            store.set('morrisonsEDI_lastSaved', new Date().toISOString());
            return { success: true };
        } catch (error) {
            console.error('Error saving configuration:', error);
            throw error;
        }
    });

    // Load configuration
    ipcMain.handle('load-config', async (event) => {
        try {
            if (!store) await initializeStore();
            
            const config = store.get('morrisonsEDI_formConfig', {});
            return config;
        } catch (error) {
            console.error('Error loading configuration:', error);
            throw error;
        }
    });

    // Clear configuration
    ipcMain.handle('clear-config', async (event) => {
        try {
            if (!store) await initializeStore();
            
            store.delete('morrisonsEDI_formConfig');
            store.delete('morrisonsEDI_lastSaved');
            return { success: true };
        } catch (error) {
            console.error('Error clearing configuration:', error);
            throw error;
        }
    });

    // Write file
    ipcMain.handle('write-file', async (event, filePath, content, options = {}) => {
        try {
            // Resolve path relative to app directory
            const fullPath = path.resolve(app.getPath('userData'), filePath);
            
            // Ensure directory exists
            const dir = path.dirname(fullPath);
            await fs.mkdir(dir, { recursive: true });
            
            // Write file
            if (options.flag === 'a') {
                // Append mode
                await fs.appendFile(fullPath, content, 'utf8');
            } else {
                // Write mode (default)
                await fs.writeFile(fullPath, content, 'utf8');
            }
            
            return { success: true, path: fullPath };
        } catch (error) {
            console.error('Error writing file:', error);
            throw error;
        }
    });

    // Read file
    ipcMain.handle('read-file', async (event, filePath) => {
        try {
            const fullPath = path.resolve(app.getPath('userData'), filePath);
            const content = await fs.readFile(fullPath, 'utf8');
            return { success: true, content };
        } catch (error) {
            console.error('Error reading file:', error);
            throw error;
        }
    });

    // Get app version
    ipcMain.handle('get-app-version', async (event) => {
        return app.getVersion();
    });

    // Show message box
    ipcMain.handle('show-message-box', async (event, options) => {
        const result = await dialog.showMessageBox(options);
        return result;
    });

    // Save encrypted credentials (supports both API and FTP credentials)
    ipcMain.handle('save-credentials', async (event, credentialType, credentials) => {
        try {
            if (!store) await initializeStore();
            
            // Encrypt the credentials using AES-256-GCM
            const encryptedCredentials = encryptionUtils.encryptCredentials(credentials);
            
            // Store the encrypted data with unique keys
            const storeKey = credentialType === 'apiCredentials' ? 'morrisonsEDI_userApiCredentials' : 'morrisonsEDI_userFtpCredentials';
            store.set(storeKey, encryptedCredentials);
            return { success: true };
        } catch (error) {
            console.error(`Error saving ${credentialType}:`, error);
            throw error;
        }
    });

    // Load encrypted credentials (supports both API and FTP credentials)
    ipcMain.handle('load-credentials', async (event, credentialType) => {
        try {
            if (!store) await initializeStore();
            
            const storeKey = credentialType === 'apiCredentials' ? 'morrisonsEDI_userApiCredentials' : 'morrisonsEDI_userFtpCredentials';
            const encryptedCredentials = store.get(storeKey);
            if (!encryptedCredentials) {
                return null;
            }
            
            // Decrypt the credentials
            const decryptedCredentials = encryptionUtils.decryptCredentials(encryptedCredentials);
            return decryptedCredentials;
        } catch (error) {
            console.error(`Error loading ${credentialType}:`, error);
            // If decryption fails, the data might be corrupted or tampered with
            throw new Error(`Failed to decrypt ${credentialType} - data may be corrupted`);
        }
    });

    // Clear encrypted credentials (supports both API and FTP credentials)
    ipcMain.handle('clear-credentials', async (event, credentialType) => {
        try {
            if (!store) await initializeStore();
            
            const storeKey = credentialType === 'apiCredentials' ? 'morrisonsEDI_userApiCredentials' : 'morrisonsEDI_userFtpCredentials';
            store.delete(storeKey);
            return { success: true };
        } catch (error) {
            console.error(`Error clearing ${credentialType}:`, error);
            throw error;
        }
    });

    // Force window focus (helps with Electron focus issues)
    ipcMain.handle('focus-window', async (event) => {
        try {
            // Try to get window from the event sender
            let win = BrowserWindow.fromWebContents(event.sender);
            
            // Fallback to global reference if available
            if (!win && global.mainWindow) {
                win = global.mainWindow;
            }
            
            // Final fallback to first available window
            if (!win) {
                const windows = BrowserWindow.getAllWindows();
                if (windows.length > 0) {
                    win = windows[0];
                }
            }
            
            if (win) {
                // Multi-step focus approach for different platforms
                win.show();
                win.focus();
                
                // Additional focus tricks for stubborn platforms
                if (process.platform === 'win32') {
                    // Windows-specific focus handling
                    win.setAlwaysOnTop(true);
                    win.setAlwaysOnTop(false);
                    win.focusOnWebView();
                } else if (process.platform === 'darwin') {
                    // macOS-specific focus handling
                    app.focus({ steal: true });
                } else {
                    // Linux-specific focus handling
                    win.setAlwaysOnTop(true);
                    win.setAlwaysOnTop(false);
                }
            }
            
            return { success: true };
        } catch (error) {
            console.error('Error focusing window:', error);
            return { success: false, error: error.message };
        }
    });
    
    // SFTP Sync Operations
    
    // Test SFTP sync (single run)
    ipcMain.handle('test-sync', async (event, config) => {
        try {
            if (!sftpManager) await initializeStore();
            
            const result = await sftpManager.syncFiles(
                config.credentials,
                config.remotePath
            );
            
            return { 
                success: true, 
                processedCount: result.processedCount,
                errorCount: result.errorCount,
                totalFiles: result.totalFiles,
                newFiles: result.newFiles
            };
        } catch (error) {
            console.error('Test sync failed:', error);
            return { success: false, error: error.message };
        }
    });

    // Start automatic SFTP sync
    ipcMain.handle('start-auto-sync', async (event, config) => {
        try {
            if (!sftpManager) await initializeStore();
            
            await sftpManager.startAutoSync(
                config.credentials,
                config.remotePath,
                config.intervalMinutes
            );
            
            return { success: true };
        } catch (error) {
            console.error('Failed to start auto sync:', error);
            return { success: false, error: error.message };
        }
    });

    // Stop automatic SFTP sync
    ipcMain.handle('stop-auto-sync', async (event) => {
        try {
            if (!sftpManager) await initializeStore();
            
            await sftpManager.stopAutoSync();
            return { success: true };
        } catch (error) {
            console.error('Failed to stop auto sync:', error);
            return { success: false, error: error.message };
        }
    });

    // Get SFTP sync status
    ipcMain.handle('get-sync-status', async (event) => {
        try {
            if (!sftpManager) await initializeStore();
            
            return sftpManager.getStatus();
        } catch (error) {
            console.error('Error getting sync status:', error);
            return { isRunning: false, isConnected: false, error: error.message };
        }
    });

    // Clear processed files list
    ipcMain.handle('clear-processed-files', async (event) => {
        try {
            if (!sftpManager) await initializeStore();
            
            await sftpManager.clearProcessedFiles();
            return { success: true };
        } catch (error) {
            console.error('Error clearing processed files:', error);
            return { success: false, error: error.message };
        }
    });

    // Get processed files list
    ipcMain.handle('get-processed-files', async (event) => {
        try {
            if (!sftpManager) await initializeStore();
            
            const files = sftpManager.getProcessedFiles();
            return { success: true, files };
        } catch (error) {
            console.error('Error getting processed files:', error);
            return { success: false, error: error.message };
        }
    });
}

// Alternative: Get store instance (for other uses in main process)
async function getStore() {
    if (!store) {
        await initializeStore();
    }
    return store;
}

// Export functions for use in main.js
module.exports = {
    setupIPCHandlers,
    getStore
};