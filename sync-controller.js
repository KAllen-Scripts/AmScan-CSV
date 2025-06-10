const fs = require('fs').promises;
const path = require('path');
const { BrowserWindow } = require('electron');

// Import the SFTPManager class
const SFTPManager = require('./sftp-manager');

// Debug configuration
const DEBUG_CONFIG = {
    FILE_DELETION: false,           // Set to true to enable file deletion
    SKIP_PROCESSED_FILES: false,    // Set to true to skip files that have been processed before
    USE_LOCAL_FILE: false,           // Set to true to use a local file instead of SFTP
    LOCAL_FILE_PATH: './2025-04-07-075001_import.txt'  // Path to local test file
};

// Storage for processed files
let processedFiles = new Set();

class SyncController {
    constructor() {
        this.isRunning = false;
        this.autoSyncInterval = null;
        this.currentAutoSyncMinutes = null;
        this.pendingIntervalChange = null;
        this.pendingImmediateRun = false;
        
        // Initialize SFTP manager
        this.sftpManager = new SFTPManager();
        
        // Load processed files on startup
        this.loadProcessedFiles();
        
        // Set up debug messages
        this.logDebugConfig();
    }

    logDebugConfig() {
        console.log('🚨 DEBUG MODE: File Deletion =', DEBUG_CONFIG.FILE_DELETION ? 'ENABLED' : 'DISABLED');
        console.log('🚨 DEBUG MODE: Skip Processed Files =', DEBUG_CONFIG.SKIP_PROCESSED_FILES ? 'ENABLED' : 'DISABLED');
        console.log('🚨 DEBUG MODE: Use Local File =', DEBUG_CONFIG.USE_LOCAL_FILE ? 'ENABLED' : 'DISABLED');
        if (DEBUG_CONFIG.USE_LOCAL_FILE) {
            console.log('🚨 DEBUG MODE: Local File Path =', DEBUG_CONFIG.LOCAL_FILE_PATH);
        }
    }

    async loadProcessedFiles() {
        try {
            const { getStore } = require('./main-process-handlers');
            const store = await getStore();
            const stored = store.get('processedFiles', []);
            processedFiles = new Set(stored);
            console.log(`Loaded ${processedFiles.size} previously processed files`);
        } catch (error) {
            console.error('Error loading processed files:', error);
            processedFiles = new Set();
        }
    }

    async saveProcessedFiles() {
        try {
            const { getStore } = require('./main-process-handlers');
            const store = await getStore();
            store.set('processedFiles', Array.from(processedFiles));
            console.log(`Saved ${processedFiles.size} processed files to storage`);
        } catch (error) {
            console.error('Error saving processed files:', error);
        }
    }

    async changeAutoSyncInterval(newMinutes) {
        try {
            console.log(`🔄 INTERVAL-CHANGE: Changing interval to ${newMinutes} minutes`);
            
            if (!this.autoSyncInterval) {
                console.log('🔄 INTERVAL-CHANGE: No auto-sync running, starting immediately');
                return await this.startAutoSync(newMinutes, false);
            }
            
            if (!this.isRunning) {
                console.log('🔄 INTERVAL-CHANGE: Auto-sync idle, restarting immediately with new interval');
                return await this.startAutoSync(newMinutes, false);
            }
            
            const currentInterval = this.currentAutoSyncMinutes;
            this.pendingIntervalChange = newMinutes;
            
            if (newMinutes < currentInterval) {
                this.pendingImmediateRun = true;
                console.log(`✅ INTERVAL-CHANGE: Will run immediately after current sync (shorter interval: ${currentInterval}min → ${newMinutes}min), then every ${newMinutes} minutes`);
                return { 
                    success: true, 
                    message: `Will run immediately after current sync completes, then every ${newMinutes} minutes` 
                };
            } else {
                this.pendingImmediateRun = false;
                console.log(`✅ INTERVAL-CHANGE: Will change to ${newMinutes} minutes after current sync (longer interval: ${currentInterval}min → ${newMinutes}min)`);
                return { 
                    success: true, 
                    message: `Interval change to ${newMinutes} minutes scheduled after current cycle completes` 
                };
            }
            
        } catch (error) {
            console.error('❌ INTERVAL-CHANGE: Error scheduling interval change:', error);
            return { success: false, error: error.message };
        }
    }

    async startAutoSync(minutes, preTest = true) {
        try {
            console.log(`🔄 AUTO: Starting auto sync with ${minutes} minute interval...`);
            
            if (this.autoSyncInterval) {
                console.log('🛑 AUTO: Stopping existing auto sync...');
                this.stopAutoSync();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            this.currentAutoSyncMinutes = minutes;
            this.pendingIntervalChange = null;
            this.pendingImmediateRun = false;
            
            if (preTest) {
                console.log('🔄 AUTO: Pre-testing sync before starting auto mode...');
                const testResult = await this.runSync();
                if (!testResult.success) {
                    throw new Error(`Pre-test failed: ${testResult.error}`);
                }
                console.log('✅ AUTO: Pre-test successful, starting auto sync...');
            } else {
                console.log(`🔄 AUTO: Starting auto sync every ${minutes} minutes (no pre-testing)`);
            }

            const intervalMs = minutes * 60 * 1000;
            console.log(`⏰ AUTO: Setting up interval for ${intervalMs}ms (${minutes} minutes)`);
            
            this.autoSyncInterval = setInterval(async () => {
                console.log(`--- 🔄 AUTO: Starting scheduled sync (every ${this.currentAutoSyncMinutes} minutes) ---`);
                await this.runSync();
                
                if (this.pendingIntervalChange !== null) {
                    const newMinutes = this.pendingIntervalChange;
                    const shouldRunImmediately = this.pendingImmediateRun;
                    
                    console.log(`🔄 INTERVAL-CHANGE: Applying pending interval change to ${newMinutes} minutes`);
                    if (shouldRunImmediately) {
                        console.log(`🚀 INTERVAL-CHANGE: Will run immediately, then every ${newMinutes} minutes`);
                    }
                    
                    this.pendingIntervalChange = null;
                    this.pendingImmediateRun = false;
                    
                    setTimeout(async () => {
                        await this.startAutoSync(newMinutes, false);
                        
                        if (shouldRunImmediately) {
                            console.log(`🚀 INTERVAL-CHANGE: Running immediate sync with new ${newMinutes} minute interval`);
                            setTimeout(() => {
                                this.runSync();
                            }, 500);
                        }
                    }, 100);
                }
            }, intervalMs);

            console.log('🚀 AUTO: Running initial sync...');
            await this.runSync();

            console.log(`🎉 AUTO: Auto sync started successfully - running every ${minutes} minutes`);
            return { success: true, message: `Auto sync started every ${minutes} minutes` };

        } catch (error) {
            console.error('❌ AUTO: Error starting auto sync:', error);
            return { success: false, error: error.message };
        }
    }

    stopAutoSync() {
        console.log('🛑 AUTO: Stopping auto sync...');
        
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
            console.log('✅ AUTO: Auto sync interval cleared');
        }
        
        this.currentAutoSyncMinutes = null;
        this.pendingIntervalChange = null;
        this.pendingImmediateRun = false;
        console.log('⏹️ AUTO: Auto sync stopped completely');
        
        return { success: true, message: 'Auto sync stopped' };
    }

    async runSync() {
        if (this.isRunning) {
            console.log('⏳ SYNC: Sync already in progress, skipping...');
            return { success: false, error: 'Sync already in progress' };
        }

        this.isRunning = true;
        console.log('🔄 SYNC: Starting sync operation...');

        try {
            let result;

            if (DEBUG_CONFIG.USE_LOCAL_FILE) {
                console.log('🚨 DEBUG: Using local file instead of SFTP connection');
                result = await this.processLocalFile();
            } else {
                result = await this.handleSftpSync();
            }

            if (result.success) {
                console.log('✅ SYNC: Sync completed successfully');
                await this.saveProcessedFiles();
                return result;
            } else {
                console.error('❌ SYNC: Sync failed:', result.error);
                return result;
            }

        } catch (error) {
            console.error('❌ SYNC: Unexpected error during sync:', error);
            return { success: false, error: error.message };
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * SIMPLE: Load FTP credentials and sync
     */
    async handleSftpSync() {
        try {
            console.log('🔍 CREDS: Loading FTP credentials...');
            
            // Load FTP credentials using the simple method
            const ftpCredentials = await this.loadFtpCredentials();
            
            if (!ftpCredentials) {
                throw new Error('No FTP credentials found. Please configure FTP credentials in the UI.');
            }
            
            console.log('🔍 CREDS: FTP credentials loaded successfully');
            
            if (!ftpCredentials.host || !ftpCredentials.username || !ftpCredentials.password) {
                throw new Error(`FTP credentials incomplete. Host: ${!!ftpCredentials.host}, Username: ${!!ftpCredentials.username}, Password: ${!!ftpCredentials.password}`);
            }
            
            console.log(`🔍 CREDS: Found FTP credentials for host: ${ftpCredentials.host}:${ftpCredentials.port || 22}`);
            console.log(`🔍 CREDS: Username: ${ftpCredentials.username}`);
            console.log(`🔍 CREDS: Directory: ${ftpCredentials.directory || '/'}`);
            console.log(`🔍 CREDS: Secure: ${ftpCredentials.secure ? 'Yes' : 'No'}`);
            
            // Use the SFTP manager to sync files
            const result = await this.sftpManager.syncFiles(
                ftpCredentials,
                ftpCredentials.directory || '/'
            );
            
            // Process any downloaded files
            if (result && result.files) {
                for (const fileData of result.files) {
                    await this.processFile(fileData.fileName, fileData.content);
                }
            }
            
            console.log('✅ SFTP: SFTP sync completed successfully');
            return { success: true, result };
            
        } catch (error) {
            console.error('❌ SFTP: SFTP sync failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * SIMPLE: Load FTP credentials from storage (main process version)
     */
    async loadFtpCredentials() {
        try {
            // We're in the main process, so access storage directly
            const { getStore } = require('./main-process-handlers');
            const EncryptionUtils = require('./encryption-utils');
            
            const store = await getStore();
            const encryptionUtils = new EncryptionUtils();
            
            const storageKey = 'ftpSyncApp_ftpCredentials';
            const encryptedCredentials = store.get(storageKey);
            
            if (encryptedCredentials) {
                const credentials = encryptionUtils.decryptCredentials(encryptedCredentials);
                console.log('✅ FTP credentials loaded from main process storage');
                return credentials;
            } else {
                console.log('❌ No FTP credentials found in main process storage');
                return null;
            }
        } catch (error) {
            console.error('❌ Error loading FTP credentials:', error);
            return null;
        }
    }

    async processLocalFile() {
        try {
            const filePath = DEBUG_CONFIG.LOCAL_FILE_PATH;
            console.log('🚨 DEBUG: Reading local file:', filePath);
            
            const fileContent = await fs.readFile(filePath, 'utf8');
            const fileName = path.basename(filePath);
            
            console.log(`🚨 DEBUG: Successfully read ${fileName} (${fileContent.length} chars)`);
            
            await this.processFile(fileName, fileContent);
            
            console.log('🚨 DEBUG: Local file processing completed');
            return { success: true, message: 'Local file processed successfully' };
            
        } catch (error) {
            console.error('🚨 DEBUG: Error processing local file:', error);
            return { success: false, error: error.message };
        }
    }

    async processFile(fileName, fileContent) {
        try {
            // Skip 0kb files
            if (!fileContent || fileContent.length === 0) {
                console.log(`⏭️ SKIP: ${fileName} (0kb file)`);
                return { success: true, skipped: true, reason: 'empty' };
            }

            if (DEBUG_CONFIG.SKIP_PROCESSED_FILES && processedFiles.has(fileName)) {
                console.log(`⏭️ SKIP: ${fileName} (already processed)`);
                return { success: true, skipped: true, reason: 'processed' };
            }

            console.log(`📄 PROCESSING: ${fileName} (${fileContent.length} chars)`);
            
            const preview = fileContent.substring(0, 100).replace(/\n/g, ' ');
            console.log(`Preview: ${preview}...`);

            await this.sendFileToRenderer(fileName, fileContent);

            processedFiles.add(fileName);
            
            console.log(`📄 END: ${fileName}`);
            return { success: true };

        } catch (error) {
            console.error(`❌ Error processing file ${fileName}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    async sendFileToRenderer(fileName, fileContent) {
        try {
            const mainWindow = global.mainWindow || BrowserWindow.getAllWindows()[0];
            
            if (!mainWindow) {
                throw new Error('No main window available to send file to renderer');
            }

            mainWindow.webContents.send('process-file', fileName, fileContent);
            
            console.log(`📤 Sent ${fileName} to renderer for processing`);

            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error('Error sending file to renderer:', error);
            console.log('📄 File processing will continue without renderer processing');
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            autoSyncEnabled: !!this.autoSyncInterval,
            autoSyncMinutes: this.currentAutoSyncMinutes,
            pendingIntervalChange: this.pendingIntervalChange,
            pendingImmediateRun: this.pendingImmediateRun,
            processedFilesCount: processedFiles.size,
            debugConfig: DEBUG_CONFIG
        };
    }

    async manualSync() {
        console.log('🔄 MANUAL: Starting manual sync...');
        return await this.runSync();
    }

    async clearProcessedFiles() {
        processedFiles.clear();
        await this.saveProcessedFiles();
        console.log('🗑️ Cleared processed files list');
        return { success: true, message: 'Processed files list cleared' };
    }

    getProcessedFiles() {
        return Array.from(processedFiles);
    }
}

// Create singleton instance
const syncController = new SyncController();

module.exports = {
    syncController,
    DEBUG_CONFIG
};