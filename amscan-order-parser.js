// Amscan Order Processor - Renderer Process Version
// This runs in the browser context and makes API calls visible in dev tools
// NO ERROR CATCHING - Let it crash if there are errors

class AmscanOrderProcessor {
    constructor() {
        this.apiInitialized = false;
        this.apiError = null;
    }

    /**
     * Round a number to 4 decimal places
     */
    roundTo4Decimals(value) {
        if (typeof value !== 'number' || isNaN(value)) {
            return 0;
        }
        return Math.round(value * 10000) / 10000;
    }

    /**
     * Main entry point - receives file from main process via IPC
     * @param {string} fileName - Name of the file
     * @param {string} fileContent - Raw content of the file
     */
    async processAmscanFile(fileName, fileContent) {
        console.log(`🔄 Processing file: ${fileName}`);
        
        // Update processing status in UI
        this.updateProcessingStatus(`Processing ${fileName}...`);
        
        // Check if this looks like an order file
        if (fileName.includes('import') || fileContent.includes('soheader~') || fileContent.includes('sodetail~')) {
            this.parseAmscanOrderFile(fileContent, async (orderHeader, orderItems) => {
                // Initialize API if needed
                await this.ensureApiInitialized();

                // Log the parsed data
                console.log('📋 ORDER HEADER:');
                console.log(JSON.stringify(orderHeader, null, 2));

                console.log('📋 ORDER ITEMS:');
                console.log(JSON.stringify(orderItems, null, 2));

                // Make API call to get customer ID
                console.log(`🔍 API: Looking up customer: "${orderHeader.deliveryName}"`);
                
                const customerResponse = await window.stoklyAPI.requester('GET', 
                    `https://api.stok.ly/v0/customers?filter=[name]=={${orderHeader.deliveryName}}`
                ).then(r=>{
                    return r?.data?.[0]?.customerId
                })

                console.log(orderHeader)

                if (customerResponse == undefined){
                    customerResponse = await window.stoklyAPI.requester('POST', 
                        `https://api.stok.ly/v0/customers`,
                            {
                            name: {
                                forename: orderHeader.deliveryName,
                                surname: orderHeader.deliveryName
                            },
                            address: {
                                line1: orderHeader.deliveryAddressLine1,
                                line2: orderHeader.deliveryAddressLine2,
                                city: this.extractCityFromDeliveryAddress(orderHeader),
                                country: 'GB',
                                postcode: this.extractPostcodeFromDeliveryAddress(orderHeader),
                                region: ''
                            },
                            barcode: orderHeader.customerAccount,
                            "type": 1,
                            "shippingAddresses": [
                                {
                                    line1: orderHeader.deliveryAddressLine1,
                                    line2: orderHeader.deliveryAddressLine2,
                                    city: this.extractCityFromDeliveryAddress(orderHeader),
                                    country: 'GB',
                                    postcode: this.extractPostcodeFromDeliveryAddress(orderHeader),
                                    region: ''
                                }
                            ],
                            "fullName": orderHeader.deliveryName
                        }
                        ).then(r => {
                            return new Promise(resolve => {
                                setTimeout(() => {
                                    resolve(r.data.data.id);
                                }, 5000);
                            });
                        });
                }

                console.log(customerResponse)
                
                console.log('🔍 API Response:', customerResponse);

                // Create the order object
                const order = await this.createOrderObject(orderHeader, orderItems, customerResponse);

                console.log(order)
                
                // Update processing status
                this.updateProcessingStatus(`✅ Successfully processed ${fileName}`);
                
                // Notify the main process of successful processing
                if (window.electronAPI && window.electronAPI.notifyProcessingComplete) {
                    await window.electronAPI.notifyProcessingComplete(fileName, {
                        success: true,
                        orderData: {
                            orderId: order.sourceReferenceId,
                            itemCount: order.items.length,
                            totalValue: orderItems.reduce((sum, item) => sum + item.lineValue, 0),
                            customerId: customerResponse || 'N/A'
                        }
                    });
                }

                // Add to sidebar results
                if (window.processingResults) {
                    window.processingResults.addResult(fileName, {
                        success: true,
                        orderData: {
                            orderId: order.sourceReferenceId,
                            itemCount: order.items.length,
                            totalValue: orderItems.reduce((sum, item) => sum + item.lineValue, 0),
                            customerId: customerResponse || 'N/A'
                        }
                    });
                }
            });
        } else {
            console.log(`⏭️ Skipping ${fileName} - not an order file`);
            this.updateProcessingStatus(`⏭️ Skipped ${fileName} - not an order file`);
        }
    }

    /**
     * Update processing status in UI
     */
    updateProcessingStatus(message) {
        const processingResults = document.getElementById('processingResults');
        if (processingResults) {
            processingResults.innerHTML = `<p>${message}</p>`;
        }
    }

    /**
     * Ensure API is initialized
     */
    async ensureApiInitialized() {
        if (this.apiInitialized) {
            return true;
        }

        if (this.apiError) {
            console.error('❌ API previously failed to initialize:', this.apiError);
            throw new Error(`API initialization failed: ${this.apiError}`);
        }

        console.log('🔧 Checking API initialization...');
        
        // Check if credentials are available
        if (!window.appCredentials || !window.appCredentials.isLoaded) {
            const error = 'No API credentials found. Please configure credentials in the UI first.';
            console.error('❌ API Initialization Failed:', error);
            this.apiError = error;
            throw new Error(error);
        }

        // Check if Stokly API is available
        if (!window.stoklyAPI || !window.stoklyAPI.initializeStoklyAPI) {
            const error = 'Stokly API not available. Please ensure stokly-api.js is loaded.';
            console.error('❌ API Initialization Failed:', error);
            this.apiError = error;
            throw new Error(error);
        }

        console.log('🔑 Found stored credentials, initializing API...');
        
        // Initialize the API (should already be done by credentials handler, but double-check)
        const success = await window.stoklyAPI.initializeStoklyAPI({
            accountKey: window.appCredentials.accountKey,
            clientId: window.appCredentials.clientId,
            secretKey: window.appCredentials.secretKey,
            environment: 'api.stok.ly'
        });

        if (success) {
            this.apiInitialized = true;
            console.log('✅ Stokly API initialized successfully');
            return true;
        } else {
            const error = 'API initialization returned false';
            console.error('❌ API Initialization Failed:', error);
            this.apiError = error;
            throw new Error(error);
        }
    }

    /**
     * Create order object with all values rounded to 4 decimal places
     */
    async createOrderObject(orderHeader, orderItems, customerId = null) {
        console.log(orderItems)
        
        let skuLookup = {};

        const productCodes = orderItems.map(item => item.productCode);

        // Process product codes in batches
        for (let i = 0; i < productCodes.length; i += 200) {
            const batch = productCodes.slice(i, i + 200);
            const formattedBatch = batch.map(sku => `[sku]=={@string;${sku}}`).join('||');
            
            await window.stoklyAPI.requester('GET', `https://api.stok.ly/v0/items?size=1000&filter=${formattedBatch}`).then(r => {
                for (const item of r.data){
                    skuLookup[item.sku.trim().toLowerCase()] = item.itemId
                }
            })
        }

        const date = new Date().toISOString();

        const order = {
            createdAt: date,
            currency: "GBP",
            stage: "order",
            sourceType: 'other',
            sourceReferenceId: orderHeader.orderId,
            sourceId: '0e95de59-6f4c-4f69-9ec1-0d82e3b5f759',
            shipping: {
                name: {
                    forename: orderHeader.deliveryName,
                    surname: orderHeader.customerAccount
                },
                address: {
                    line1: orderHeader.deliveryAddressLine1,
                    line2: orderHeader.deliveryAddressLine2,
                    city: this.extractCityFromDeliveryAddress(orderHeader),
                    country: 'GB',
                    postcode: this.extractPostcodeFromDeliveryAddress(orderHeader),
                    region: ''
                },
                option: "historicOrder",
                cost: this.roundTo4Decimals(0),
                tax: this.roundTo4Decimals(0)
            },
            items: orderItems.map(item => {
                const displayPrice = this.roundTo4Decimals(item.lineValue / item.quantityOrdered);
                const displayDiscount = this.roundTo4Decimals((item.unitPrice - (item.lineValue / item.quantityOrdered)));
                const displayLineDiscount = this.roundTo4Decimals(item.unitPrice * item.quantityOrdered - item.lineValue);
                
                return {
                    "type": "item",
                    "referenceId": skuLookup[item.productCode.trim().toLowerCase()],
                    "displayPrice": displayPrice,
                    "displayTax": this.roundTo4Decimals(0),
                    "quantity": item.quantityOrdered,
                    "displayDiscount": displayDiscount,
                    "displayLinePrice": this.roundTo4Decimals(item.lineValue),
                    "displayLineTax": this.roundTo4Decimals(0),
                    "displayLineDiscount": displayLineDiscount,
                    "displayLineTotal": this.roundTo4Decimals(item.lineValue),
                    "fulfilmentType": "delivery"
                };
            }),
            customer: {
                customerId: customerId
            },
            payments: []
        };

        return order;
    }

    /**
     * Extract city from delivery address fields - FIXED VERSION
     */
    extractCityFromDeliveryAddress(orderHeader) {
        const addressLines = [
            orderHeader.deliveryAddressLine3,
            orderHeader.deliveryAddressLine4,
            orderHeader.deliveryAddressLine5
        ].filter(line => line && line.trim() !== '');
        
        // UK postcode pattern (basic regex for common formats)
        const postcodePattern = /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/i;
        
        // Look for the line containing a postcode
        for (let i = 0; i < addressLines.length; i++) {
            const line = addressLines[i].trim();
            const match = line.match(postcodePattern);
            
            if (match) {
                // Found postcode in this line, extract city before it
                const beforePostcode = line.substring(0, match.index).trim();
                if (beforePostcode) {
                    return beforePostcode;
                }
            }
        }
        
        // Fallback: if no postcode found, try the address line structure
        // In your example: line3="Hoghton", line4="Preston  PR5 0RA", line5="UNITED KINGDOM"
        // The city is likely in line3 or the beginning of line4
        if (addressLines.length >= 2) {
            // Check if line4 has postcode pattern - if so, city might be in line3
            if (addressLines.length >= 2 && postcodePattern.test(addressLines[1])) {
                return addressLines[0]; // Return line3 as city
            }
        }
        
        // Final fallback - return first address line that's not "UNITED KINGDOM"
        for (const line of addressLines) {
            if (line.trim().toUpperCase() !== 'UNITED KINGDOM') {
                return line.trim();
            }
        }
        
        return '';
    }

    /**
     * Extract postcode from delivery address fields - FIXED VERSION
     */
    extractPostcodeFromDeliveryAddress(orderHeader) {
        const addressLines = [
            orderHeader.deliveryAddressLine3,
            orderHeader.deliveryAddressLine4,
            orderHeader.deliveryAddressLine5
        ].filter(line => line && line.trim() !== '');
        
        // UK postcode pattern (more comprehensive)
        const postcodePattern = /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i;
        
        // Look for postcode in any of the address lines
        for (const line of addressLines) {
            const match = line.match(postcodePattern);
            if (match) {
                return match[1].trim();
            }
        }
        
        return '';
    }

    /**
     * Parse Amscan order file content and extract order data
     */
    parseAmscanOrderFile(fileContent, processOrderCallback) {
        if (!fileContent || typeof fileContent !== 'string') {
            throw new Error('Invalid file content provided');
        }

        if (!processOrderCallback || typeof processOrderCallback !== 'function') {
            throw new Error('Process order callback function is required');
        }

        const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        let currentOrderHeader = null;
        let currentOrderItems = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const fields = line.split('~');
            const recordType = fields[0];

            if (recordType === 'soheader') {
                // If we have a previous order, process it first
                if (currentOrderHeader && currentOrderItems.length > 0) {
                    processOrderCallback(currentOrderHeader, currentOrderItems);
                }

                // Start new order
                currentOrderHeader = this.parseOrderHeader(fields);
                currentOrderItems = [];

            } else if (recordType === 'sodetail') {
                if (!currentOrderHeader) {
                    continue;
                }

                const orderItem = this.parseOrderDetail(fields);
                currentOrderItems.push(orderItem);
            }
        }

        // Process the last order if it exists
        if (currentOrderHeader && currentOrderItems.length > 0) {
            processOrderCallback(currentOrderHeader, currentOrderItems);
        }
    }

    /**
     * Parse order header line into order object
     */
    parseOrderHeader(fields) {
        const orderHeader = {
            recordType: fields[0] || '',
            orderId: fields[1] || '',
            customerAccount: fields[2] || '',
            salesRepCode: fields[3] || '',
            discountPercentage: parseFloat(fields[4]) || 0,
            orderValue: parseFloat(fields[5]) || 0,
            dueDate: fields[6] || '',
            orderDate: fields[7] || '',
            seasonCode: fields[8] || '',
            statusCode: fields[9] || '',
            deliveryName: fields[10] || '',
            deliveryAddressLine1: fields[11] || '',
            deliveryAddressLine2: fields[12] || '',
            deliveryAddressLine3: fields[13] || '',
            deliveryAddressLine4: fields[14] || '',
            deliveryAddressLine5: fields[15] || '',
            deliveryAddressNumber: fields[16] || '',
            customerReferenceNumber: fields[17] || '',
            genericCode1: fields[18] || '',
            freetype1: fields[19] || '',
            freetype2: fields[20] || '',
            freetype3: fields[21] || '',
            disused: fields[22] || '',
            orderType: fields[23] || '',
            priceList: fields[24] || '',
            noteDate: fields[25] || '',
            genericCode18: fields[26] || '',
            genericCode19: fields[27] || '',
            genericCode20: fields[28] || '',
            genericCode21: fields[29] || '',
            genericCode22: fields[30] || '',
            genericCode23: fields[31] || '',
            freetype4: fields[32] || '',
            freetype5: fields[33] || '',
            manualAddress: fields[34] || '',
            orderTimeStamp: fields[35] || '',
            priceCode: fields[36] || '',
            templateId: fields[37] || '',
            postOrderDiscount: parseFloat(fields[38]) || 0,
            signatureName: fields[39] || '',
            signatureTimeStamp: fields[40] || '',
            locationCode: fields[41] || '',
            termsCode: fields[42] || '',
            confirmationEmail: fields[43] || '',
            promotionCode: fields[44] || '',
            weight: fields[45] || '',
            volume: fields[46] || '',
            despatchAdvice: fields[47] || '',
            despatchType: fields[48] || ''
        };

        // Parse dates into more usable format if needed
        if (orderHeader.dueDate && orderHeader.dueDate.length === 8) {
            orderHeader.dueDateFormatted = this.formatDate(orderHeader.dueDate);
        }
        if (orderHeader.orderDate && orderHeader.orderDate.length === 8) {
            orderHeader.orderDateFormatted = this.formatDate(orderHeader.orderDate);
        }

        return orderHeader;
    }

    /**
     * Parse order detail line into order item object
     */
    parseOrderDetail(fields) {
        const orderItem = {
            recordType: fields[0] || '',
            productCode: fields[1] || '',
            description: fields[2] || '',
            quantityOrdered: parseFloat(fields[3]) || 0,
            lineValue: parseFloat(fields[4]) || 0,
            lineDiscountPercentage: parseFloat(fields[5]) || 0,
            genericCode2: fields[6] || '',
            freetype1: fields[7] || '',
            unitPrice: parseFloat(fields[8]) || 0,
            priceDiscountSource: fields[9] || '',
            lineDueDate: fields[10] || '',
            locationCode: fields[11] || '',
            postOrderDiscount: fields[12] || '',
            unitCode: fields[13] || '',
            ratio: fields[14] || '',
            priceAdjustmentCode: fields[15] || '',
            genericCode25: fields[16] || '',
            genericCode26: fields[17] || '',
            freetype2: fields[18] || '',
            nettPrice: fields[19] || '',
            templateId: fields[20] || '',
            buyPromoId: fields[21] || '',
            getPromoId: fields[22] || ''
        };

        // Parse line due date if present
        if (orderItem.lineDueDate && orderItem.lineDueDate.length === 8) {
            orderItem.lineDueDateFormatted = this.formatDate(orderItem.lineDueDate);
        }

        // Calculate line total if not provided
        if (!orderItem.lineValue && orderItem.quantityOrdered && orderItem.unitPrice) {
            orderItem.calculatedLineValue = orderItem.quantityOrdered * orderItem.unitPrice;
        }

        return orderItem;
    }

    /**
     * Format YYYYMMDD date string to readable format
     */
    formatDate(dateStr) {
        if (!dateStr || dateStr.length !== 8) {
            return dateStr;
        }

        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);

        return `${day}/${month}/${year}`;
    }
}

// Initialize the processor
const amscanOrderProcessor = new AmscanOrderProcessor();

// Make it globally available
window.amscanOrderProcessor = amscanOrderProcessor;

// Debug: Check if electronAPI is available
console.log('🔧 Checking electronAPI availability:', !!window.electronAPI);
console.log('🔧 Available electronAPI methods:', window.electronAPI ? Object.keys(window.electronAPI) : 'None');

// Listen for file processing requests from main process
if (window.electronAPI && window.electronAPI.onProcessFile) {
    console.log('🔧 Setting up file processing listener...');
    window.electronAPI.onProcessFile((fileName, fileContent) => {
        console.log(`📥 Received file from main process: ${fileName}`);
        amscanOrderProcessor.processAmscanFile(fileName, fileContent);
    });
    console.log('✅ File processing listener set up successfully');
} else {
    console.error('❌ electronAPI.onProcessFile not available - files will not be processed');
    
    // Update UI to show the issue
    setTimeout(() => {
        const processingResults = document.getElementById('processingResults');
        if (processingResults) {
            processingResults.innerHTML = '<p>❌ IPC communication not available - cannot receive files from main process</p>';
        }
    }, 1000);
}