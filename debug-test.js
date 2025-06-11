// Complete Debug Test Script - Full diagnostic and testing suite
// Add this to your HTML to test all functionality

console.log('🔧 DEBUG TEST: Complete script loaded');

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 DEBUG TEST: DOM loaded, starting comprehensive tests...');
    
    // Wait a bit for all modules to load
    setTimeout(() => {
        runAllTests();
        addDebugButtons();
    }, 2000);
});

function runAllTests() {
    console.log('\n🔧 === STARTING COMPREHENSIVE DEBUG TESTS ===');
    
    // Test 1: DOM Elements
    testDOMElements();
    
    // Test 2: Electron API
    testElectronAPI();
    
    // Test 3: Module Availability
    testModuleAvailability();
    
    // Test 4: Credentials System
    testCredentialsSystem();
    
    // Test 5: Processing System
    testProcessingSystem();
    
    // Test 6: Storage System
    testStorageSystem();
    
    console.log('🔧 === DEBUG TESTS COMPLETED ===\n');
}

function testDOMElements() {
    console.log('\n📋 TEST 1: DOM Elements');
    
    const elements = {
        'processingResults': document.getElementById('processingResults'),
        'taskStatus': document.getElementById('taskStatus'),
        'taskStats': document.getElementById('taskStats'),
        'timerCycle': document.getElementById('timerCycle'),
        'apiCredentialsBtn': document.getElementById('apiCredentialsBtn'),
        'ftpCredentialsBtn': document.getElementById('ftpCredentialsBtn'),
        'processingsidebar': document.getElementById('processingsidebar'),
        'resultsList': document.getElementById('resultsList'),
        'container': document.querySelector('.container')
    };
    
    Object.entries(elements).forEach(([name, element]) => {
        console.log(`  ${element ? '✅' : '❌'} ${name}: ${!!element}`);
    });
}

function testElectronAPI() {
    console.log('\n🔌 TEST 2: Electron API');
    
    if (!window.electronAPI) {
        console.log('  ❌ electronAPI not available');
        return;
    }
    
    console.log('  ✅ electronAPI available');
    
    const methods = [
        'saveConfig', 'loadConfig', 'clearConfig',
        'saveCredentials', 'loadCredentials', 'clearCredentials',
        'startAutoSync', 'stopAutoSync', 'manualSync', 'getSyncStatus',
        'changeAutoSyncInterval', 'clearProcessedFiles',
        'processFile', 'notifyProcessingComplete', 'onProcessFile',
        'focusWindow', 'getAppVersion'
    ];
    
    methods.forEach(method => {
        const exists = typeof window.electronAPI[method] === 'function';
        console.log(`    ${exists ? '✅' : '❌'} ${method}: ${exists}`);
    });
}

function testModuleAvailability() {
    console.log('\n📦 TEST 3: Module Availability');
    
    const modules = {
        'amscanOrderProcessor': window.amscanOrderProcessor,
        'processingResults': window.processingResults,
        'credentialsHandler': window.credentialsHandler,
        'formHandler': window.formHandler,
        'sidebarManager': window.sidebarManager,
        'stoklyAPI': window.stoklyAPI,
        'appCredentials': window.appCredentials
    };
    
    Object.entries(modules).forEach(([name, module]) => {
        console.log(`  ${module ? '✅' : '❌'} ${name}: ${!!module}`);
        
        if (name === 'appCredentials' && module) {
            console.log(`    - isLoaded: ${module.isLoaded}`);
            console.log(`    - hasAccountKey: ${!!module.accountKey}`);
            console.log(`    - hasClientId: ${!!module.clientId}`);
            console.log(`    - hasSecretKey: ${!!module.secretKey}`);
        }
    });
}

async function testCredentialsSystem() {
    console.log('\n🔐 TEST 4: Credentials System');
    
    if (!window.credentialsHandler) {
        console.log('  ❌ credentialsHandler not available');
        return;
    }
    
    try {
        // Test API credentials
        const apiCreds = await window.credentialsHandler.loadApiCredentials();
        console.log(`  ${apiCreds ? '✅' : '❌'} API Credentials: ${!!apiCreds}`);
        
        // Test FTP credentials
        const ftpCreds = await window.credentialsHandler.loadFtpCredentials();
        console.log(`  ${ftpCreds ? '✅' : '❌'} FTP Credentials: ${!!ftpCreds}`);
        
    } catch (error) {
        console.log(`  ❌ Credentials test error: ${error.message}`);
    }
}

function testProcessingSystem() {
    console.log('\n⚙️ TEST 5: Processing System');
    
    if (!window.amscanOrderProcessor) {
        console.log('  ❌ amscanOrderProcessor not available');
        return;
    }
    
    console.log('  ✅ Order processor available');
    
    // Test processing methods
    const methods = ['processAmscanFile', 'parseAmscanOrderFile', 'createOrderObject'];
    methods.forEach(method => {
        const exists = typeof window.amscanOrderProcessor[method] === 'function';
        console.log(`    ${exists ? '✅' : '❌'} ${method}: ${exists}`);
    });
    
    // Test processing results manager
    if (window.processingResults) {
        console.log('  ✅ Processing results manager available');
        console.log(`    - Current results count: ${window.processingResults.getResultsCount()}`);
    } else {
        console.log('  ❌ Processing results manager not available');
    }
}

async function testStorageSystem() {
    console.log('\n💾 TEST 6: Storage System');
    
    if (!window.electronAPI) {
        console.log('  ❌ electronAPI not available for storage test');
        return;
    }
    
    try {
        // Test config storage
        const testConfig = { test: 'debug-test-' + Date.now() };
        await window.electronAPI.saveConfig(testConfig);
        const loadedConfig = await window.electronAPI.loadConfig();
        
        if (loadedConfig && loadedConfig.test === testConfig.test) {
            console.log('  ✅ Config storage working');
        } else {
            console.log('  ❌ Config storage failed');
        }
        
        // Test sync status
        const syncStatus = await window.electronAPI.getSyncStatus();
        console.log(`  ${syncStatus ? '✅' : '❌'} Sync status: ${!!syncStatus}`);
        if (syncStatus) {
            console.log(`    - Is running: ${syncStatus.status?.isRunning}`);
            console.log(`    - Auto sync enabled: ${syncStatus.status?.autoSyncEnabled}`);
            console.log(`    - Processed files count: ${syncStatus.status?.processedFilesCount}`);
        }
        
    } catch (error) {
        console.log(`  ❌ Storage test error: ${error.message}`);
    }
}

function addDebugButtons() {
    console.log('\n🔧 Adding debug buttons to UI...');
    
    const container = document.querySelector('.container');
    if (!container) {
        console.log('❌ Container not found, cannot add debug buttons');
        return;
    }
    
    // Create debug panel
    const debugPanel = document.createElement('div');
    debugPanel.style.cssText = `
        background: #f0f0f0; 
        border: 2px solid #ccc; 
        border-radius: 8px; 
        padding: 15px; 
        margin: 20px 0; 
        position: relative;
    `;
    
    const debugTitle = document.createElement('h3');
    debugTitle.textContent = '🔧 Debug Panel';
    debugTitle.style.cssText = 'margin: 0 0 15px 0; color: #333;';
    debugPanel.appendChild(debugTitle);
    
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px;';
    
    // Debug buttons configuration
    const buttons = [
        {
            text: '🔧 Manual Test Processing',
            color: 'orange',
            action: testManualProcessing
        },
        {
            text: '🗑️ Clear Processed Files',
            color: 'red',
            action: clearProcessedFiles
        },
        {
            text: '📊 Show Processing Stats',
            color: 'blue',
            action: showProcessingStats
        },
        {
            text: '🔄 Test Sync Status',
            color: 'green',
            action: testSyncStatus
        },
        {
            text: '🔐 Test Credentials',
            color: 'purple',
            action: testCredentials
        },
        {
            text: '💾 Test Storage',
            color: 'teal',
            action: testStorage
        },
        {
            text: '🚀 Force Focus Window',
            color: 'navy',
            action: forceFocusWindow
        },
        {
            text: '📋 Export Debug Info',
            color: 'brown',
            action: exportDebugInfo
        }
    ];
    
    // Create buttons
    buttons.forEach(buttonConfig => {
        const button = document.createElement('button');
        button.textContent = buttonConfig.text;
        button.style.cssText = `
            background: ${buttonConfig.color}; 
            color: white; 
            padding: 8px 12px; 
            border: none; 
            border-radius: 4px; 
            cursor: pointer; 
            font-size: 12px;
            white-space: nowrap;
        `;
        button.addEventListener('click', buttonConfig.action);
        buttonContainer.appendChild(button);
    });
    
    debugPanel.appendChild(buttonContainer);
    container.appendChild(debugPanel);
    
    console.log('✅ Debug panel added successfully');
}

// Debug button actions
function testManualProcessing() {
    console.log('🔧 Manual processing test started...');
    
    if (!window.amscanOrderProcessor) {
        alert('❌ Order processor not available');
        return;
    }
    
    const testContent = `soheader~WS0000200024~P1486~~0.00~105.38~20250407~20250407~~~PARTY STORE GIRL LTD~Test Store~123 Test St~Test City~Test County PR5 0RA~UNITED KINGDOM~123~~~~~~~~~~~~~~~~~~~~~~~~~~~
sodetail~TESTSKU001~Test Product Description~1~10.50~0.00~~Test~10.50~~~~~EA~~~~~~~~~~~~~~~~~~~~
sodetail~TESTSKU002~Another Test Product~2~5.25~0.00~~Test~5.25~~~~~EA~~~~~~~~~~~~~~~~~~~~`;
    
    window.amscanOrderProcessor.processAmscanFile('manual-test.txt', testContent);
    
    // Update UI
    const processingResults = document.getElementById('processingResults');
    if (processingResults) {
        processingResults.innerHTML = '<p>🔧 Manual test file processing initiated...</p>';
    }
}

async function clearProcessedFiles() {
    if (!confirm('Clear all processed files? This will cause all files to be reprocessed on next sync.')) {
        return;
    }
    
    try {
        console.log('🗑️ Clearing processed files...');
        const result = await window.electronAPI.clearProcessedFiles();
        
        if (result.success) {
            alert('✅ Processed files cleared successfully!');
            console.log('✅ Processed files cleared');
        } else {
            alert('❌ Error: ' + result.error);
            console.log('❌ Clear error:', result.error);
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
        console.log('❌ Clear exception:', error);
    }
}

function showProcessingStats() {
    console.log('📊 Processing stats requested...');
    
    if (!window.processingResults) {
        alert('❌ Processing results manager not available');
        return;
    }
    
    const stats = window.processingResults.getStatistics();
    const message = `
📊 Processing Statistics:
• Total files: ${stats.total}
• Successful: ${stats.successful}
• Success with warnings: ${stats.successWithWarnings}
• Failed: ${stats.failed}
• Skipped: ${stats.skipped}
• Success rate: ${stats.successRate}%
• Clean success rate: ${stats.cleanSuccessRate}%
    `.trim();
    
    alert(message);
    console.log('📊 Stats:', stats);
}

async function testSyncStatus() {
    console.log('🔄 Testing sync status...');
    
    try {
        const result = await window.electronAPI.getSyncStatus();
        const status = result.status;
        
        const message = `
🔄 Sync Status:
• Is running: ${status.isRunning}
• Auto sync enabled: ${status.autoSyncEnabled}
• Auto sync minutes: ${status.autoSyncMinutes}
• Processed files count: ${status.processedFilesCount}
• Pending interval change: ${status.pendingIntervalChange}
• Pending immediate run: ${status.pendingImmediateRun}
        `.trim();
        
        alert(message);
        console.log('🔄 Sync status:', status);
    } catch (error) {
        alert('❌ Error getting sync status: ' + error.message);
        console.log('❌ Sync status error:', error);
    }
}

async function testCredentials() {
    console.log('🔐 Testing credentials...');
    
    if (!window.credentialsHandler) {
        alert('❌ Credentials handler not available');
        return;
    }
    
    try {
        const apiCreds = await window.credentialsHandler.loadApiCredentials();
        const ftpCreds = await window.credentialsHandler.loadFtpCredentials();
        
        const message = `
🔐 Credentials Status:
• API Credentials: ${apiCreds ? '✅ Found' : '❌ Not found'}
• FTP Credentials: ${ftpCreds ? '✅ Found' : '❌ Not found'}
• Global API loaded: ${window.appCredentials?.isLoaded ? '✅ Yes' : '❌ No'}
        `.trim();
        
        alert(message);
        console.log('🔐 API Credentials:', !!apiCreds);
        console.log('🔐 FTP Credentials:', !!ftpCreds);
        console.log('🔐 Global credentials:', window.appCredentials);
    } catch (error) {
        alert('❌ Error testing credentials: ' + error.message);
        console.log('❌ Credentials error:', error);
    }
}

async function testStorage() {
    console.log('💾 Testing storage...');
    
    try {
        // Test config save/load
        const testData = {
            debugTest: true,
            timestamp: new Date().toISOString(),
            random: Math.random()
        };
        
        await window.electronAPI.saveConfig(testData);
        const loaded = await window.electronAPI.loadConfig();
        
        const success = loaded && loaded.random === testData.random;
        
        alert(`💾 Storage Test: ${success ? '✅ Working' : '❌ Failed'}`);
        console.log('💾 Storage test result:', success);
        console.log('💾 Test data:', testData);
        console.log('💾 Loaded data:', loaded);
    } catch (error) {
        alert('❌ Storage test error: ' + error.message);
        console.log('❌ Storage error:', error);
    }
}

async function forceFocusWindow() {
    console.log('🚀 Forcing window focus...');
    
    try {
        const result = await window.electronAPI.focusWindow();
        console.log('🚀 Focus result:', result);
        
        if (result.success) {
            alert('✅ Window focus attempted');
        } else {
            alert('❌ Focus failed: ' + result.error);
        }
    } catch (error) {
        alert('❌ Focus error: ' + error.message);
        console.log('❌ Focus error:', error);
    }
}

async function exportDebugInfo() {
    console.log('📋 Exporting debug info...');
    
    const debugInfo = {
        timestamp: new Date().toISOString(),
        electronAPI: !!window.electronAPI,
        electronAPIMethods: window.electronAPI ? Object.keys(window.electronAPI) : [],
        modules: {
            amscanOrderProcessor: !!window.amscanOrderProcessor,
            processingResults: !!window.processingResults,
            credentialsHandler: !!window.credentialsHandler,
            formHandler: !!window.formHandler,
            sidebarManager: !!window.sidebarManager,
            stoklyAPI: !!window.stoklyAPI,
            appCredentials: !!window.appCredentials
        },
        domElements: {
            processingResults: !!document.getElementById('processingResults'),
            taskStatus: !!document.getElementById('taskStatus'),
            timerCycle: !!document.getElementById('timerCycle'),
            container: !!document.querySelector('.container')
        }
    };
    
    // Try to get additional info
    try {
        if (window.electronAPI) {
            const syncStatus = await window.electronAPI.getSyncStatus();
            debugInfo.syncStatus = syncStatus;
            
            const config = await window.electronAPI.loadConfig();
            debugInfo.config = config;
        }
        
        if (window.processingResults) {
            debugInfo.processingStats = window.processingResults.getStatistics();
        }
        
        if (window.appCredentials) {
            debugInfo.globalCredentials = {
                isLoaded: window.appCredentials.isLoaded,
                hasAccountKey: !!window.appCredentials.accountKey,
                hasClientId: !!window.appCredentials.clientId,
                hasSecretKey: !!window.appCredentials.secretKey
            };
        }
    } catch (error) {
        debugInfo.exportError = error.message;
    }
    
    // Create download
    const dataStr = JSON.stringify(debugInfo, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `debug-info-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    
    console.log('📋 Debug info exported:', debugInfo);
    alert('✅ Debug info exported to file');
}

// Auto-run tests periodically
setInterval(() => {
    if (window.debugAutoTest) {
        console.log('🔧 Auto-running basic tests...');
        testModuleAvailability();
    }
}, 30000); // Every 30 seconds

// Global flag to enable/disable auto-testing
window.debugAutoTest = false;

console.log('🔧 Complete debug script ready! Use window.debugAutoTest = true to enable auto-testing.');