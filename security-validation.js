// Security validation script
document.addEventListener('DOMContentLoaded', function() {
    // Check for inline scripts (should be none)
    const inlineScripts = document.querySelectorAll('script:not([src])');
    if (inlineScripts.length > 0) {
        console.warn('Inline scripts detected - potential CSP violation');
    }
    
    // Validate form inputs have proper security attributes
    const inputs = document.querySelectorAll('input[type="text"], input[type="password"]');
    inputs.forEach(input => {
        if (!input.hasAttribute('autocomplete') || !input.hasAttribute('spellcheck')) {
            console.warn(`Input ${input.id} missing security attributes`);
        }
    });
    
    console.log('Security validation completed');
});