// Content script for PCOC Data Scraper
// This script runs on the webpage and handles communication between popup and page

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrapeData') {
        scrapePageData().then(data => {
            sendResponse({ success: true, data: data });
        }).catch(error => {
            sendResponse({ success: false, error: error.message });
        });
        return true; // Keep message channel open for async response
    }
});

// Enhanced scraping function
async function scrapePageData() {
    const data = {
        requestNumber: '',
        productName: '',
        hsCode: '',
        countryOfOrigin: '',
        englishTrademark: '',
        modelNumbers: [],
        scrapingTimestamp: new Date().toISOString()
    };

    try {
        // Extract basic information
        extractBasicInfo(data);
        
        // Get all model numbers from all pages
        await extractAllModelNumbers(data);
        
        return data;
    } catch (error) {
        console.error('Scraping error:', error);
        throw error;
    }
}

function extractBasicInfo(data) {
    // Request Number - look for the pattern in the title section
    const requestNumElement = document.querySelector('.title-brdr');
    if (requestNumElement) {
        const text = requestNumElement.textContent;
        const match = text.match(/(\d{2}-\d{2}-\d+)/);
        data.requestNumber = match ? match[1] : '';
    }

    // Product Name (English Product Name)
    const productNameLabel = Array.from(document.querySelectorAll('label')).find(
        label => label.textContent.includes('English Product Name')
    );
    if (productNameLabel) {
        const valueElement = productNameLabel.parentNode.querySelector('.form-control-auto');
        data.productName = valueElement ? valueElement.textContent.trim() : '';
    }

    // HS Code - Look for HSCode field (might not be visible in current HTML)
    const hsCodeLabel = Array.from(document.querySelectorAll('label')).find(
        label => label.textContent.includes('HS') || label.textContent.includes('HSCode')
    );
    if (hsCodeLabel) {
        const valueElement = hsCodeLabel.parentNode.querySelector('.form-control, .form-control-auto');
        data.hsCode = valueElement ? valueElement.textContent.trim() : '';
    }

    // Country of Origin
    const countryLabel = Array.from(document.querySelectorAll('label')).find(
        label => label.textContent.includes('Country of origin')
    );
    if (countryLabel) {
        const valueElement = countryLabel.parentNode.querySelector('.form-control');
        data.countryOfOrigin = valueElement ? valueElement.textContent.trim() : '';
    }

    // English Trademark
    const trademarkLabel = Array.from(document.querySelectorAll('label')).find(
        label => label.textContent.includes('English Tradmark')
    );
    if (trademarkLabel) {
        const valueElement = trademarkLabel.parentNode.querySelector('.form-control');
        data.englishTrademark = valueElement ? valueElement.textContent.trim() : '';
    }
}

async function extractAllModelNumbers(data) {
    // Get current page models
    data.modelNumbers = getCurrentPageModels();
    
    // Get pagination info
    const paginationInfo = getPaginationInfo();
    
    if (paginationInfo.total > 1) {
        // Send initial progress
        chrome.runtime.sendMessage({
            type: 'SCRAPING_PROGRESS',
            data: { current: 1, total: paginationInfo.total }
        });

        // Get HR Request ID for pagination
        const hrRequestId = getHrRequestId();
        
        // Scrape remaining pages
        for (let page = 2; page <= paginationInfo.total; page++) {
            try {
                await navigateToPage(page, hrRequestId);
                const pageModels = getCurrentPageModels();
                data.modelNumbers = [...data.modelNumbers, ...pageModels];
                
                // Send progress update
                chrome.runtime.sendMessage({
                    type: 'SCRAPING_PROGRESS',
                    data: { current: page, total: paginationInfo.total }
                });
                
                // Small delay to prevent overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.warn(`Failed to scrape page ${page}:`, error);
            }
        }
    }
}

function getCurrentPageModels() {
    const models = [];
    const modelInputs = document.querySelectorAll('.ProductModelsGrid input[type="text"][readonly]');
    modelInputs.forEach(input => {
        const value = input.value.trim();
        if (value && !models.includes(value)) {
            models.push(value);
        }
    });
    return models;
}

function getPaginationInfo() {
    const pageInfoElement = document.querySelector('.search_results_text');
    if (pageInfoElement) {
        const match = pageInfoElement.textContent.match(/Page (\d+) Of (\d+)/);
        if (match) {
            return {
                current: parseInt(match[1]),
                total: parseInt(match[2])
            };
        }
    }
    return { current: 1, total: 1 };
}

function getHrRequestId() {
    // Try to extract from pagination links
    const paginationLink = document.querySelector('a[href*="HrRequestId"]');
    if (paginationLink) {
        const match = paginationLink.href.match(/HrRequestId=(\d+)/);
        return match ? match[1] : '';
    }
    
    // Try to extract from form or other elements
    const forms = document.querySelectorAll('form');
    for (const form of forms) {
        const hiddenInput = form.querySelector('input[name*="RequestId"], input[name*="HrRequestId"]');
        if (hiddenInput) {
            return hiddenInput.value;
        }
    }
    
    return '';
}

async function navigateToPage(pageNumber, hrRequestId) {
    return new Promise((resolve, reject) => {
        // Look for existing pagination link first
        const existingLink = document.querySelector(`a[href*="PageNumber=${pageNumber}"]`);
        
        if (existingLink) {
            // Click the existing pagination link
            existingLink.click();
            
            // Wait for page to update
            const checkForUpdate = () => {
                const pageInfo = getPaginationInfo();
                if (pageInfo.current === pageNumber) {
                    resolve();
                } else {
                    setTimeout(checkForUpdate, 200);
                }
            };
            
            setTimeout(checkForUpdate, 500);
        } else {
            // Fallback: try AJAX request
            const url = `/OrganizationOfficer/HrRequest/ModelNumberList?PageNumber=${pageNumber}&HrRequestId=${hrRequestId}`;
            
            fetch(url, {
                method: 'GET',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.text())
            .then(html => {
                // Update the page content
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;
                
                // Find the model numbers container and update it
                const newModelsContainer = tempDiv.querySelector('.ProductModelsGrid') || 
                                         tempDiv.querySelector('#divModelNumberList');
                
                const currentModelsContainer = document.querySelector('.ProductModelsGrid') ||
                                             document.querySelector('#divModelNumberList');
                
                if (newModelsContainer && currentModelsContainer) {
                    currentModelsContainer.innerHTML = newModelsContainer.innerHTML;
                }
                
                // Update pagination info
                const newPagination = tempDiv.querySelector('.pagination-container');
                const currentPagination = document.querySelector('.pagination-container');
                
                if (newPagination && currentPagination) {
                    currentPagination.innerHTML = newPagination.innerHTML;
                }
                
                setTimeout(resolve, 1000);
            })
            .catch(error => {
                console.error('Navigation error:', error);
                reject(error);
            });
        }
    });
}

// Helper function to wait for elements
function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }

        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }, timeout);
    });
}