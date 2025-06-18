// channel-selector.js
// Simple channel selection - follows your separation pattern

document.addEventListener('DOMContentLoaded', function() {
    const channelSelect = document.getElementById('channelSelect');
    const statusElement = document.getElementById('channelSelectStatus');
    
    let isLoading = false;
    let optionsLoaded = false;

    if (!channelSelect) {
        console.error('❌ Channel select element not found');
        return;
    }

    // Load options when dropdown is clicked
    channelSelect.addEventListener('click', async () => {
        if (!optionsLoaded && !isLoading) {
            await loadChannelOptions();
        }
    });

    // Handle selection
    channelSelect.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        if (selectedValue) {
            handleChannelSelection(selectedValue);
        }
    });

    async function loadChannelOptions() {
        if (isLoading) return;

        try {
            isLoading = true;
            channelSelect.disabled = true;
            showStatus('Loading channels...', 'loading');

            console.log('🔄 Loading channel options...');

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
            channelSelect.innerHTML = '<option value="" disabled selected>Choose a channel...</option>';
            
            if (channelList.length === 0) {
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = 'No channels available';
                emptyOption.disabled = true;
                channelSelect.appendChild(emptyOption);
            } else {
                channelList.forEach(channel => {
                    const option = document.createElement('option');
                    option.value = channel.id;
                    option.textContent = channel.name;
                    channelSelect.appendChild(option);
                });
            }

            optionsLoaded = true;
            hideStatus();
            console.log(`✅ Loaded ${channelList.length} channels`);

        } catch (error) {
            console.error('❌ Error loading channels:', error);
            showStatus('Failed to load channels', 'error');
        } finally {
            isLoading = false;
            channelSelect.disabled = false;
        }
    }

    function handleChannelSelection(channelId) {
        console.log(`🎯 Channel selected: ${channelId}`);
        
        // Store globally
        window.selectedDynamicValue = channelId;
        console.log(`🌐 Set global variable 'selectedDynamicValue' = ${channelId}`);

        // Show notification
        if (window.credentialsHandler) {
            const selectedOption = channelSelect.options[channelSelect.selectedIndex];
            window.credentialsHandler.showNotification(
                `Selected channel: ${selectedOption.textContent}`, 
                'success'
            );
        }
    }

    function showStatus(message, type = 'info') {
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `form-help-text ${type}`;
            statusElement.style.display = 'block';
        }
    }

    function hideStatus() {
        if (statusElement) {
            statusElement.style.display = 'none';
        }
    }

    console.log('✅ Channel selector initialized');
});