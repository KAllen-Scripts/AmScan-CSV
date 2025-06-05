const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    loadConfig: () => ipcRenderer.invoke('load-config'),
    clearConfig: () => ipcRenderer.invoke('clear-config'),
    
    // File operations
    writeFile: (filePath, content, options) => ipcRenderer.invoke('write-file', filePath, content, options),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    
    // Enhanced credentials management (supports both API and FTP)
    saveCredentials: (credentialType, credentials) => ipcRenderer.invoke('save-credentials', credentialType, credentials),
    loadCredentials: (credentialType) => ipcRenderer.invoke('load-credentials', credentialType),
    clearCredentials: (credentialType) => ipcRenderer.invoke('clear-credentials', credentialType),
    
    // Window focus management (for fixing Electron focus issues)
    focusWindow: () => ipcRenderer.invoke('focus-window'),
    
    // SFTP Sync Operations
    testSync: (config) => ipcRenderer.invoke('test-sync', config),
    startAutoSync: (config) => ipcRenderer.invoke('start-auto-sync', config),
    stopAutoSync: () => ipcRenderer.invoke('stop-auto-sync'),
    getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
    clearProcessedFiles: () => ipcRenderer.invoke('clear-processed-files'),
    getProcessedFiles: () => ipcRenderer.invoke('get-processed-files'),
    
    // NEW: File deletion and cleanup operations
    deleteRemoteFile: (config) => ipcRenderer.invoke('delete-remote-file', config),
    cleanupOrphanedFiles: (config) => ipcRenderer.invoke('cleanup-orphaned-files', config),
    
    // Optional: Add more utility functions
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options)
});