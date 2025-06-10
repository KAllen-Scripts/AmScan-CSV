// Fixed Timer Manager - Non-interrupting sync interval control

document.addEventListener('DOMContentLoaded', () => {
    const timerSelect = document.getElementById('timerCycle');
    const taskStatus = document.getElementById('taskStatus');
    const taskStats = document.getElementById('taskStats');
    
    let isChangingInterval = false;
    let hasAutoStarted = false;
    
    if (timerSelect) {
        timerSelect.addEventListener('change', async (e) => {
            const minutes = parseFloat(e.target.value);
            await handleIntervalChange(minutes);
        });
        
        // Load saved timer setting on startup
        loadTimerSetting();
        
        // Auto-start with saved/default value on page load (with delay for initialization)
        setTimeout(async () => {
            if (hasAutoStarted) {
                console.log('🚫 Auto-start already completed, skipping...');
                return;
            }
            
            if (timerSelect.value && window.electronAPI) {
                hasAutoStarted = true;
                console.log(`🚀 Auto-starting sync with loaded interval: ${timerSelect.value} minutes`);
                
                try {
                    // Get current sync status first
                    const status = await window.electronAPI.getSyncStatus();
                    console.log('Current sync status:', status);
                    
                    // Only start if not already running, OR if running with wrong interval
                    const currentInterval = status.status?.autoSyncMinutes;
                    const desiredInterval = parseFloat(timerSelect.value);
                    
                    if (!status.status?.autoSyncEnabled) {
                        console.log('🚀 No auto-sync running, starting with saved interval');
                        // Manually call the change function instead of triggering event
                        await handleIntervalChange(desiredInterval);
                    } else if (currentInterval !== desiredInterval) {
                        console.log(`🔄 Auto-sync running with wrong interval (${currentInterval}min vs ${desiredInterval}min), correcting...`);
                        await handleIntervalChange(desiredInterval);
                    } else {
                        console.log(`✅ Auto-sync already running with correct interval: ${currentInterval} minutes`);
                        updateTaskStatus('🔄 Active', `Every ${currentInterval} minute${currentInterval === 1 ? '' : 's'}`);
                    }
                } catch (error) {
                    console.error('Error checking sync status:', error);
                    // Try to start anyway with saved interval
                    await handleIntervalChange(parseFloat(timerSelect.value));
                }
            }
        }, 4000); // Longer delay to ensure everything is ready
        
        // Periodic status updates
        if (window.electronAPI && window.electronAPI.getSyncStatus) {
            setInterval(async () => {
                try {
                    const status = await window.electronAPI.getSyncStatus();
                    if (status.success && status.status) {
                        const syncStatus = status.status;
                        
                        if (syncStatus.pendingIntervalChange) {
                            // Show pending change with immediate run info
                            if (syncStatus.pendingImmediateRun) {
                                updateTaskStatus('🚀 Ready', `Will run immediately, then every ${syncStatus.pendingIntervalChange} minute${syncStatus.pendingIntervalChange === 1 ? '' : 's'}`);
                            } else {
                                updateTaskStatus('🔄 Active', `Next: ${syncStatus.pendingIntervalChange} minute${syncStatus.pendingIntervalChange === 1 ? '' : 's'}`);
                            }
                        } else if (syncStatus.autoSyncEnabled && syncStatus.autoSyncMinutes) {
                            updateTaskStatus('🔄 Active', `Every ${syncStatus.autoSyncMinutes} minute${syncStatus.autoSyncMinutes === 1 ? '' : 's'}`);
                        } else if (syncStatus.isRunning) {
                            updateTaskStatus('⚡ Running', 'Processing...');
                        } else {
                            updateTaskStatus('⏸️ Idle', '');
                        }
                    }
                } catch (error) {
                    // Silently fail for status updates
                }
            }, 5000); // Update every 5 seconds
        }
    }
    
    // Extract the interval change logic into a separate function
    async function handleIntervalChange(minutes) {
        if (isChangingInterval) {
            console.log('⏳ Interval change already in progress, skipping...');
            return;
        }
        
        if (!minutes || minutes <= 0) {
            console.log('❌ Invalid interval selected');
            return;
        }
        
        // Save the timer setting immediately
        await saveTimerSetting(minutes);
        
        if (window.electronAPI && window.electronAPI.changeAutoSyncInterval) {
            isChangingInterval = true;
            
            try {
                console.log(`🔄 Changing sync interval to ${minutes} minutes (will apply after current sync completes)`);
                updateTaskStatus('⚙️ Updating interval...', `Will switch to ${minutes} minute${minutes === 1 ? '' : 's'} after current cycle`);
                
                // Use the new method that doesn't interrupt current sync
                const result = await window.electronAPI.changeAutoSyncInterval(minutes);
                
                if (result.success) {
                    console.log(`✅ Sync interval will change to ${minutes} minutes after current cycle`);
                    
                    if (result.message.includes('immediately')) {
                        updateTaskStatus('🚀 Ready', `Will run immediately, then every ${minutes} minute${minutes === 1 ? '' : 's'}`);
                        showNotification(`Will run immediately after current sync, then every ${minutes} minute${minutes === 1 ? '' : 's'}`, 'success');
                    } else {
                        updateTaskStatus('🔄 Active', `Next: ${minutes} minute${minutes === 1 ? '' : 's'}`);
                        showNotification(`Sync interval will change to ${minutes} minute${minutes === 1 ? '' : 's'} after current cycle completes`, 'success');
                    }
                } else {
                    console.error(`❌ Failed to change interval:`, result.error);
                    updateTaskStatus('❌ Error', result.error);
                    showNotification(`Failed to change interval: ${result.error}`, 'error');
                }
                
            } catch (error) {
                console.error('❌ Error changing sync interval:', error);
                updateTaskStatus('❌ Error', error.message);
                showNotification(`Error changing interval: ${error.message}`, 'error');
            } finally {
                isChangingInterval = false;
            }
        } else {
            console.error('❌ electronAPI.changeAutoSyncInterval not available, falling back to restart method');
            
            // Fallback to the old method if the new one isn't available
            isChangingInterval = true;
            
            try {
                console.log(`🔄 Changing sync interval to ${minutes} minutes (using restart method)`);
                updateTaskStatus('⚙️ Changing interval...', `Switching to ${minutes} minute${minutes === 1 ? '' : 's'}`);
                
                const stopResult = await window.electronAPI.stopAutoSync();
                await new Promise(resolve => setTimeout(resolve, 1500));
                const startResult = await window.electronAPI.startAutoSync(minutes);
                
                if (startResult.success) {
                    console.log(`✅ Auto-sync restarted with ${minutes} minute interval`);
                    updateTaskStatus('🔄 Active', `Every ${minutes} minute${minutes === 1 ? '' : 's'}`);
                    showNotification(`Sync interval changed to ${minutes} minute${minutes === 1 ? '' : 's'}`, 'success');
                } else {
                    console.error(`❌ Failed to restart auto-sync:`, startResult.error);
                    updateTaskStatus('❌ Error', startResult.error);
                    showNotification(`Failed to change interval: ${startResult.error}`, 'error');
                }
                
            } catch (error) {
                console.error('❌ Error changing sync interval:', error);
                updateTaskStatus('❌ Error', error.message);
                showNotification(`Error changing interval: ${error.message}`, 'error');
            } finally {
                isChangingInterval = false;
            }
        }
    }
    
    // Save timer setting
    async function saveTimerSetting(minutes) {
        try {
            console.log(`💾 Saving timer setting: ${minutes} minutes`);
            
            if (window.electronAPI && window.electronAPI.saveConfig) {
                // Get current config and update just the timer setting
                const currentConfig = await window.electronAPI.loadConfig() || {};
                currentConfig.timerCycle = minutes.toString();
                await window.electronAPI.saveConfig(currentConfig);
                console.log(`✅ Timer setting saved: ${minutes} minutes`);
            } else {
                // Fallback to localStorage
                localStorage.setItem('morrisonsEDI_timerCycle', minutes.toString());
                console.log(`✅ Timer setting saved to localStorage: ${minutes} minutes`);
            }
        } catch (error) {
            console.error('❌ Error saving timer setting:', error);
        }
    }
    
    // Load timer setting
    async function loadTimerSetting() {
        try {
            console.log('📂 Loading saved timer setting...');
            
            let savedMinutes = null;
            
            if (window.electronAPI && window.electronAPI.loadConfig) {
                const config = await window.electronAPI.loadConfig();
                savedMinutes = config?.timerCycle;
            } else {
                // Fallback to localStorage
                savedMinutes = localStorage.getItem('morrisonsEDI_timerCycle');
            }
            
            if (savedMinutes && timerSelect) {
                console.log(`✅ Found saved timer setting: ${savedMinutes} minutes`);
                timerSelect.value = savedMinutes;
                console.log(`🔄 Timer dropdown set to: ${savedMinutes} minutes`);
            } else {
                console.log('📂 No saved timer setting found, using default');
            }
        } catch (error) {
            console.error('❌ Error loading timer setting:', error);
        }
    }
    
    function updateTaskStatus(status, details = '') {
        if (taskStatus) {
            taskStatus.textContent = status;
        }
        if (taskStats) {
            taskStats.textContent = details;
        }
    }
    
    function showNotification(message, type = 'info') {
        const resultElement = document.getElementById('result');
        const resultContentElement = document.getElementById('resultContent');
        
        if (resultContentElement) {
            resultContentElement.innerHTML = `<p class="${type}">${message}</p>`;
        }
        
        if (resultElement) {
            resultElement.style.display = 'block';
            
            // Auto-hide success messages after 3 seconds
            if (type === 'success') {
                setTimeout(() => {
                    resultElement.style.display = 'none';
                }, 3000);
            }
        }
    }
});