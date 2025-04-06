// Web Worker for handling BBB searches
let currentSearchId = null;
let searchConfig = null;
let results = [];
let processedCombos = 0;
let totalCombos = 0;

self.onmessage = async function(e) {
    const { type, data } = e.data;
    
    switch (type) {
        case 'start':
            currentSearchId = data.searchId;
            searchConfig = data.config;
            await startSearch();
            break;
        case 'stop':
            // Handle search stopping
            break;
    }
};

async function startSearch() {
    const { cities, terms, minYears, requiredFields } = searchConfig;
    totalCombos = cities.length * terms.length;
    results = [];
    processedCombos = 0;

    for (const city of cities) {
        for (const term of terms) {
            try {
                const cityResults = await searchCityTerm(city, term);
                results.push(...cityResults);
                processedCombos++;
                
                // Report progress
                const progress = (processedCombos / totalCombos) * 100;
                self.postMessage({
                    type: 'progress',
                    data: {
                        progress,
                        results: cityResults,
                        city,
                        term
                    }
                });
                
                // Small delay to prevent overwhelming the BBB server
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.error(`Error searching ${city} for ${term}:`, error);
                self.postMessage({
                    type: 'error',
                    data: {
                        city,
                        term,
                        error: error.message
                    }
                });
            }
        }
    }

    // Search complete
    self.postMessage({
        type: 'complete',
        data: {
            results,
            totalBusinesses: results.length
        }
    });
}

async function searchCityTerm(city, term) {
    const { minYears, requiredFields } = searchConfig;
    const results = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages && page <= 25) { // Limit to 25 pages per search
        try {
            const url = `https://www.bbb.org/search?find_text=${encodeURIComponent(term)}&find_loc=${encodeURIComponent(city)}&page=${page}`;
            const response = await fetch(url);
            const html = await response.text();
            
            // Parse businesses from the page
            const businesses = parseBusinessListings(html);
            if (businesses.length === 0) {
                hasMorePages = false;
                continue;
            }

            // Process each business
            for (const business of businesses) {
                if (await isValidBusiness(business, minYears, requiredFields)) {
                    results.push({
                        ...business,
                        searchTerm: term,
                        city
                    });
                }
            }

            page++;
            
            // Small delay between pages
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(`Error on page ${page}:`, error);
            hasMorePages = false;
        }
    }

    return results;
}

function parseBusinessListings(html) {
    // This is a placeholder - actual implementation would parse the HTML
    // and extract business information
    return [];
}

async function isValidBusiness(business, minYears, requiredFields) {
    try {
        const response = await fetch(business.detailUrl);
        const html = await response.text();
        
        // Extract business details
        const details = parseBusinessDetails(html);
        
        // Check years in business
        if (details.yearsInBusiness < minYears) {
            return false;
        }
        
        // Check required fields
        for (const field of requiredFields) {
            if (!details[field]) {
                return false;
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error checking business:', error);
        return false;
    }
}

function parseBusinessDetails(html) {
    // This is a placeholder - actual implementation would parse the HTML
    // and extract detailed business information
    return {
        name: '',
        phone: '',
        address: '',
        yearsInBusiness: 0,
        owner: '',
        website: ''
    };
}

// Helper function to convert results to CSV
function resultsToCSV(results) {
    const headers = [
        'Company Name',
        'City',
        'Search Term',
        'Phone',
        'Address',
        'Years in Business',
        'Owner',
        'Website'
    ];
    
    const rows = results.map(business => [
        business.name,
        business.city,
        business.searchTerm,
        business.phone,
        business.address,
        business.yearsInBusiness,
        business.owner,
        business.website
    ].map(field => `"${(field || '').replace(/"/g, '""')}"`).join(','));
    
    return [headers.join(','), ...rows].join('\n');
} 