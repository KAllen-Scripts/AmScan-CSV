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
        console.log(`🔒 ZERO-KB PROTECTION ACTIVE: Files with 0 bytes will be completely ignored`);
        console.log(`🔒 Size check: ${fileName} = ${fileContent ? fileContent.length : 'NO CONTENT'} bytes`);
        
        // Update processing status in UI
        this.updateProcessingStatus(`Processing ${fileName}...`);
        
        // CRITICAL: Absolutely refuse to touch 0kb files
        if (!fileContent || fileContent.length === 0) {
            console.log(`🚫 ZERO-KB PROTECTION TRIGGERED: ${fileName} is 0kb - COMPLETELY IGNORED`);
            this.updateProcessingStatus(`🚫 Protected ${fileName} - 0kb file ignored`);
            
            // Notify about protected file
            if (window.processingResults) {
                window.processingResults.addResult(fileName, {
                    success: true,
                    skipped: true,
                    error: '0kb file - protected from processing'
                });
            }
            return;
        }

        // EXTRA PROTECTION: Also skip very small files
        if (fileContent.length < 10) {
            console.log(`⏭️ SKIP: ${fileName} (too small - ${fileContent.length} chars)`);
            this.updateProcessingStatus(`⏭️ Skipped ${fileName} - too small`);
            
            if (window.processingResults) {
                window.processingResults.addResult(fileName, {
                    success: true,
                    skipped: true,
                    error: 'File too small to process'
                });
            }
            return;
        }
        
        try {
            // Check if this looks like an order file
            if (fileName.includes('import') || fileContent.includes('soheader~') || fileContent.includes('sodetail~')) {
                
                // Wrap the parsing in a promise so we can catch errors
                const processingResult = await new Promise((resolve, reject) => {
                    try {
                        this.parseAmscanOrderFile(fileContent, async (orderHeader, orderItems) => {
                            try {
                                // Initialize API if needed
                                await this.ensureApiInitialized();

                                // Make API call to get customer ID with proper URL encoding and error handling
                                const encodedCustomerBarcode = encodeURIComponent(orderHeader.customerAccount);

                                let customerResponse;

                                try {
                                    // First, try to find existing customer
                                    console.log('🔍 CUSTOMER: Searching for existing customer...');
                                    const searchResult = await window.stoklyAPI.requester('GET', 
                                        `https://api.stok.ly/v0/customers?filter=[barcode]=={${encodedCustomerBarcode}}`
                                    );
                                    
                                    customerResponse = searchResult?.data?.[0]?.customerId;
                                    
                                    if (customerResponse) {
                                        console.log('✅ CUSTOMER: Found existing customer with ID:', customerResponse);
                                    } else {
                                        console.log('❌ CUSTOMER: Customer not found, creating new customer...');
                                        
                                        // Customer not found, create new one
                                        const customerData = {
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
                                        };
                                        
                                        console.log('🔄 CUSTOMER: Creating customer with data:', customerData);
                                        
                                        try {
                                            const createResult = await window.stoklyAPI.requester('POST', 
                                                `https://api.stok.ly/v0/customers`,
                                                customerData
                                            );
                                            
                                            console.log('🔄 CUSTOMER: Create API response:', createResult);
                                            
                                            // Check if customer creation was successful
                                            if (!createResult || !createResult.data || !createResult.data.data || !createResult.data.data.id) {
                                                throw new Error(`Customer creation failed: Invalid response structure. Response: ${JSON.stringify(createResult)}`);
                                            }
                                            
                                            // Wait for the system to process (as per original code)
                                            console.log('⏳ CUSTOMER: Waiting 5 seconds for customer creation to process...');
                                            await new Promise(resolve => setTimeout(resolve, 5000));
                                            
                                            customerResponse = createResult.data.data.id;
                                            console.log('✅ CUSTOMER: Successfully created customer with ID:', customerResponse);
                                            
                                        } catch (createError) {
                                            console.error('❌ CUSTOMER: Failed to create customer:', createError);
                                            
                                            // Provide detailed error information
                                            let errorMessage = 'Customer creation failed';
                                            if (createError.message) {
                                                errorMessage += `: ${createError.message}`;
                                            }
                                            if (createError.response) {
                                                errorMessage += ` (HTTP ${createError.response.status})`;
                                            }
                                            
                                            throw new Error(errorMessage);
                                        }
                                    }
                                    
                                    // Validate that we have a customer ID before proceeding
                                    if (!customerResponse) {
                                        throw new Error('No customer ID obtained - cannot proceed with order creation');
                                    }
                                    
                                    console.log('✅ CUSTOMER: Customer ID confirmed:', customerResponse);
                                    
                                } catch (customerError) {
                                    console.error('❌ CUSTOMER: Customer handling failed:', customerError);
                                    throw new Error(`Customer processing failed: ${customerError.message}`);
                                }

                                // Create the order object
                                const order = await this.createOrderObject(orderHeader, orderItems, customerResponse);

                                console.log('📋 ORDER: Order object created, submitting to API...');

                                // Submit the order to the API
                                try {

                                    const existingOrder = await window.stoklyAPI.requester('GET', 
                                        `https://api.stok.ly/v2/saleorders?filter=[customerReference]=={${orderHeader.customerReferenceNumber}}`,
                                        order
                                    ).then(r=>{return r?.data?.[0]?.customerReference})


                                    if (!existingOrder){
                                        await window.stoklyAPI.requester('POST', 
                                            `https://api.stok.ly/v2/saleorders`,
                                            order
                                        );
                                    }
                                    
                                    // Check if there were any missing SKUs for warnings
                                    const hasWarnings = order._metadata && order._metadata.missingSkus.length > 0;
                                    
                                    // Resolve with success data including warning information
                                    resolve({
                                        success: true,
                                        hasWarnings: hasWarnings,
                                        orderData: {
                                            orderId: order.sourceReferenceId,
                                            itemCount: order.items.length,
                                            totalItems: orderItems.length,
                                            skippedItems: hasWarnings ? order._metadata.skippedItemsCount : 0,
                                            missingSkus: hasWarnings ? order._metadata.missingSkus : [],
                                            totalValue: orderItems.reduce((sum, item) => sum + item.lineValue, 0),
                                            processedValue: order.items.reduce((sum, item) => sum + item.displayLineTotal, 0),
                                            customerId: customerResponse || 'N/A',
                                            warningMessage: hasWarnings ? `${order._metadata.skippedItemsCount} items skipped (missing SKUs)` : null,
                                            apiSubmitted: true // Flag to indicate successful API submission
                                        }
                                    });
                                    
                                } catch (orderSubmissionError) {
                                    console.error('❌ ORDER: Failed to submit sale order to API:', orderSubmissionError);
                                    
                                    // Order creation succeeded but API submission failed
                                    reject(new Error(`Order created but API submission failed: ${orderSubmissionError.message}`));
                                }
                                
                            } catch (processingError) {
                                console.error('❌ Error processing order:', processingError);
                                reject(processingError);
                            }
                        });
                    } catch (parseError) {
                        console.error('❌ Error parsing order file:', parseError);
                        reject(parseError);
                    }
                });
                
                // If we get here, processing was successful
                this.updateProcessingStatus(`✅ Successfully processed ${fileName}`);
                
                // Notify the main process of successful processing
                if (window.electronAPI && window.electronAPI.notifyProcessingComplete) {
                    await window.electronAPI.notifyProcessingComplete(fileName, processingResult);
                }

                // Add to sidebar results
                if (window.processingResults) {
                    window.processingResults.addResult(fileName, processingResult);
                }
                
            } else {
                // Not an order file
                this.updateProcessingStatus(`⏭️ Skipped ${fileName} - not an order file`);
                
                // Notify about skipped file
                if (window.processingResults) {
                    window.processingResults.addResult(fileName, {
                        success: false,
                        skipped: true,
                        error: 'Not an order file'
                    });
                }
            }
            
        } catch (error) {
            console.error(`❌ Error processing file ${fileName}:`, error);
            
            // Update processing status with error
            this.updateProcessingStatus(`❌ Failed to process ${fileName}: ${error.message}`);
            
            // Notify the main process of failed processing
            if (window.electronAPI && window.electronAPI.notifyProcessingComplete) {
                await window.electronAPI.notifyProcessingComplete(fileName, {
                    success: false,
                    error: error.message
                });
            }

            // Add error to sidebar results
            if (window.processingResults) {
                window.processingResults.addResult(fileName, {
                    success: false,
                    error: error.message
                });
            }
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
        
        // Initialize the API (should already be done by credentials handler, but double-check)
        const success = await window.stoklyAPI.initializeStoklyAPI({
            accountKey: window.appCredentials.accountKey,
            clientId: window.appCredentials.clientId,
            secretKey: window.appCredentials.secretKey,
            environment: 'api.stok.ly'
        });

        if (success) {
            this.apiInitialized = true;
            return true;
        } else {
            const error = 'API initialization returned false';
            this.apiError = error;
            throw new Error(error);
        }
    }

    /**
     * Create order object with all values rounded to 4 decimal places
     * FIXED: Proper handling of missing SKUs
     */
    async createOrderObject(orderHeader, orderItems, customerId = null) {
        
        let skuLookup = {};
        let missingSkus = [];

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

        // Check for missing SKUs and build the items array
        const validItems = [];
        const skippedItems = [];

        for (const item of orderItems) {
            const itemId = skuLookup[item.productCode.trim().toLowerCase()];
            
            if (itemId) {
                // SKU found - add to valid items
                const displayPrice = this.roundTo4Decimals(item.lineValue / item.quantityOrdered);
                const displayDiscount = this.roundTo4Decimals((item.unitPrice - (item.lineValue / item.quantityOrdered)));
                const displayLineDiscount = this.roundTo4Decimals(item.unitPrice * item.quantityOrdered - item.lineValue);
                
                validItems.push({
                    "type": "item",
                    "referenceId": itemId,
                    "displayPrice": displayPrice,
                    "displayTax": this.roundTo4Decimals(0),
                    "quantity": item.quantityOrdered,
                    "displayDiscount": displayDiscount,
                    "displayLinePrice": this.roundTo4Decimals(item.lineValue),
                    "displayLineTax": this.roundTo4Decimals(0),
                    "displayLineDiscount": displayLineDiscount,
                    "displayLineTotal": this.roundTo4Decimals(item.lineValue),
                    "fulfilmentType": "delivery"
                });
            } else {
                // SKU not found - add to skipped items
                skippedItems.push({
                    productCode: item.productCode,
                    description: item.description,
                    quantity: item.quantityOrdered,
                    lineValue: item.lineValue
                });
                missingSkus.push(item.productCode);
            }
        }

        // Log information about missing SKUs
        if (missingSkus.length > 0) {
            console.warn(`⚠️ Missing ${missingSkus.length} SKUs in system:`, missingSkus);
            console.warn(`⚠️ Skipped items:`, skippedItems);
        }

        // Check if we have any valid items to process
        if (validItems.length === 0) {
            throw new Error(`No valid items found. All ${orderItems.length} SKUs are missing from the system: ${missingSkus.join(', ')}`);
        }

        // If we have some missing SKUs but some valid ones, log a warning but continue
        if (missingSkus.length > 0) {
            console.warn(`⚠️ Order ${orderHeader.orderId}: Processing ${validItems.length} valid items, skipping ${missingSkus.length} missing SKUs`);
        }

        const order = {
            createdAt: date,
            currency: "GBP",
            stage: "order",
            sourceType: 'other',
            sourceReferenceId: orderHeader.orderId,
            customerReference: orderHeader.customerReferenceNumber,
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
            items: validItems, // Only include valid items
            customer: {
                customerId: customerId
            },
            payments: [],
            // Add metadata about missing items for reference
            _metadata: {
                totalItemsInOriginalOrder: orderItems.length,
                validItemsProcessed: validItems.length,
                skippedItemsCount: skippedItems.length,
                missingSkus: missingSkus,
                skippedItems: skippedItems
            }
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

// Listen for file processing requests from main process
if (window.electronAPI && window.electronAPI.onProcessFile) {
    window.electronAPI.onProcessFile((fileName, fileContent) => {
        amscanOrderProcessor.processAmscanFile(fileName, fileContent);
    });
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