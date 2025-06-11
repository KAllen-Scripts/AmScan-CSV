// FIXED: Config Manager - Enhanced processed files handling
// Single source of truth for all configuration

class ConfigManager {
    constructor() {
        this.config = {
            FILE_DELETION: false,           // Set to true to enable file deletion
            SKIP_PROCESSED_FILES: true,     // Set to true to skip files that have been processed before
            USE_LOCAL_FILE: false,          // Set to true to use a local file instead of SFTP
            LOCAL_FILE_PATH: './2025-04-07-075001_import.txt'  // Path to local test file
        };
        
        this.processedFiles = new Set();
        this.processedFilesPath = null;
        this.store = null;
        
        this.initializeStorage();
        this.logConfig();
    }

    async initializeStorage() {
        try {
            const { getStore } = require('./main-process-handlers');
            this.store = await getStore();
            await this.loadProcessedFiles();
        } catch (error) {
            console.error('❌ CONFIG: Error initializing storage:', error);
        }
    }

    logConfig() {
        console.log('⚙️ CONFIG: Unified Configuration Loaded');
        console.log(`🚨 DEBUG MODE: File Deletion = ${this.config.FILE_DELETION ? 'ENABLED' : 'DISABLED'}`);
        console.log(`🚨 DEBUG MODE: Skip Processed Files = ${this.config.SKIP_PROCESSED_FILES ? 'ENABLED' : 'DISABLED'}`);
        console.log(`🚨 DEBUG MODE: Use Local File = ${this.config.USE_LOCAL_FILE ? 'ENABLED' : 'DISABLED'}`);
        if (this.config.USE_LOCAL_FILE) {
            console.log(`🚨 DEBUG MODE: Local File Path = ${this.config.LOCAL_FILE_PATH}`);
        }
        console.log('🔒 ZERO-KB PROTECTION: All 0kb files will be completely ignored');
        console.log('🛡️ SAFE DELETION: Files only deleted after complete processing success');
        console.log('💾 UNIFIED STORAGE: Single processed files list managed centrally');
        console.log('✅ FIXED: Files only added to processed list after complete success');
    }

    // Getters for configuration
    get fileDeletion() { return this.config.FILE_DELETION; }
    get skipProcessedFiles() { return this.config.SKIP_PROCESSED_FILES; }
    get useLocalFile() { return this.config.USE_LOCAL_FILE; }
    get localFilePath() { return this.config.LOCAL_FILE_PATH; }

    // Setters for configuration (with immediate logging)
    setFileDeletion(value) {
        this.config.FILE_DELETION = value;
        console.log(`⚙️ CONFIG: File Deletion ${value ? 'ENABLED' : 'DISABLED'}`);
    }

    setSkipProcessedFiles(value) {
        this.config.SKIP_PROCESSED_FILES = value;
        console.log(`⚙️ CONFIG: Skip Processed Files ${value ? 'ENABLED' : 'DISABLED'}`);
    }

    setUseLocalFile(value) {
        this.config.USE_LOCAL_FILE = value;
        console.log(`⚙️ CONFIG: Use Local File ${value ? 'ENABLED' : 'DISABLED'}`);
    }

    setLocalFilePath(path) {
        this.config.LOCAL_FILE_PATH = path;
        console.log(`⚙️ CONFIG: Local File Path = ${path}`);
    }

    // Processed files management
    async loadProcessedFiles() {
        try {
            if (!this.store) {
                const { getStore } = require('./main-process-handlers');
                this.store = await getStore();
            }
            
            const stored = this.store.get('unifiedProcessedFiles', []);
            this.processedFiles = new Set(stored);
            console.log(`💾 STORAGE: Loaded ${this.processedFiles.size} previously processed files`);
            
            // Log some examples for debugging
            if (this.processedFiles.size > 0) {
                const examples = Array.from(this.processedFiles).slice(0, 3);
                console.log(`💾 STORAGE: Examples: ${examples.join(', ')}${this.processedFiles.size > 3 ? '...' : ''}`);
            }
        } catch (error) {
            console.error('❌ STORAGE: Error loading processed files:', error);
            this.processedFiles = new Set();
        }
    }

    async saveProcessedFiles() {
        try {
            if (!this.store) {
                const { getStore } = require('./main-process-handlers');
                this.store = await getStore();
            }
            
            const fileArray = Array.from(this.processedFiles);
            this.store.set('unifiedProcessedFiles', fileArray);
            console.log(`💾 STORAGE: Saved ${fileArray.length} processed files to unified storage`);
            
            // Log some examples for debugging
            if (fileArray.length > 0) {
                const examples = fileArray.slice(0, 3);
                console.log(`💾 STORAGE: Recent files: ${examples.join(', ')}${fileArray.length > 3 ? '...' : ''}`);
            }
        } catch (error) {
            console.error('❌ STORAGE: Error saving processed files:', error);
        }
    }

    // Processed files operations
    hasProcessedFile(fileName) {
        const hasFile = this.processedFiles.has(fileName);
        if (hasFile) {
            console.log(`🔍 CHECK: ${fileName} - ALREADY PROCESSED (skipping)`);
        } else {
            console.log(`🔍 CHECK: ${fileName} - NEW FILE (will process)`);
        }
        return hasFile;
    }

    addProcessedFile(fileName) {
        if (!fileName || typeof fileName !== 'string') {
            console.error('❌ PROCESSED: Invalid fileName provided:', fileName);
            return false;
        }
        
        if (this.processedFiles.has(fileName)) {
            console.log(`⚠️ PROCESSED: ${fileName} already in processed list`);
            return false;
        }
        
        this.processedFiles.add(fileName);
        console.log(`✅ PROCESSED: Added ${fileName} to processed files list (total: ${this.processedFiles.size})`);
        return true;
    }

    removeProcessedFile(fileName) {
        const wasRemoved = this.processedFiles.delete(fileName);
        if (wasRemoved) {
            console.log(`🗑️ PROCESSED: Removed ${fileName} from processed files list (total: ${this.processedFiles.size})`);
        } else {
            console.log(`⚠️ PROCESSED: ${fileName} was not in processed files list`);
        }
        return wasRemoved;
    }

    async clearProcessedFiles() {
        const previousCount = this.processedFiles.size;
        this.processedFiles.clear();
        await this.saveProcessedFiles();
        console.log(`🗑️ STORAGE: Cleared all processed files (removed ${previousCount} files)`);
    }

    getProcessedFilesArray() {
        return Array.from(this.processedFiles);
    }

    getProcessedFilesCount() {
        return this.processedFiles.size;
    }

    // Get full config object for debugging
    getConfig() {
        return {
            ...this.config,
            processedFilesCount: this.processedFiles.size,
            processedFilesExamples: Array.from(this.processedFiles).slice(0, 5)
        };
    }

    // Debug methods for troubleshooting
    debugProcessedFiles() {
        console.log('🔍 DEBUG: Processed Files List:');
        console.log(`📊 Total: ${this.processedFiles.size} files`);
        
        if (this.processedFiles.size === 0) {
            console.log('📭 No processed files');
            return;
        }
        
        const fileArray = Array.from(this.processedFiles);
        fileArray.forEach((fileName, index) => {
            console.log(`  ${index + 1}. ${fileName}`);
        });
    }

    // Validate processed file entry
    validateProcessedFile(fileName) {
        if (!fileName || typeof fileName !== 'string') {
            console.error('❌ VALIDATION: Invalid fileName - must be non-empty string');
            return false;
        }
        
        if (fileName.trim() === '') {
            console.error('❌ VALIDATION: Empty fileName after trim');
            return false;
        }
        
        if (fileName.length > 255) {
            console.error('❌ VALIDATION: fileName too long (>255 chars)');
            return false;
        }
        
        return true;
    }

    // Safe add with validation
    safeAddProcessedFile(fileName) {
        if (!this.validateProcessedFile(fileName)) {
            return false;
        }
        
        return this.addProcessedFile(fileName.trim());
    }

    // Check if file should be processed (combines multiple checks)
    shouldProcessFile(fileName) {
        // Basic validation
        if (!this.validateProcessedFile(fileName)) {
            console.log(`⏭️ SHOULD-PROCESS: ${fileName} - INVALID (will skip)`);
            return { shouldProcess: false, reason: 'invalid-filename' };
        }
        
        // Check if skip processed files is enabled
        if (!this.skipProcessedFiles) {
            console.log(`🔄 SHOULD-PROCESS: ${fileName} - WILL PROCESS (skip processed disabled)`);
            return { shouldProcess: true, reason: 'skip-disabled' };
        }
        
        // Check if already processed
        if (this.hasProcessedFile(fileName)) {
            console.log(`⏭️ SHOULD-PROCESS: ${fileName} - SKIP (already processed)`);
            return { shouldProcess: false, reason: 'already-processed' };
        }
        
        console.log(`✅ SHOULD-PROCESS: ${fileName} - WILL PROCESS (new file)`);
        return { shouldProcess: true, reason: 'new-file' };
    }
}

// Create singleton instance
const configManager = new ConfigManager();

module.exports = configManager;