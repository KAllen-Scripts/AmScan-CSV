// SFTP Manager WITHOUT separate connectivity testing
// Goes directly to SFTP connection to avoid triggering rate limiting

const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs').promises;

class SFTPManager {
    constructor() {
        this.sftp = null;
        this.isConnected = false;
        this.processedFiles = new Set();
        this.processedFilesPath = null;
        this.syncInterval = null;
        this.isRunning = false;
        this.currentConfig = null;
        this.connectionTimeout = null;
        
        // DEBUG TOGGLES
        this.DEBUG_DELETE_FILES = false;
        this.DEBUG_SKIP_PROCESSED = false;
        this.DEBUG_USE_LOCAL_FILE = true;  // Set to true to use local file instead of SFTP
        this.DEBUG_LOCAL_FILE_PATH = './2025-04-07-075001_import.txt';  // Path to local test file
        
        console.log(`🐛 DEBUG MODE: File Deletion = ${this.DEBUG_DELETE_FILES ? 'ENABLED' : 'DISABLED'}`);
        console.log(`🐛 DEBUG MODE: Skip Processed Files = ${this.DEBUG_SKIP_PROCESSED ? 'ENABLED' : 'DISABLED'}`);
        console.log(`🐛 DEBUG MODE: Use Local File = ${this.DEBUG_USE_LOCAL_FILE ? 'ENABLED' : 'DISABLED'}`);
        if (this.DEBUG_USE_LOCAL_FILE) {
            console.log(`🐛 DEBUG MODE: Local File Path = ${this.DEBUG_LOCAL_FILE_PATH}`);
        }
        
        this.initializeStorage();
        
        // Ensure cleanup on process exit
        process.on('exit', () => this.forceCleanup());
        process.on('SIGINT', () => this.forceCleanup());
        process.on('SIGTERM', () => this.forceCleanup());
        process.on('uncaughtException', () => this.forceCleanup());
    }

    async initializeStorage() {
        const { app } = require('electron');
        const userDataPath = app.getPath('userData');
        this.processedFilesPath = path.join(userDataPath, 'processed_files.json');
        await this.loadProcessedFiles();
    }

    async loadProcessedFiles() {
        try {
            const data = await fs.readFile(this.processedFilesPath, 'utf8');
            const fileArray = JSON.parse(data);
            this.processedFiles = new Set(fileArray);
            console.log(`Loaded ${this.processedFiles.size} previously processed files`);
        } catch (error) {
            console.log('No previous processed files found, starting fresh');
            this.processedFiles = new Set();
        }
    }

    async saveProcessedFiles() {
        try {
            const fileArray = Array.from(this.processedFiles);
            await fs.writeFile(this.processedFilesPath, JSON.stringify(fileArray, null, 2));
            console.log(`Saved ${fileArray.length} processed files to storage`);
        } catch (error) {
            console.error('Error saving processed files:', error);
        }
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
        
        // NO SEPARATE CONNECTIVITY TEST - go directly to SFTP
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

    async getRemoteFiles(remotePath) {
        if (!this.isConnected || !this.sftp) {
            throw new Error('Not connected to SFTP server');
        }

        try {
            console.log(`📂 LIST: Listing files in: ${remotePath}`);
            
            const fileList = await this.sftp.list(remotePath);
            
            const files = fileList
                .filter(item => item.type === '-')
                .map(item => item.name);
            
            console.log(`✅ LIST: Found ${files.length} files`);
            if (files.length > 0) {
                console.log(`📂 LIST: Files: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
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
            
            await this.processFileContent(fileName, textContent);
            
            // DEBUG: Conditionally delete
            if (this.DEBUG_DELETE_FILES) {
                try {
                    await this.sftp.delete(remoteFilePath);
                    console.log(`🗑️ DEBUG: Deleted ${fileName} from server`);
                } catch (deleteError) {
                    console.error(`⚠️ DEBUG: Failed to delete ${fileName}:`, deleteError.message);
                }
            } else {
                console.log(`🐛 DEBUG: File deletion DISABLED - ${fileName} left on server`);
            }
            
            this.processedFiles.add(fileName);
            console.log(`✅ DOWNLOAD: Successfully processed: ${fileName}`);
            return true;
            
        } catch (error) {
            console.error(`❌ DOWNLOAD: Failed to process ${fileName}:`, error.message);
            throw error;
        }
    }

    async processFileContent(fileName, content) {
        console.log(`\n📄 PROCESSING: ${fileName} (${content.length} chars)`);
        console.log(`Preview: ${content.substring(0, 150)}${content.length > 150 ? '...' : ''}`);
        
        // Import and call the order processor
        try {
            const { processAmscanFile } = require('./amscan-order-parser');
            processAmscanFile(fileName, content);
        } catch (error) {
            console.error(`❌ Error processing file ${fileName}:`, error.message);
        }
        
        console.log(`📄 END: ${fileName}\n`);
        
        if (typeof window !== 'undefined' && window.sidebarManager) {
            window.sidebarManager.addResult({
                type: 'file_processed',
                fileName: fileName,
                timestamp: new Date().toISOString(),
                contentLength: content.length,
                preview: content.substring(0, 100) + (content.length > 100 ? '...' : '')
            });
        }
    }

    async syncFiles(credentials, remotePath) {
        let connectionEstablished = false;
        
        try {
            console.log(`🔄 SYNC: Starting sync operation...`);
            
            // DEBUG: Check if we should use local file instead of SFTP
            if (this.DEBUG_USE_LOCAL_FILE) {
                console.log(`🐛 DEBUG: Using local file instead of SFTP connection`);
                return await this.processLocalFile();
            }
            
            await this.connect(credentials);
            connectionEstablished = true;
            
            const remoteFiles = await this.getRemoteFiles(remotePath);
            
            let filesToProcess;
            let skippedCount = 0;
            
            if (this.DEBUG_SKIP_PROCESSED) {
                filesToProcess = remoteFiles.filter(fileName => !this.processedFiles.has(fileName));
                skippedCount = remoteFiles.length - filesToProcess.length;
                console.log(`🔄 SYNC: Processing ${filesToProcess.length} new files, skipping ${skippedCount}`);
            } else {
                filesToProcess = remoteFiles;
                console.log(`🔄 SYNC: Processing all ${filesToProcess.length} files (debug mode)`);
            }

            let processedCount = 0;
            let errorCount = 0;
            let deletedCount = 0;

            for (const fileName of filesToProcess) {
                try {
                    await this.downloadAndProcessFile(remotePath, fileName);
                    processedCount++;
                    if (this.DEBUG_DELETE_FILES) {
                        deletedCount++;
                    }
                } catch (error) {
                    console.error(`❌ SYNC: Failed to process ${fileName}:`, error.message);
                    errorCount++;
                }
            }

            await this.saveProcessedFiles();
            
            const summary = `✅ SYNC: Completed - ${processedCount} processed, ${errorCount} errors`;
            const details = `${deletedCount} deleted, ${skippedCount} skipped [Delete=${this.DEBUG_DELETE_FILES ? 'ON' : 'OFF'}, Skip=${this.DEBUG_SKIP_PROCESSED ? 'ON' : 'OFF'}]`;
            console.log(`${summary}, ${details}`);
            
            return { 
                processedCount, 
                errorCount, 
                totalFiles: remoteFiles.length,
                deletedCount,
                deletionErrors: 0,
                skippedCount,
                newFiles: filesToProcess.length,
                debugDeleteFiles: this.DEBUG_DELETE_FILES,
                debugSkipProcessed: this.DEBUG_SKIP_PROCESSED
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
                        debugDeleteFiles: result.debugDeleteFiles,
                        debugSkipProcessed: result.debugSkipProcessed
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
            processedFilesCount: this.processedFiles.size,
            currentConfig: this.currentConfig ? {
                host: this.currentConfig.host,
                port: this.currentConfig.port,
                username: this.currentConfig.username,
                directory: this.currentConfig.directory
            } : null
        };
    }

    async clearProcessedFiles() {
        this.processedFiles.clear();
        await this.saveProcessedFiles();
        console.log('Cleared processed files list');
    }

    getProcessedFiles() {
        return Array.from(this.processedFiles);
    }

    /**
     * DEBUG: Process local file instead of SFTP files
     */
    async processLocalFile() {
        try {
            console.log(`🐛 DEBUG: Reading local file: ${this.DEBUG_LOCAL_FILE_PATH}`);
            
            const fileContent = await fs.readFile(this.DEBUG_LOCAL_FILE_PATH, 'utf8');
            const fileName = path.basename(this.DEBUG_LOCAL_FILE_PATH);
            
            console.log(`🐛 DEBUG: Successfully read ${fileName} (${fileContent.length} chars)`);
            
            // Process the file content
            await this.processFileContent(fileName, fileContent);
            
            // Mark as processed
            this.processedFiles.add(fileName);
            await this.saveProcessedFiles();
            
            console.log(`🐛 DEBUG: Local file processing completed`);
            
            return {
                processedCount: 1,
                errorCount: 0,
                totalFiles: 1,
                deletedCount: 0,
                deletionErrors: 0,
                skippedCount: 0,
                newFiles: 1,
                debugDeleteFiles: this.DEBUG_DELETE_FILES,
                debugSkipProcessed: this.DEBUG_SKIP_PROCESSED,
                debugLocalFile: true
            };
            
        } catch (error) {
            console.error(`🐛 DEBUG: Error reading local file ${this.DEBUG_LOCAL_FILE_PATH}:`, error.message);
            throw new Error(`Failed to read local debug file: ${error.message}`);
        }
    }
}

module.exports = SFTPManager;