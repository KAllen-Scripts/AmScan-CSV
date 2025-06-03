// SFTP Manager for handling file synchronization
// Requires: npm install ssh2-sftp-client

const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs').promises;

class SFTPManager {
    constructor() {
        this.sftp = new SftpClient();
        this.isConnected = false;
        this.processedFiles = new Set();
        this.processedFilesPath = null;
        this.syncInterval = null;
        this.isRunning = false;
        this.currentConfig = null;
        
        // Initialize processed files storage path
        this.initializeStorage();
    }

    /**
     * Initialize storage for tracking processed files
     */
    async initializeStorage() {
        const { app } = require('electron');
        const userDataPath = app.getPath('userData');
        this.processedFilesPath = path.join(userDataPath, 'processed_files.json');
        
        // Load existing processed files
        await this.loadProcessedFiles();
    }

    /**
     * Load previously processed files from storage
     */
    async loadProcessedFiles() {
        try {
            const data = await fs.readFile(this.processedFilesPath, 'utf8');
            const fileArray = JSON.parse(data);
            this.processedFiles = new Set(fileArray);
            console.log(`Loaded ${this.processedFiles.size} previously processed files`);
        } catch (error) {
            // File doesn't exist or is invalid, start with empty set
            console.log('No previous processed files found, starting fresh');
            this.processedFiles = new Set();
        }
    }

    /**
     * Save processed files to storage
     */
    async saveProcessedFiles() {
        try {
            const fileArray = Array.from(this.processedFiles);
            await fs.writeFile(this.processedFilesPath, JSON.stringify(fileArray, null, 2));
            console.log(`Saved ${fileArray.length} processed files to storage`);
        } catch (error) {
            console.error('Error saving processed files:', error);
        }
    }

    /**
     * Test basic network connectivity to the host/port
     */
    async testConnectivity(credentials) {
        return new Promise((resolve) => {
            const net = require('net');
            const socket = new net.Socket();
            
            const timeout = setTimeout(() => {
                socket.destroy();
                resolve({
                    success: false,
                    error: 'Connection timeout - host/port may not be accessible'
                });
            }, 10000);
            
            socket.connect(credentials.port || 22, credentials.host, () => {
                clearTimeout(timeout);
                socket.destroy();
                resolve({
                    success: true,
                    message: 'Basic connectivity test passed'
                });
            });
            
            socket.on('error', (error) => {
                clearTimeout(timeout);
                socket.destroy();
                resolve({
                    success: false,
                    error: `Network error: ${error.message}`
                });
            });
        });
    }

    /**
     * Connect to SFTP server using stored credentials
     */
    async connect(credentials) {
        if (this.isConnected) {
            console.log('Already connected to SFTP server');
            return true;
        }

        // First test basic connectivity
        console.log(`Testing connectivity to ${credentials.host}:${credentials.port || 22}...`);
        const connectivityTest = await this.testConnectivity(credentials);
        
        if (!connectivityTest.success) {
            console.error('Connectivity test failed:', connectivityTest.error);
            throw new Error(`Network connectivity test failed: ${connectivityTest.error}`);
        }
        
        console.log('Connectivity test passed, proceeding with SFTP connection...');

        try {
            const config = {
                host: credentials.host,
                port: credentials.port || 22,
                username: credentials.username,
                password: credentials.password,
                readyTimeout: 30000,  // Increased to 30 seconds
                retries: 5,           // Increased retries
                retry_minTimeout: 3000,
                retry_maxTimeout: 10000,
                // Connection-specific timeouts
                sock: {
                    readableTimeout: 30000,
                    writableTimeout: 30000
                },
                // Automatically accept unknown host keys
                algorithms: {
                    serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-ed25519'],
                    kex: ['ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group14-sha256', 'diffie-hellman-group16-sha512'],
                    cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
                    hmac: ['hmac-sha2-256', 'hmac-sha2-512']
                },
                // Custom host verification - accept all hosts
                hostVerifier: () => {
                    console.log('Auto-accepting host key for SFTP connection');
                    return true;
                },
                // Debug option for troubleshooting
                debug: process.argv.includes('--dev') ? console.log : undefined
            };

            console.log(`Connecting to SFTP server: ${credentials.host}:${config.port}`);
            console.log(`Connection timeout: ${config.readyTimeout}ms, Retries: ${config.retries}`);
            
            // Try connection with retry logic
            let lastError;
            for (let attempt = 1; attempt <= config.retries; attempt++) {
                try {
                    console.log(`Connection attempt ${attempt}/${config.retries}...`);
                    await this.sftp.connect(config);
                    this.isConnected = true;
                    this.currentConfig = credentials;
                    console.log('SFTP connection established successfully');
                    return true;
                } catch (error) {
                    lastError = error;
                    console.log(`Attempt ${attempt} failed: ${error.message}`);
                    
                    if (attempt < config.retries) {
                        const waitTime = Math.min(config.retry_minTimeout * attempt, config.retry_maxTimeout);
                        console.log(`Waiting ${waitTime}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                }
            }
            
            throw lastError;
            
        } catch (error) {
            console.error('SFTP connection failed after all retries:', error);
            this.isConnected = false;
            
            // Provide more specific error messages
            let errorMessage = error.message;
            if (error.code === 'ETIMEDOUT') {
                errorMessage = `Connection timeout to ${credentials.host}:${credentials.port}. Check if the server is running and port is accessible.`;
            } else if (error.code === 'ECONNREFUSED') {
                errorMessage = `Connection refused by ${credentials.host}:${credentials.port}. Check if SFTP service is running.`;
            } else if (error.code === 'ENOTFOUND') {
                errorMessage = `Host not found: ${credentials.host}. Check the hostname/IP address.`;
            } else if (error.code === 'ECONNRESET') {
                errorMessage = `Connection reset by ${credentials.host}. Server may be overloaded or blocking connections.`;
            }
            
            throw new Error(`SFTP connection failed: ${errorMessage}`);
        }
    }

    /**
     * Disconnect from SFTP server
     */
    async disconnect() {
        if (this.isConnected) {
            try {
                await this.sftp.end();
                this.isConnected = false;
                console.log('SFTP connection closed');
            } catch (error) {
                console.error('Error closing SFTP connection:', error);
            }
        }
    }

    /**
     * Get list of files from remote directory
     */
    async getRemoteFiles(remotePath) {
        if (!this.isConnected) {
            throw new Error('Not connected to SFTP server');
        }

        try {
            console.log(`Listing files in remote directory: ${remotePath}`);
            const fileList = await this.sftp.list(remotePath);
            
            // Filter for regular files only (not directories)
            const files = fileList
                .filter(item => item.type === '-')  // Regular files
                .map(item => item.name);
            
            console.log(`Found ${files.length} files in remote directory`);
            return files;
        } catch (error) {
            console.error('Error listing remote files:', error);
            throw new Error(`Failed to list remote files: ${error.message}`);
        }
    }

    /**
     * Download and process a single file
     */
    async downloadAndProcessFile(remotePath, fileName) {
        if (!this.isConnected) {
            throw new Error('Not connected to SFTP server');
        }

        try {
            const remoteFilePath = path.posix.join(remotePath, fileName);
            console.log(`Downloading file: ${fileName}`);
            
            // Download file content as buffer
            const fileContent = await this.sftp.get(remoteFilePath);
            
            // Convert buffer to string (assuming text files)
            const textContent = fileContent.toString('utf8');
            
            // Process the file content
            await this.processFileContent(fileName, textContent);
            
            // Mark file as processed
            this.processedFiles.add(fileName);
            
            console.log(`Successfully processed file: ${fileName}`);
            return true;
        } catch (error) {
            console.error(`Error downloading/processing file ${fileName}:`, error);
            throw new Error(`Failed to process file ${fileName}: ${error.message}`);
        }
    }

    /**
     * Process file content (placeholder - currently just logs)
     */
    async processFileContent(fileName, content) {
        console.log(`\n=== Processing File: ${fileName} ===`);
        console.log('File Content:');
        console.log(content);
        console.log(`=== End of ${fileName} ===\n`);
        
        // Log to results sidebar if available
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

    /**
     * Sync files from remote directory
     */
    async syncFiles(credentials, remotePath) {
        let processedCount = 0;
        let errorCount = 0;

        try {
            // Connect if not already connected
            if (!this.isConnected) {
                await this.connect(credentials);
            }

            // Get list of remote files
            const remoteFiles = await this.getRemoteFiles(remotePath);
            
            // Filter for new files (not previously processed)
            const newFiles = remoteFiles.filter(fileName => !this.processedFiles.has(fileName));
            
            console.log(`Found ${newFiles.length} new files to process`);

            if (newFiles.length === 0) {
                console.log('No new files to process');
                return { processedCount: 0, errorCount: 0, totalFiles: remoteFiles.length };
            }

            // Process each new file
            for (const fileName of newFiles) {
                try {
                    await this.downloadAndProcessFile(remotePath, fileName);
                    processedCount++;
                } catch (error) {
                    console.error(`Failed to process file ${fileName}:`, error);
                    errorCount++;
                }
            }

            // Save updated processed files list
            await this.saveProcessedFiles();

            console.log(`Sync completed: ${processedCount} processed, ${errorCount} errors`);
            return { 
                processedCount, 
                errorCount, 
                totalFiles: remoteFiles.length,
                newFiles: newFiles.length
            };

        } catch (error) {
            console.error('Sync operation failed:', error);
            throw error;
        }
    }

    /**
     * Start automatic syncing at specified interval
     */
    async startAutoSync(credentials, remotePath, intervalMinutes) {
        if (this.isRunning) {
            console.log('Auto sync is already running');
            return;
        }

        console.log(`Starting auto sync every ${intervalMinutes} minutes`);
        this.isRunning = true;

        // Initial sync
        try {
            await this.syncFiles(credentials, remotePath);
        } catch (error) {
            console.error('Initial sync failed:', error);
        }

        // Set up interval for subsequent syncs
        const intervalMs = intervalMinutes * 60 * 1000;
        this.syncInterval = setInterval(async () => {
            if (!this.isRunning) return;

            try {
                console.log('\n--- Starting scheduled sync ---');
                const result = await this.syncFiles(credentials, remotePath);
                
                // Log to results sidebar
                if (typeof window !== 'undefined' && window.sidebarManager) {
                    window.sidebarManager.addResult({
                        type: 'sync_completed',
                        timestamp: new Date().toISOString(),
                        processedCount: result.processedCount,
                        errorCount: result.errorCount,
                        totalFiles: result.totalFiles,
                        newFiles: result.newFiles
                    });
                }
            } catch (error) {
                console.error('Scheduled sync failed:', error);
                
                // Log error to results sidebar
                if (typeof window !== 'undefined' && window.sidebarManager) {
                    window.sidebarManager.addResult({
                        type: 'sync_error',
                        timestamp: new Date().toISOString(),
                        error: error.message
                    });
                }
            }
        }, intervalMs);

        console.log('Auto sync started successfully');
    }

    /**
     * Stop automatic syncing
     */
    async stopAutoSync() {
        if (!this.isRunning) {
            console.log('Auto sync is not running');
            return;
        }

        console.log('Stopping auto sync...');
        this.isRunning = false;

        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }

        // Disconnect from SFTP
        await this.disconnect();
        
        console.log('Auto sync stopped');
    }

    /**
     * Get sync status
     */
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

    /**
     * Clear processed files list (for testing/reset)
     */
    async clearProcessedFiles() {
        this.processedFiles.clear();
        await this.saveProcessedFiles();
        console.log('Cleared processed files list');
    }

    /**
     * Get list of processed files
     */
    getProcessedFiles() {
        return Array.from(this.processedFiles);
    }
}

module.exports = SFTPManager;