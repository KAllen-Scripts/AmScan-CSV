// Browser-compatible version - no require() needed
// Uses Web Crypto API instead of Node.js crypto

// Only initialize if we're in browser context
if (typeof window === 'undefined') {
    // We're in Node.js - don't initialize this file
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {};
    }
} else {
    // Browser context - initialize the API

// Initialize all variables properly
let accessToken = null;
let tokenExpirationTime = null;
let tokens = 10; // Current token count
const maxTokensToHold = 10;
const tokensOverMinute = 120;

// API configuration - these will need to be set
let accountKey = null;
let clientId = null;
let secretKey = null;
let environment = 'api.stok.ly';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Browser-compatible crypto function using Web Crypto API
async function generateSignature(accountKey, clientId, secretKey) {
    try {
        // Convert secret key to ArrayBuffer
        const keyData = new TextEncoder().encode(secretKey);
        const messageData = new TextEncoder().encode(clientId);
        
        // Import the key for HMAC
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        
        // Generate HMAC
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
        
        // Convert to hex string
        const hashArray = Array.from(new Uint8Array(signature));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        return hashHex;
    } catch (error) {
        console.error('Error generating signature:', error);
        throw error;
    }
}

async function getAccessToken() {
    try {
        // Check if we have the required credentials
        if (!accountKey || !clientId || !secretKey) {
            throw new Error('API credentials not configured. Please set accountKey, clientId, and secretKey.');
        }

        const signature = await generateSignature(accountKey, clientId, secretKey);

        const response = await fetch(`https://${environment}/v1/grant`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                accountkey: accountKey,
                clientId: clientId,
                signature: signature
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        accessToken = data.data.authenticationResult.accessToken;

        // Parse the ISO string into a timestamp
        const expiryTime = new Date(data.data.authenticationResult.expiry).getTime();
        tokenExpirationTime = expiryTime;

        console.log('Access token obtained successfully');
    } catch (error) {
        console.error("Error fetching access token:", error);
        throw error;
    }
}

async function ensureToken() {
    // Add null check and proper initialization check
    if (accessToken === null || tokenExpirationTime === null || Date.now() >= tokenExpirationTime) {
        await getAccessToken();
    }
}

async function requester(method, url, data, retry = 20) {
    // Ensure we have a valid token
    await ensureToken();

    // Wait for available tokens
    while (tokens <= 0) {
        await sleep(100);
    }
    tokens -= 1;

    const requestOptions = {
        method: method.toUpperCase(),
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        }
    };

    if (data && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT')) {
        requestOptions.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url, requestOptions);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        if (retry <= 0) {
            console.error(`HTTP error! Status: ${error.message}`);
            throw error;
        } else {
            // Try again with a new token if necessary
            await sleep(200);
            await ensureToken();
            return requester(method, url, data, retry - 1);
        }
    }
}

async function loopThrough(url, size, params, filter, callback) {
    let page = 0;
    let count = 0;
    
    do {
        let res = await requester('get', `${url}?size=${size}&${params}&page=${page}&filter=${filter}`);
        
        let length = 0;
        try {
            length = res.data.length;
        } catch (error) {
            length = 0;
            console.error('Error processing response data:', error);
        }
        
        page += 1;
        for (const item of res.data) {
            await callback(item);
            count += 1;
        }
    } while (length >= size);
    
    return count;
}

async function replenishTokens() {
    do {
        tokens = maxTokensToHold;
        await sleep(60000 / (tokensOverMinute / maxTokensToHold));
    } while (true);
}

// Initialize API configuration
async function initializeStoklyAPI(config) {
    accountKey = config.accountKey;
    clientId = config.clientId;
    secretKey = config.secretKey;
    if (config.environment) {
        environment = config.environment;
    }
    
    console.log('Stokly API initialized');
    
    // Start token replenishment in background
    replenishTokens();
    
    // Get initial access token
    try {
        await getAccessToken();
        return true;
    } catch (error) {
        console.error('Failed to initialize API:', error);
        return false;
    }
}

// Make functions available globally for browser use
window.stoklyAPI = {
    initializeStoklyAPI,
    requester,
    loopThrough,
    ensureToken,
    getAccessToken
};

// Also make them available as global functions for backward compatibility
window.initializeStoklyAPI = initializeStoklyAPI;
window.requester = requester;
window.loopThrough = loopThrough;
window.ensureToken = ensureToken;
window.getAccessToken = getAccessToken;

} // End of browser context check