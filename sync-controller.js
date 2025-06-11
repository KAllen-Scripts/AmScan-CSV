// FIXED: Sync Controller - Only add to processed files on complete success
const fs = require('fs').promises;
const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');

// Import the SFTPManager class and unified config
const SFTPManager = require('./sftp-manager');
const configManager = require('./config-manager');

class SyncController {
    constructor() {
        this.isRunning = false;
        this.autoSyncInterval = null;
        this.currentAutoSyncMinutes = null;
        this.pendingIntervalChange = null;
        this.pendingImmediateRun = false;
        this.currentFileData = null; // Store current file data for deletion
        
        // Initialize SFTP manager
        this.sftpManager = new SFTPManager();
        
        console.log('🎛️ SYNC: Initialized with unified configuration system');
        console.log('✅ FIXED: Files only added to processed list after complete success');
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
        console.log('✅ FIXED: Files only added to processed list after complete success');

        try {
            let result;

            if (configManager.useLocalFile) {
                console.log('🚨 CONFIG: Using local file instead of SFTP connection');
                result = await this.processLocalFile();
            } else {
                result = await this.handleSftpSync();
            }

            if (result.success) {
                console.log('✅ SYNC: Sync completed successfully');
                // Only save processed files after all processing is complete
                await configManager.saveProcessedFiles();
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
            
            // Process any downloaded files with safe deletion
            if (result && result.files) {
                let deletedCount = 0;
                for (const fileData of result.files) {
                    const processingResult = await this.processFile(fileData.fileName, fileData.content, fileData.remoteFilePath);
                    if (processingResult.success && processingResult.deleted) {
                        deletedCount++;
                    }
                }
                result.deletedCount = deletedCount;
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
            const filePath = configManager.localFilePath;
            console.log('🚨 CONFIG: Reading local file:', filePath);
            
            const fileContent = await fs.readFile(filePath, 'utf8');
            const fileName = path.basename(filePath);
            
            console.log(`🚨 CONFIG: Successfully read ${fileName} (${fileContent.length} chars)`);
            
            const processingResult = await this.processFile(fileName, fileContent, null);
            
            if (processingResult.success) {
                console.log('🚨 CONFIG: Local file processing completed successfully');
                return { success: true, message: 'Local file processed successfully' };
            } else {
                console.log('🚨 CONFIG: Local file processing failed');
                return { success: false, error: processingResult.error };
            }
            
        } catch (error) {
            console.error('🚨 CONFIG: Error processing local file:', error);
            return { success: false, error: error.message };
        }
    }

    async processFile(fileName, fileContent, remoteFilePath = null) {
        try {
            console.log(`🔒 ZERO-KB PROTECTION: Checking ${fileName}`);
            console.log(`🔒 Size check: ${fileName} = ${fileContent ? fileContent.length : 'NO CONTENT'} bytes`);
            
            // CRITICAL: Absolutely refuse to touch 0kb files
            if (!fileContent || fileContent.length === 0) {
                console.log(`🚫 ZERO-KB PROTECTION TRIGGERED: ${fileName} is 0kb - COMPLETELY IGNORED`);
                return { success: true, skipped: true, reason: 'zero-kb-protected' };
            }

            // EXTRA PROTECTION: Also skip very small files
            if (fileContent.length < 10) {
                console.log(`⏭️ SKIP: ${fileName} (too small - ${fileContent.length} chars)`);
                return { success: true, skipped: true, reason: 'too-small' };
            }

            if (configManager.skipProcessedFiles && configManager.hasProcessedFile(fileName)) {
                console.log(`⏭️ SKIP: ${fileName} (already processed)`);
                return { success: true, skipped: true, reason: 'processed' };
            }

            console.log(`📄 PROCESSING: ${fileName} (${fileContent.length} chars)`);
            
            const preview = fileContent.substring(0, 100).replace(/\n/g, ' ');
            console.log(`Preview: ${preview}...`);

            // Send to renderer and wait for processing result
            const processingResult = await this.sendFileToRendererAndWaitForResult(fileName, fileContent);
            
            if (processingResult && processingResult.success) {
                console.log(`✅ PROCESSING SUCCESS: ${fileName} - ready for deletion and marking as processed`);
                
                // Now it's safe to delete the file from server
                let deleted = false;
                if (remoteFilePath && this.sftpManager) {
                    // Reconnect if needed for deletion
                    try {
                        const ftpCredentials = await this.loadFtpCredentials();
                        if (ftpCredentials) {
                            await this.sftpManager.connect(ftpCredentials);
                            deleted = await this.sftpManager.deleteFileAfterSuccess(remoteFilePath, fileName);
                            await this.sftpManager.disconnect();
                        }
                    } catch (deleteError) {
                        console.error(`⚠️ DELETE: Error during deletion process for ${fileName}:`, deleteError.message);
                    }
                }
                
                // ✅ FIXED: ONLY add to processed files AFTER complete success
                configManager.addProcessedFile(fileName);
                console.log(`✅ MARKED PROCESSED: ${fileName} added to processed files list after success`);
                console.log(`📄 COMPLETE: ${fileName}`);
                return { success: true, deleted };
            } else {
                console.log(`❌ PROCESSING FAILED: ${fileName} - file left on server and NOT marked as processed`);
                return { success: false, error: processingResult?.error || 'Processing failed' };
            }

        } catch (error) {
            console.error(`❌ Error processing file ${fileName}:`, error.message);
            console.log(`💾 ERROR: ${fileName} left on server and NOT marked as processed due to processing error`);
            return { success: false, error: error.message };
        }
    }

    async sendFileToRendererAndWaitForResult(fileName, fileContent) {
        try {
            const mainWindow = global.mainWindow || BrowserWindow.getAllWindows()[0];
            
            if (!mainWindow) {
                throw new Error('No main window available to send file to renderer');
            }

            // Create a promise that resolves when we get the processing result
            return new Promise((resolve, reject) => {
                // Set up a one-time listener for the result
                const resultHandler = (event, resultFileName, result) => {
                    if (resultFileName === fileName) {
                        // Remove the listener
                        ipcMain.removeListener('notify-processing-complete', resultHandler);
                        resolve(result);
                    }
                };
                
                // Listen for the processing result
                ipcMain.on('notify-processing-complete', resultHandler);
                
                // Set a timeout in case renderer doesn't respond
                setTimeout(() => {
                    ipcMain.removeListener('notify-processing-complete', resultHandler);
                    reject(new Error('Timeout waiting for processing result'));
                }, 30000); // 30 second timeout
                
                // Send the file to renderer
                mainWindow.webContents.send('process-file', fileName, fileContent);
                console.log(`📤 Sent ${fileName} to renderer, waiting for result...`);
            });

        } catch (error) {
            console.error('Error sending file to renderer:', error);
            throw error;
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            autoSyncEnabled: !!this.autoSyncInterval,
            autoSyncMinutes: this.currentAutoSyncMinutes,
            pendingIntervalChange: this.pendingIntervalChange,
            pendingImmediateRun: this.pendingImmediateRun,
            processedFilesCount: configManager.getProcessedFilesCount(),
            debugConfig: configManager.getConfig()
        };
    }

    async manualSync() {
        console.log('🔄 MANUAL: Starting manual sync...');
        return await this.runSync();
    }

    async clearProcessedFiles() {
        await configManager.clearProcessedFiles();
        console.log('🗑️ Cleared processed files list');
        return { success: true, message: 'Processed files list cleared' };
    }

    getProcessedFiles() {
        return configManager.getProcessedFilesArray();
    }
}

// Create singleton instance
const syncController = new SyncController();

module.exports = {
    syncController,
    configManager // Export configManager for external access
};