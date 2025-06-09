// Amscan Order Processor - Handles file processing and logging
// This is where all the order file logic lives, separate from SFTP

/**
 * Main entry point - receives file from SFTP manager
 * @param {string} fileName - Name of the file from SFTP
 * @param {string} fileContent - Raw content of the file
 */


function processAmscanFile(fileName, fileContent) {
    // Check if this looks like an order file
    if (fileName.includes('import') || fileContent.includes('soheader~') || fileContent.includes('sodetail~')) {
        try {
            parseAmscanOrderFile(fileContent, function(orderHeader, orderItems) {
                // Log the two data structures as requested
                console.log('ORDER HEADER:');
                console.log(JSON.stringify(orderHeader, null, 2));

                console.log('\nORDER ITEMS:');
                console.log(JSON.stringify(orderItems, null, 2));

                const productCodes = data.map(item => item.productCode);

                for (let i = 0; i < productCodes.length; i += 200) {
                    const batch = productCodes.slice(i, i + 200).join(',');

                }


              let order = {
                  createdAt: date,
                  "currency": "GBP",
                  "stage": "order",
                  "sourceType": 'other',
                  "sourceReferenceId": orderHeader.orderId,
                  "sourceId": '0e95de59-6f4c-4f69-9ec1-0d82e3b5f759',
                  "shipping": {
                      "name": {
                          "forename": orderHeader.deliveryName,
                          "surname": orderHeader.customerAccount
                      },
                      "address": {
                          "line1": orderHeader.deliveryAddressLine1,
                          "line2": orderHeader.deliveryAddressLine2,
                          "city": extractCityFromDeliveryAddress(orderHeader),
                          "country": 'GB',
                          "postcode": extractPostcodeFromDeliveryAddress(orderHeader),
                          "region": ''
                      },
                      "option": "historicOrder",
                      "cost": 0,
                      "tax": 0
                  },
                  "items": [],
                  customer: {
                      "name": {
                            "forename": orderHeader.deliveryName,
                            "surname": orderHeader.customerAccount
                      },
                      "address": {
                          "line1": orderHeader.deliveryAddressLine1,
                          "line2": orderHeader.deliveryAddressLine2,
                          "city": extractCityFromDeliveryAddress(orderHeader),
                          "country": 'GB',
                          "postcode": extractPostcodeFromDeliveryAddress(orderHeader),
                          "region": ''
                      },
                      email: row['customer email'],
                      phone: row['telephone']
                  },
                  payments: [{
                      method: 4,
                      amount: parseFloat(row['postage']) + parseFloat(row['postage vat']),
                      label: 'Imported Order',
                      timestamp: date
                  }]
              }

            });
        } catch (parseError) {
            console.error(`Error parsing ${fileName}:`, parseError.message);
        }
    }
}

/**
 * Extract city from delivery address fields
 */
function extractCityFromDeliveryAddress(orderHeader) {
    // Look through address lines to find city (typically in the last non-empty line before postcode)
    const addressLines = [
        orderHeader.deliveryAddressLine3,
        orderHeader.deliveryAddressLine4,
        orderHeader.deliveryAddressLine5
    ].filter(line => line && line.trim() !== '');
    
    if (addressLines.length > 0) {
        const lastLine = addressLines[addressLines.length - 1];
        // Split by spaces and take all but last 2 parts as city (postcode is usually last 2 parts)
        const parts = lastLine.trim().split(/\s+/);
        if (parts.length >= 3) {
            return parts.slice(0, -2).join(' ');
        }
    }
    return '';
}

/**
 * Extract postcode from delivery address fields
 */
function extractPostcodeFromDeliveryAddress(orderHeader) {
    // Look through address lines to find postcode (typically in the last non-empty line)
    const addressLines = [
        orderHeader.deliveryAddressLine3,
        orderHeader.deliveryAddressLine4,
        orderHeader.deliveryAddressLine5
    ].filter(line => line && line.trim() !== '');
    
    if (addressLines.length > 0) {
        const lastLine = addressLines[addressLines.length - 1];
        // UK postcodes are typically the last 2 parts when split by spaces
        const parts = lastLine.trim().split(/\s+/);
        if (parts.length >= 2) {
            return parts.slice(-2).join(' ');
        }
    }
    return '';
}

/**
 * Parse Amscan order file content and extract order data
 * @param {string} fileContent - Raw content of the order file
 * @param {function} processOrderCallback - Callback function to process each order
 */
function parseAmscanOrderFile(fileContent, processOrderCallback) {
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
            currentOrderHeader = parseOrderHeader(fields);
            currentOrderItems = [];

        } else if (recordType === 'sodetail') {
            if (!currentOrderHeader) {
                continue;
            }

            const orderItem = parseOrderDetail(fields);
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
 * @param {Array} fields - Array of field values from tilde-delimited line
 * @returns {Object} Order header object
 */
function parseOrderHeader(fields) {
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
        orderHeader.dueDateFormatted = formatDate(orderHeader.dueDate);
    }
    if (orderHeader.orderDate && orderHeader.orderDate.length === 8) {
        orderHeader.orderDateFormatted = formatDate(orderHeader.orderDate);
    }

    return orderHeader;
}

/**
 * Parse order detail line into order item object
 * @param {Array} fields - Array of field values from tilde-delimited line
 * @returns {Object} Order item object
 */
function parseOrderDetail(fields) {
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
        orderItem.lineDueDateFormatted = formatDate(orderItem.lineDueDate);
    }

    // Calculate line total if not provided
    if (!orderItem.lineValue && orderItem.quantityOrdered && orderItem.unitPrice) {
        orderItem.calculatedLineValue = orderItem.quantityOrdered * orderItem.unitPrice;
    }

    return orderItem;
}

/**
 * Format YYYYMMDD date string to readable format
 * @param {string} dateStr - Date in YYYYMMDD format
 * @returns {string} Formatted date string
 */
function formatDate(dateStr) {
    if (!dateStr || dateStr.length !== 8) {
        return dateStr;
    }

    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);

    return `${day}/${month}/${year}`;
}

// Export the main function for use in your application
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        processAmscanFile,
        parseAmscanOrderFile,
        parseOrderHeader,
        parseOrderDetail,
        formatDate
    };
}

/**
 * Batch parse multiple addresses
 * @param {string[]} addresses - Array of address strings
 * @returns {Object[]} Array of parsed addresses
 */
function parseMultipleUKAddresses(addresses) {
    if (!Array.isArray(addresses)) {
        throw new Error('Input must be an array of address strings');
    }

    return addresses.map((address, index) => {
        try {
            return parseUKAddress(address);
        } catch (error) {
            console.warn(`Failed to parse address at index ${index}: ${error.message}`);
            return {
                line1: address || '',
                line2: '',
                city: '',
                region: '',
                country: 'United Kingdom',
                postcode: ''
            };
        }
    });
}

// Make available globally for browser use
if (typeof window !== 'undefined') {
    window.AmscanOrderProcessor = {
        processAmscanFile,
        parseAmscanOrderFile,
        parseOrderHeader,
        parseOrderDetail,
        formatDate
    };
}