const crypto = require('crypto');
const { app } = require('electron');
const os = require('os');

class EncryptionUtils {
    constructor() {
        // Generate a unique key based on machine characteristics
        this.encryptionKey = this.generateMachineKey();
        this.algorithm = 'aes-256-gcm';
    }

    /**
     * Generate a machine-specific encryption key
     * This creates a unique key for each machine/user combination
     */
    generateMachineKey() {
        // Combine multiple machine-specific identifiers
        const machineId = [
            os.hostname(),
            os.userInfo().username,
            app.getPath('userData'),
            process.platform,
            os.arch()
        ].join('|');

        // Create a hash from the machine ID
        const hash = crypto.createHash('sha256');
        hash.update(machineId);
        hash.update('sync-tool-secret-salt-2024'); // Add app-specific salt
        
        return hash.digest();
    }

    /**
     * Encrypt sensitive data using modern crypto methods
     * @param {string} text - The text to encrypt
     * @returns {object} - Object containing encrypted data and metadata
     */
    encrypt(text) {
        try {
            // Generate a random initialization vector (12 bytes for GCM)
            const iv = crypto.randomBytes(12);
            
            // Create cipher using createCipheriv (modern, non-deprecated method)
            const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
            
            // Set additional authenticated data
            const aad = Buffer.from('sync-tool-auth-v2');
            cipher.setAAD(aad);
            
            // Encrypt the text
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Get the authentication tag
            const authTag = cipher.getAuthTag();
            
            return {
                encrypted: encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                aad: aad.toString('hex'),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Encryption error:', error);
            throw new Error('Failed to encrypt data');
        }
    }

    /**
     * Decrypt sensitive data using modern crypto methods
     * @param {object} encryptedData - The encrypted data object
     * @returns {string} - The decrypted text
     */
    decrypt(encryptedData) {
        try {
            // Convert hex strings back to buffers
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const authTag = Buffer.from(encryptedData.authTag, 'hex');
            const aad = Buffer.from(encryptedData.aad || 'sync-tool-auth-v2', 'hex');
            
            // Create decipher using createDecipheriv (modern, non-deprecated method)
            const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
            
            // Set additional authenticated data and auth tag
            decipher.setAAD(aad);
            decipher.setAuthTag(authTag);
            
            // Decrypt the data
            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Failed to decrypt data - may be corrupted or tampered with');
        }
    }

    /**
     * Encrypt credentials object (generic for any credential type)
     * @param {object} credentials - Any credentials object
     * @returns {object} - Encrypted credentials
     */
    encryptCredentials(credentials) {
        const credentialsString = JSON.stringify({
            ...credentials,  // Keep all provided fields
            timestamp: credentials.timestamp || new Date().toISOString()
        });
        
        return this.encrypt(credentialsString);
    }

    /**
     * Decrypt credentials object
     * @param {object} encryptedCredentials - Encrypted credentials
     * @returns {object} - Decrypted credentials object
     */
    decryptCredentials(encryptedCredentials) {
        const decryptedString = this.decrypt(encryptedCredentials);
        return JSON.parse(decryptedString);
    }

    /**
     * Secure password hashing using modern methods
     * @param {string} password - Plain text password
     * @param {string} salt - Salt for hashing (optional)
     * @returns {object} - Hash and salt
     */
    hashPassword(password, salt = null) {
        if (!salt) {
            salt = crypto.randomBytes(32).toString('hex');
        }
        
        // Use scrypt for password hashing (more secure than pbkdf2)
        const hash = crypto.scryptSync(password, salt, 64);
        return {
            hash: hash.toString('hex'),
            salt: salt
        };
    }

    /**
     * Verify hashed password
     * @param {string} password - Plain text password to verify
     * @param {string} hash - Stored hash
     * @param {string} salt - Stored salt
     * @returns {boolean} - Whether password matches
     */
    verifyPassword(password, hash, salt) {
        try {
            const hashResult = this.hashPassword(password, salt);
            return hashResult.hash === hash;
        } catch (error) {
            console.error('Password verification error:', error);
            return false;
        }
    }

    /**
     * Generate a cryptographically secure random string
     * @param {number} length - Length of the random string
     * @returns {string} - Random hex string
     */
    generateSecureRandom(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Create a secure hash of any data
     * @param {string} data - Data to hash
     * @param {string} algorithm - Hash algorithm (default: sha256)
     * @returns {string} - Hex hash
     */
    createHash(data, algorithm = 'sha256') {
        return crypto.createHash(algorithm).update(data).digest('hex');
    }
}

module.exports = EncryptionUtils;