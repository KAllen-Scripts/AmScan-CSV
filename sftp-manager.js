// ENHANCED: SFTP Manager with Date Filtering - Only process files after 19/06/2025 5PM
// Uses unified configuration and storage

const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs').promises;
const configManager = require('./config-manager');

class SFTPManager {
    constructor() {
        this.sftp = null;
        this.isConnected = false;
        this.syncInterval = null;
        this.isRunning = false;
        this.currentConfig = null;
        this.connectionTimeout = null;
        
        // CUTOFF DATE: 19/06/2025 at 5PM (17:00) - Customer goes live today
        this.cutoffDate = new Date('2025-06-19T17:00:00.000Z'); // UTC time
        
        console.log('🔗 SFTP: Initialized with unified configuration');
        console.log(`📅 DATE FILTER: Only processing files created AFTER ${this.cutoffDate.toISOString()}`);
        console.log(`📅 DATE FILTER: Cutoff = 19/06/2025 5PM UTC (Customer go-live date)`);
        
        // Ensure cleanup on process exit
        process.on('exit', () => this.forceCleanup());
        process.on('SIGINT', () => this.forceCleanup());
        process.on('SIGTERM', () => this.forceCleanup());
        process.on('uncaughtException', () => this.forceCleanup());
    }

    forceCleanup() {
        console.log('🧹 CLEANUP: Force cleaning up SFTP connections...');
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
        }
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        if (this.sftp && this.sftp.client) {
            try {
                this.sftp.client.destroy();
                console.log('🧹 CLEANUP: Forced connection closure');
            } catch (error) {
                // Ignore cleanup errors
            }
        }
        this.isConnected = false;
        this.sftp = null;
    }

    async connect(credentials) {
        // Always ensure clean state before connecting
        await this.disconnect();
        
        console.log(`🔗 DIRECT-CONNECT: Attempting SFTP connection to ${credentials.host}:${credentials.port || 22}...`);
        console.log(`🔗 DIRECT-CONNECT: Skipping separate connectivity test to avoid rate limiting`);

        try {
            // Create fresh SFTP client
            this.sftp = new SftpClient();

            // Ultra-conservative configuration to be server-friendly
            const config = {
                host: credentials.host,
                port: credentials.port || 22,
                username: credentials.username,
                password: credentials.password,
                readyTimeout: 30000,    // Longer timeout for single attempt
                retries: 0,             // NO RETRIES
                keepaliveInterval: 0,   // No keepalive
                hostVerifier: () => true,
                // Most compatible algorithms only
                algorithms: {
                    serverHostKey: ['ssh-rsa'],
                    kex: ['diffie-hellman-group14-sha256'],
                    cipher: ['aes128-ctr'],
                    hmac: ['hmac-sha2-256']
                }
            };

            console.log(`🔗 DIRECT-CONNECT: Single connection attempt (no retries, no pre-test)...`);
            
            // Single connection attempt with timeout
            const connectionPromise = this.sftp.connect(config);
            const timeoutPromise = new Promise((_, reject) => {
                this.connectionTimeout = setTimeout(() => {
                    reject(new Error('SFTP connection timeout'));
                }, 35000); // Slightly longer than readyTimeout
            });

            await Promise.race([connectionPromise, timeoutPromise]);
            
            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
            }

            this.isConnected = true;
            this.currentConfig = credentials;
            
            console.log('✅ DIRECT-CONNECT: SFTP connection established successfully');
            
            // Minimal validation - just check if we can do something basic
            try {
                console.log('🔗 DIRECT-CONNECT: Quick validation...');
                
                // Try the simplest possible operation
                const testResult = await this.sftp.list('/');
                console.log(`✅ DIRECT-CONNECT: Validation successful - can list root directory`);
                
            } catch (validationError) {
                console.log(`⚠️ DIRECT-CONNECT: Root validation failed, trying target directory...`);
                
                // If root fails, try the target directory directly
                try {
                    const targetPath = credentials.directory || '/';
                    const testResult = await this.sftp.list(targetPath);
                    console.log(`✅ DIRECT-CONNECT: Target directory validation successful`);
                } catch (targetError) {
                    console.error('❌ DIRECT-CONNECT: Target directory validation failed:', targetError.message);
                    await this.disconnect();
                    throw new Error(`Cannot access target directory: ${targetError.message}`);
                }
            }

            return true;
            
        } catch (error) {
            console.error('❌ DIRECT-CONNECT: Connection failed:', error.message);
            await this.disconnect();
            
            // Provide helpful error message without encouraging immediate retry
            let friendlyMessage = 'SFTP connection failed.';
            if (error.message.includes('timeout')) {
                friendlyMessage = 'Connection timeout. Server may be busy.';
            } else if (error.message.includes('authentication') || error.message.includes('auth')) {
                friendlyMessage = 'Authentication failed. Check username/password.';
            } else if (error.message.includes('ECONNREFUSED')) {
                friendlyMessage = 'Connection refused. Check host/port.';
            } else if (error.message.includes('ENOTFOUND')) {
                friendlyMessage = 'Host not found. Check hostname.';
            }
            
            throw new Error(`${friendlyMessage} Please wait before retrying.`);
        }
    }

    async disconnect() {
        console.log('🔗 DISCONNECT: Cleaning up connection...');
        
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }

        if (this.sftp) {
            try {
                if (this.isConnected) {
                    console.log('🔗 DISCONNECT: Graceful close...');
                    await Promise.race([
                        this.sftp.end(),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Graceful close timeout')), 5000)
                        )
                    ]);
                    console.log('✅ DISCONNECT: Graceful close successful');
                }
            } catch (error) {
                console.log('⚠️ DISCONNECT: Graceful close failed, forcing...');
            }
            
            try {
                if (this.sftp.client) {
                    this.sftp.client.destroy();
                    console.log('✅ DISCONNECT: Forced close completed');
                }
            } catch (error) {
                console.log('⚠️ DISCONNECT: Force close error (ignored)');
            }
            
            this.sftp = null;
        }
        
        this.isConnected = false;
        console.log('🔗 DISCONNECT: Connection cleanup complete');
    }

    /**
     * Check if a file should be processed based on its modification time
     * @param {object} fileItem - File item from SFTP list with modifyTime
     * @param {string} fileName - Name of the file for logging
     * @returns {boolean} - True if file should be processed
     */
    isFileAfterCutoff(fileItem, fileName) {
        try {
            // Get the file's modification time
            const fileModTime = new Date(fileItem.modifyTime);
            
            // Check if file was modified after cutoff
            const isAfterCutoff = fileModTime > this.cutoffDate;
            
            if (isAfterCutoff) {
                console.log(`📅 DATE CHECK: ${fileName} - ACCEPT (${fileModTime.toISOString()} > ${this.cutoffDate.toISOString()})`);
            } else {
                console.log(`📅 DATE CHECK: ${fileName} - REJECT (${fileModTime.toISOString()} <= ${this.cutoffDate.toISOString()})`);
            }
            
            return isAfterCutoff;
        } catch (error) {
            console.error(`📅 DATE CHECK: Error checking ${fileName}:`, error.message);
            // If we can't determine the date, err on the side of caution and reject
            console.log(`📅 DATE CHECK: ${fileName} - REJECT (unable to determine date)`);
            return false;
        }
    }

    async getRemoteFiles(remotePath) {
        if (!this.isConnected || !this.sftp) {
            throw new Error('Not connected to SFTP server');
        }

        try {
            console.log(`📂 LIST: Listing files in: ${remotePath}`);
            console.log(`🔒 ZERO-KB PROTECTION: Files with 0 bytes will be completely ignored`);
            console.log(`📅 DATE FILTER: Only files after ${this.cutoffDate.toISOString()} will be processed`);
            
            const fileList = await this.sftp.list(remotePath);
            
            let dateFilteredCount = 0;
            let zeroKbCount = 0;
            let smallFileCount = 0;
            
            const files = fileList
                .filter(item => {
                    // CRITICAL: Only regular files
                    if (item.type !== '-') {
                        console.log(`⏭️ SKIP: ${item.name} (not a regular file - type: ${item.type})`);
                        return false;
                    }
                    
                    // CRITICAL: Skip 0kb files - ABSOLUTELY NOTHING happens to them
                    if (item.size === 0) {
                        zeroKbCount++;
                        console.log(`🚫 ZERO-KB PROTECTION: ${item.name} (0kb file - COMPLETELY IGNORED)`);
                        return false;
                    }
                    
                    // EXTRA PROTECTION: Also skip very small files that might be corrupt
                    if (item.size < 10) {
                        smallFileCount++;
                        console.log(`⏭️ SKIP: ${item.name} (too small - ${item.size} bytes)`);
                        return false;
                    }
                    
                    // NEW: Date filtering - only process files after cutoff date
                    if (!this.isFileAfterCutoff(item, item.name)) {
                        dateFilteredCount++;
                        return false;
                    }
                    
                    console.log(`✅ INCLUDE: ${item.name} (${item.size} bytes, modified: ${new Date(item.modifyTime).toISOString()})`);
                    return true;
                })
                .map(item => item.name);
            
            console.log(`✅ LIST: Found ${files.length} valid files for processing`);
            console.log(`📊 FILTERED: ${dateFilteredCount} files before cutoff date, ${zeroKbCount} zero-kb files, ${smallFileCount} small files`);
            console.log(`📅 CUTOFF: Files before ${this.cutoffDate.toISOString()} are ignored (customer manual entry period)`);
            
            if (files.length > 0) {
                console.log(`📂 LIST: Files to process: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
            }
            return files;
            
        } catch (error) {
            console.error('❌ LIST: Failed to list files:', error.message);
            await this.disconnect();
            throw new Error(`Failed to list remote files: ${error.message}`);
        }
    }

    async downloadAndProcessFile(remotePath, fileName) {
        if (!this.isConnected || !this.sftp) {
            throw new Error('Not connected to SFTP server');
        }

        try {
            const remoteFilePath = path.posix.join(remotePath, fileName);
            console.log(`📥 DOWNLOAD: Getting file: ${fileName}`);
            
            const fileContent = await this.sftp.get(remoteFilePath);
            const textContent = fileContent.toString('utf8');
            
            // CRITICAL: Double-check file size after download
            if (!textContent || textContent.length === 0) {
                console.log(`🚫 ZERO-KB PROTECTION: ${fileName} downloaded as 0kb - COMPLETELY IGNORED`);
                return { fileName, content: null, skipped: true, reason: 'zero-kb-after-download' };
            }

            if (textContent.length < 10) {
                console.log(`⏭️ SKIP: ${fileName} too small after download (${textContent.length} chars)`);
                return { fileName, content: null, skipped: true, reason: 'too-small-after-download' };
            }
            
            // Just log basic info - don't process here
            console.log(`📄 DOWNLOADED: ${fileName} (${textContent.length} chars)`);
            console.log(`Preview: ${textContent.substring(0, 100)}${textContent.length > 100 ? '...' : ''}`);
            
            // ❌ REMOVED: DO NOT add to processed files here - wait for processing confirmation
            // configManager.addProcessedFile(fileName); // REMOVED THIS LINE
            console.log(`💾 HOLDING: ${fileName} on server until processing confirmed`);
            
            console.log(`✅ DOWNLOAD: Successfully downloaded: ${fileName} (NOT yet marked as processed)`);
            
            return { 
                fileName, 
                content: textContent, 
                remoteFilePath: remoteFilePath // Include path for later deletion
            };
            
        } catch (error) {
            console.error(`❌ DOWNLOAD: Failed to process ${fileName}:`, error.message);
            throw error;
        }
    }

    async deleteFileAfterSuccess(remoteFilePath, fileName) {
        if (!this.isConnected || !this.sftp) {
            console.warn(`⚠️ DELETE: Cannot delete ${fileName} - not connected to SFTP server`);
            return false;
        }

        if (!configManager.fileDeletion) {
            console.log(`🐛 CONFIG: File deletion DISABLED - ${fileName} left on server`);
            return false;
        }

        try {
            await this.sftp.delete(remoteFilePath);
            console.log(`🗑️ SUCCESS-DELETE: ${fileName} deleted from server after successful processing`);
            return true;
        } catch (deleteError) {
            console.error(`⚠️ DELETE-ERROR: Failed to delete ${fileName} after success:`, deleteError.message);
            return false;
        }
    }

    async syncFiles(credentials, remotePath) {
        let connectionEstablished = false;
        
        try {
            console.log(`🔄 SYNC: Starting sync operation...`);
            console.log(`🔒 ZERO-KB PROTECTION: All 0kb files will be completely ignored`);
            console.log(`🛡️ SAFE DELETION: Files only deleted after complete processing success`);
            console.log(`✅ FIXED: Files only added to processed list after complete success`);
            console.log(`📅 DATE FILTER: Only processing files created after ${this.cutoffDate.toISOString()}`);
            console.log(`📅 CUSTOMER: Go-live date is 19/06/2025 5PM - everything before is manual entry`);
            
            // Check if we should use local file instead of SFTP
            if (configManager.useLocalFile) {
                console.log(`🐛 CONFIG: Using local file instead of SFTP connection`);
                return await this.processLocalFile();
            }
            
            await this.connect(credentials);
            connectionEstablished = true;
            
            const remoteFiles = await this.getRemoteFiles(remotePath);
            
            let filesToProcess;
            let skippedCount = 0;
            
            if (configManager.skipProcessedFiles) {
                filesToProcess = remoteFiles.filter(fileName => !configManager.hasProcessedFile(fileName));
                skippedCount = remoteFiles.length - filesToProcess.length;
                console.log(`🔄 SYNC: Processing ${filesToProcess.length} new files, skipping ${skippedCount}`);
            } else {
                filesToProcess = remoteFiles;
                console.log(`🔄 SYNC: Processing all ${filesToProcess.length} files (skip processed disabled)`);
            }

            let processedCount = 0;
            let errorCount = 0;
            let deletedCount = 0;
            let zeroKbSkippedCount = 0;
            const downloadedFiles = [];

            for (const fileName of filesToProcess) {
                try {
                    const fileData = await this.downloadAndProcessFile(remotePath, fileName);
                    
                    if (fileData.skipped) {
                        if (fileData.reason.includes('zero-kb')) {
                            zeroKbSkippedCount++;
                            console.log(`🚫 PROTECTED: ${fileName} (0kb file)`);
                        } else {
                            console.log(`⏭️ SKIPPED: ${fileName} (${fileData.reason})`);
                        }
                    } else {
                        downloadedFiles.push(fileData);
                        processedCount++;
                        // Note: deletedCount will be updated later after processing confirmation
                    }
                } catch (error) {
                    console.error(`❌ SYNC: Failed to process ${fileName}:`, error.message);
                    errorCount++;
                }
            }

            // ❌ REMOVED: Do not save processed files here - wait for processing confirmation
            // await configManager.saveProcessedFiles(); // REMOVED THIS LINE
            
            const summary = `✅ SYNC: Completed - ${processedCount} downloaded, ${errorCount} errors, ${zeroKbSkippedCount} 0kb files protected`;
            const details = `${skippedCount} skipped [Delete=${configManager.fileDeletion ? 'ON' : 'OFF'}, Skip=${configManager.skipProcessedFiles ? 'ON' : 'OFF'}] - Files held for processing confirmation`;
            const dateInfo = `📅 Date filter: Only files after ${this.cutoffDate.toISOString()}`;
            console.log(`${summary}, ${details}, ${dateInfo}`);
            
            return { 
                processedCount, 
                errorCount, 
                totalFiles: remoteFiles.length,
                deletedCount: 0, // Will be updated later after processing
                deletionErrors: 0,
                skippedCount,
                zeroKbSkippedCount,
                newFiles: filesToProcess.length,
                debugDeleteFiles: configManager.fileDeletion,
                debugSkipProcessed: configManager.skipProcessedFiles,
                cutoffDate: this.cutoffDate.toISOString(),
                files: downloadedFiles
            };

        } catch (error) {
            console.error('❌ SYNC: Sync operation failed:', error.message);
            throw error;
        } finally {
            if (connectionEstablished) {
                console.log('🔄 SYNC: Cleaning up connection...');
                await this.disconnect();
            }
        }
    }

    async startAutoSync(credentials, remotePath, intervalMinutes) {
        if (this.isRunning) {
            console.log('Auto sync is already running');
            return;
        }

        console.log(`🔄 AUTO: Starting auto sync every ${intervalMinutes} minutes (no pre-testing)`);
        console.log(`🔒 ZERO-KB PROTECTION: All 0kb files will be completely ignored`);
        console.log(`🛡️ SAFE DELETION: Files only deleted after complete processing success`);
        console.log(`✅ FIXED: Files only added to processed list after complete success`);
        console.log(`📅 DATE FILTER: Only processing files created after ${this.cutoffDate.toISOString()}`);
        this.isRunning = true;

        // Initial sync
        try {
            await this.syncFiles(credentials, remotePath);
        } catch (error) {
            console.error('❌ AUTO: Initial sync failed:', error.message);
        }

        // Set up interval with extra delay between runs to be server-friendly
        const intervalMs = intervalMinutes * 60 * 1000;
        this.syncInterval = setInterval(async () => {
            if (!this.isRunning) return;

            console.log('\n--- 🔄 AUTO: Starting scheduled sync ---');
            try {
                const result = await this.syncFiles(credentials, remotePath);
                
                if (typeof window !== 'undefined' && window.sidebarManager) {
                    window.sidebarManager.addResult({
                        type: 'sync_completed',
                        timestamp: new Date().toISOString(),
                        processedCount: result.processedCount,
                        errorCount: result.errorCount,
                        totalFiles: result.totalFiles,
                        newFiles: result.newFiles,
                        deletedCount: result.deletedCount,
                        deletionErrors: result.deletionErrors,
                        zeroKbSkippedCount: result.zeroKbSkippedCount,
                        debugDeleteFiles: result.debugDeleteFiles,
                        debugSkipProcessed: result.debugSkipProcessed,
                        cutoffDate: result.cutoffDate
                    });
                }
            } catch (error) {
                console.error('❌ AUTO: Scheduled sync failed:', error.message);
                
                if (typeof window !== 'undefined' && window.sidebarManager) {
                    window.sidebarManager.addResult({
                        type: 'sync_error',
                        timestamp: new Date().toISOString(),
                        error: error.message
                    });
                }
            }
            
            // Small delay after each sync to be server-friendly
            await new Promise(resolve => setTimeout(resolve, 2000));
        }, intervalMs);

        console.log('✅ AUTO: Auto sync started successfully');
    }

    async stopAutoSync() {
        console.log('🛑 AUTO: Stopping auto sync...');
        this.isRunning = false;
        
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        
        await this.disconnect();
        console.log('✅ AUTO: Auto sync stopped');
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            isConnected: this.isConnected,
            processedFilesCount: configManager.getProcessedFilesCount(),
            cutoffDate: this.cutoffDate.toISOString(),
            currentConfig: this.currentConfig ? {
                host: this.currentConfig.host,
                port: this.currentConfig.port,
                username: this.currentConfig.username,
                directory: this.currentConfig.directory
            } : null
        };
    }

    async clearProcessedFiles() {
        await configManager.clearProcessedFiles();
        console.log('Cleared processed files list');
    }

    getProcessedFiles() {
        return configManager.getProcessedFilesArray();
    }

    /**
     * Process local file instead of SFTP files
     */
    async processLocalFile() {
        try {
            console.log(`🐛 CONFIG: Reading local file: ${configManager.localFilePath}`);
            console.log(`🔒 ZERO-KB PROTECTION: Will check local file size`);
            console.log(`📅 DATE FILTER: Local file always processed regardless of date (debug mode)`);
            
            const fileContent = await fs.readFile(configManager.localFilePath, 'utf8');
            const fileName = path.basename(configManager.localFilePath);
            
            // CRITICAL: Check file size even for local files
            if (!fileContent || fileContent.length === 0) {
                console.log(`🚫 ZERO-KB PROTECTION: Local file ${fileName} is 0kb - COMPLETELY IGNORED`);
                return {
                    processedCount: 0,
                    errorCount: 0,
                    totalFiles: 1,
                    deletedCount: 0,
                    deletionErrors: 0,
                    skippedCount: 0,
                    zeroKbSkippedCount: 1,
                    newFiles: 0,
                    debugDeleteFiles: configManager.fileDeletion,
                    debugSkipProcessed: configManager.skipProcessedFiles,
                    debugLocalFile: true,
                    cutoffDate: this.cutoffDate.toISOString(),
                    files: []
                };
            }

            if (fileContent.length < 10) {
                console.log(`⏭️ SKIP: Local file ${fileName} too small (${fileContent.length} chars)`);
                return {
                    processedCount: 0,
                    errorCount: 0,
                    totalFiles: 1,
                    deletedCount: 0,
                    deletionErrors: 0,
                    skippedCount: 1,
                    zeroKbSkippedCount: 0,
                    newFiles: 0,
                    debugDeleteFiles: configManager.fileDeletion,
                    debugSkipProcessed: configManager.skipProcessedFiles,
                    debugLocalFile: true,
                    cutoffDate: this.cutoffDate.toISOString(),
                    files: []
                };
            }
            
            console.log(`🐛 CONFIG: Successfully read ${fileName} (${fileContent.length} chars)`);
            console.log(`📅 DEBUG: Local file processed without date restriction`);
            
            // ❌ REMOVED: Do not mark as processed here - wait for processing confirmation
            // configManager.addProcessedFile(fileName); // REMOVED THIS LINE
            // await configManager.saveProcessedFiles(); // REMOVED THIS LINE
            
            console.log(`🐛 CONFIG: Local file ready for processing (NOT yet marked as processed)`);
            
            return {
                processedCount: 1,
                errorCount: 0,
                totalFiles: 1,
                deletedCount: 0,
                deletionErrors: 0,
                skippedCount: 0,
                zeroKbSkippedCount: 0,
                newFiles: 1,
                debugDeleteFiles: configManager.fileDeletion,
                debugSkipProcessed: configManager.skipProcessedFiles,
                debugLocalFile: true,
                cutoffDate: this.cutoffDate.toISOString(),
                files: [{ fileName, content: fileContent, remoteFilePath: null }]
            };
            
        } catch (error) {
            console.error(`🐛 CONFIG: Error reading local file ${configManager.localFilePath}:`, error.message);
            throw new Error(`Failed to read local debug file: ${error.message}`);
        }
    }
}

module.exports = SFTPManager;