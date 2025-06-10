const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Configuration management
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    loadConfig: () => ipcRenderer.invoke('load-config'),
    clearConfig: () => ipcRenderer.invoke('clear-config'),
    
    // File operations
    writeFile: (filePath, content, options) => ipcRenderer.invoke('write-file', filePath, content, options),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    
    // App information
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    
    // Dialog
    showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
    
    // Credentials management - Updated to support both API and FTP
    saveCredentials: (credentialsType, credentials) => ipcRenderer.invoke('save-credentials', credentialsType, credentials),
    loadCredentials: (credentialsType) => ipcRenderer.invoke('load-credentials', credentialsType),
    clearCredentials: (credentialsType) => ipcRenderer.invoke('clear-credentials', credentialsType),
    
    // Window management
    focusWindow: () => ipcRenderer.invoke('focus-window'),
    
    // File processing - NEW: Send files to renderer and handle results
    processFile: (fileName, fileContent) => ipcRenderer.invoke('process-file', fileName, fileContent),
    notifyProcessingComplete: (fileName, result) => ipcRenderer.invoke('notify-processing-complete', fileName, result),
    
    // Listen for file processing requests from main process
    onProcessFile: (callback) => ipcRenderer.on('process-file', (event, fileName, fileContent) => {
        callback(fileName, fileContent);
    }),
    
    // Sync control methods
    startAutoSync: (minutes) => ipcRenderer.invoke('start-auto-sync', minutes),
    stopAutoSync: () => ipcRenderer.invoke('stop-auto-sync'),
    manualSync: () => ipcRenderer.invoke('manual-sync'),
    getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
    
    // NEW: Change sync interval without interruption
    changeAutoSyncInterval: (minutes) => ipcRenderer.invoke('change-auto-sync-interval', minutes),
    
    // Remove listeners (cleanup)
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});