// Debug Test Script - Add this to your HTML temporarily to test things

console.log('🔧 DEBUG TEST: Script loaded');

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 DEBUG TEST: DOM loaded');
    
    // Test 1: Check if elements exist
    const processingResults = document.getElementById('processingResults');
    console.log('🔧 DEBUG TEST: processingResults element:', !!processingResults);
    
    // Test 2: Check electronAPI
    console.log('🔧 DEBUG TEST: electronAPI available:', !!window.electronAPI);
    if (window.electronAPI) {
        console.log('🔧 DEBUG TEST: electronAPI methods:', Object.keys(window.electronAPI));
    }
    
    // Test 3: Check if processor exists
    setTimeout(() => {
        console.log('🔧 DEBUG TEST: amscanOrderProcessor exists:', !!window.amscanOrderProcessor);
        console.log('🔧 DEBUG TEST: processingResults exists:', !!window.processingResults);
        
        // Test 4: Manually trigger a test
        if (processingResults) {
            processingResults.innerHTML = '<p>🔧 Debug test: UI update works!</p>';
        }
        
        // Test 5: Try to manually process a test file
        if (window.amscanOrderProcessor) {
            console.log('🔧 DEBUG TEST: Attempting manual file processing...');
            const testContent = 'soheader~WS0000200024~P1486~~0.00~105.38~20250407~20250407~~~PARTY STORE GIRL LTD~Test~Test~Test~Test~Test\nsodetail~TESTSKU001~Test Product~1~10.50~0.00~~Test~10.50~~~~~EA~~~~~~~~~~~~~~~~~~~~';
            
            window.amscanOrderProcessor.processAmscanFile('manual-test.txt', testContent);
        }
        
    }, 2000);
    
    // Test 6: Add a button to manually test
    const container = document.querySelector('.container');
    if (container) {
        const testButton = document.createElement('button');
        testButton.textContent = '🔧 Manual Test Processing';
        testButton.style.cssText = 'background: orange; color: white; padding: 10px; margin: 10px; border: none; border-radius: 4px; cursor: pointer;';
        testButton.addEventListener('click', () => {
            console.log('🔧 DEBUG TEST: Manual button clicked');
            if (window.amscanOrderProcessor) {
                const testContent = 'soheader~WS0000200024~P1486~~0.00~105.38~20250407~20250407~~~PARTY STORE GIRL LTD~Test Store~123 Test St~Test City~Test County PR5 0RA~UNITED KINGDOM\nsodetail~TESTSKU001~Test Product~1~10.50~0.00~~Test~10.50~~~~~EA~~~~~~~~~~~~~~~~~~~~\nsodetail~TESTSKU002~Another Test~2~5.25~0.00~~Test~5.25~~~~~EA~~~~~~~~~~~~~~~~~~~~';
                
                window.amscanOrderProcessor.processAmscanFile('manual-test.txt', testContent);
            } else {
                alert('Order processor not available');
            }
        });
        container.appendChild(testButton);
    }
});