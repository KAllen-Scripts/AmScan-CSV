// dynamic-dropdown.js
// Enhanced with auto-save functionality - saves selection immediately when channel is chosen

document.addEventListener('DOMContentLoaded', function() {
    const channelSelect = document.getElementById('channelSelect');
    const statusElement = document.getElementById('channelSelectStatus');
    
    let isLoading = false;
    let optionsLoaded = false;

    if (!channelSelect) {
        console.error('❌ Channel select element not found');
        return;
    }

    // Initialize - load saved selection on startup
    loadSavedSelection();

    // Load options when dropdown is clicked
    channelSelect.addEventListener('click', async () => {
        if (!optionsLoaded && !isLoading) {
            await loadChannelOptions();
        }
    });

    // Handle selection - SAVE IMMEDIATELY
    channelSelect.addEventListener('change', async (e) => {
        const selectedValue = e.target.value;
        if (selectedValue) {
            await handleChannelSelection(selectedValue);
        }
    });

    /**
     * Load saved channel selection on startup
     */
    async function loadSavedSelection() {
        try {
            console.log('🔄 Loading saved channel selection...');
            
            let savedChannelId = null;
            
            // Try to load from Electron store first
            if (window.electronAPI && window.electronAPI.loadConfig) {
                const config = await window.electronAPI.loadConfig();
                savedChannelId = config?.selectedChannelId;
            } else {
                // Fallback to localStorage
                savedChannelId = localStorage.getItem('selectedChannelId');
            }
            
            if (savedChannelId) {
                console.log(`✅ Found saved channel selection: ${savedChannelId}`);
                
                // Set the global variable immediately
                window.selectedDynamicValue = savedChannelId;
                
                // If options aren't loaded yet, create a placeholder option
                if (!optionsLoaded) {
                    const placeholderOption = document.createElement('option');
                    placeholderOption.value = savedChannelId;
                    placeholderOption.textContent = `Channel ID: ${savedChannelId}`;
                    placeholderOption.selected = true;
                    
                    // Clear and add placeholder
                    channelSelect.innerHTML = '';
                    channelSelect.appendChild(placeholderOption);
                    
                    showStatus('Loading saved selection...', 'loading');
                    
                    // Load full options in background
                    setTimeout(async () => {
                        await loadChannelOptions(savedChannelId);
                    }, 1000);
                } else {
                    // Options already loaded, just select the saved one
                    channelSelect.value = savedChannelId;
                }
                
                console.log(`🌐 Global variable 'selectedDynamicValue' set to saved value: ${savedChannelId}`);
                
            } else {
                console.log('📭 No saved channel selection found');
            }
        } catch (error) {
            console.error('❌ Error loading saved selection:', error);
        }
    }

    /**
     * Save channel selection immediately
     */
    async function saveChannelSelection(channelId, channelName) {
        try {
            console.log(`💾 Saving channel selection: ${channelId} (${channelName})`);
            
            if (window.electronAPI && window.electronAPI.saveConfig) {
                // Load current config and update with channel selection
                const currentConfig = await window.electronAPI.loadConfig() || {};
                currentConfig.selectedChannelId = channelId;
                currentConfig.selectedChannelName = channelName;
                currentConfig.lastChannelSelectionTime = new Date().toISOString();
                
                await window.electronAPI.saveConfig(currentConfig);
                console.log(`✅ Channel selection saved to Electron store`);
            } else {
                // Fallback to localStorage
                localStorage.setItem('selectedChannelId', channelId);
                localStorage.setItem('selectedChannelName', channelName);
                localStorage.setItem('lastChannelSelectionTime', new Date().toISOString());
                console.log(`✅ Channel selection saved to localStorage`);
            }
            
            return { success: true };
        } catch (error) {
            console.error('❌ Error saving channel selection:', error);
            return { success: false, error: error.message };
        }
    }

    async function loadChannelOptions(preselectedChannelId = null) {
        if (isLoading) return;

        try {
            isLoading = true;
            channelSelect.disabled = true;
            showStatus('Loading channels...', 'loading');

            console.log('🔄 Loading channel options...');

            // Check if API is available
            if (!window.stoklyAPI || !window.stoklyAPI.requester) {
                throw new Error('Stokly API not available. Please ensure API credentials are configured.');
            }

            let channelList = [];
            
            await window.stoklyAPI.requester('GET', 'https://api.stok.ly/v0/channels?size=1000').then(r => {
                for (const channel of r.data) {
                    channelList.push({
                        name: channel.name, 
                        id: channel.channelId
                    });
                }
            });

            // Clear existing options and add new ones
            channelSelect.innerHTML = '<option value="" disabled>Choose a channel...</option>';
            
            if (channelList.length === 0) {
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = 'No channels available';
                emptyOption.disabled = true;
                channelSelect.appendChild(emptyOption);
                
                showStatus('No channels available', 'error');
            } else {
                // Sort channels alphabetically for better UX
                channelList.sort((a, b) => a.name.localeCompare(b.name));
                
                let foundPreselected = false;
                
                channelList.forEach(channel => {
                    const option = document.createElement('option');
                    option.value = channel.id;
                    option.textContent = channel.name;
                    
                    // Select if this matches the preselected or saved channel
                    if (preselectedChannelId && channel.id === preselectedChannelId) {
                        option.selected = true;
                        foundPreselected = true;
                        console.log(`🎯 Reselected saved channel: ${channel.name} (${channel.id})`);
                        showStatus(`Loaded: ${channel.name}`, 'success');
                    }
                    
                    channelSelect.appendChild(option);
                });
                
                // If we had a preselected channel but didn't find it in the list
                if (preselectedChannelId && !foundPreselected) {
                    console.warn(`⚠️ Previously selected channel ${preselectedChannelId} not found in current list`);
                    showStatus('Previously selected channel no longer available', 'error');
                    
                    // Clear the saved selection since it's no longer valid
                    window.selectedDynamicValue = null;
                    await clearSavedSelection();
                }
                
                if (!preselectedChannelId) {
                    hideStatus();
                }
            }

            optionsLoaded = true;
            console.log(`✅ Loaded ${channelList.length} channels`);

        } catch (error) {
            console.error('❌ Error loading channels:', error);
            showStatus('Failed to load channels - check API credentials', 'error');
            
            // Show error in UI
            channelSelect.innerHTML = '<option value="" disabled selected>Failed to load channels</option>';
        } finally {
            isLoading = false;
            channelSelect.disabled = false;
        }
    }

    async function handleChannelSelection(channelId) {
        console.log(`🎯 Channel selected: ${channelId}`);
        
        // Get the channel name for better logging/saving
        const selectedOption = channelSelect.options[channelSelect.selectedIndex];
        const channelName = selectedOption ? selectedOption.textContent : 'Unknown';
        
        // Store globally IMMEDIATELY
        window.selectedDynamicValue = channelId;
        console.log(`🌐 Set global variable 'selectedDynamicValue' = ${channelId}`);

        // SAVE IMMEDIATELY - this was missing!
        const saveResult = await saveChannelSelection(channelId, channelName);
        
        if (saveResult.success) {
            console.log(`💾 Channel selection saved successfully`);
            
            // Show success notification
            if (window.credentialsHandler) {
                window.credentialsHandler.showNotification(
                    `Channel saved: ${channelName}`, 
                    'success'
                );
            }
            
            // Update status to show saved selection
            showStatus(`Saved: ${channelName}`, 'success');
            
            // Auto-hide status after 3 seconds
            setTimeout(() => {
                hideStatus();
            }, 3000);
            
        } else {
            console.error(`❌ Failed to save channel selection:`, saveResult.error);
            
            if (window.credentialsHandler) {
                window.credentialsHandler.showNotification(
                    `Error saving channel: ${saveResult.error}`, 
                    'error'
                );
            }
            
            showStatus(`Error saving selection`, 'error');
        }
    }

    /**
     * Clear saved selection (when channel is no longer available)
     */
    async function clearSavedSelection() {
        try {
            if (window.electronAPI && window.electronAPI.saveConfig) {
                const currentConfig = await window.electronAPI.loadConfig() || {};
                delete currentConfig.selectedChannelId;
                delete currentConfig.selectedChannelName;
                delete currentConfig.lastChannelSelectionTime;
                await window.electronAPI.saveConfig(currentConfig);
            } else {
                localStorage.removeItem('selectedChannelId');
                localStorage.removeItem('selectedChannelName');
                localStorage.removeItem('lastChannelSelectionTime');
            }
            console.log('🗑️ Cleared invalid saved selection');
        } catch (error) {
            console.error('❌ Error clearing saved selection:', error);
        }
    }

    function showStatus(message, type = 'info') {
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `form-help-text ${type}`;
            statusElement.style.display = 'block';
        }
        console.log(`📢 STATUS: ${message} (${type})`);
    }

    function hideStatus() {
        if (statusElement) {
            statusElement.style.display = 'none';
        }
    }

    console.log('✅ Channel selector initialized with auto-save');
});