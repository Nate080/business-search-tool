// Import the scraping functionality
importScripts('bbb.js');

// Web Worker for handling BBB searches (mock data only)
let startTime;
let searchConfig;
let results = [];
let processedCombos = 0;
let totalCombos = 0;

self.onmessage = async function(e) {
    const { type, data } = e.data;
    
    if (type === 'start') {
        startTime = Date.now();
        searchConfig = data.config;
        await startSearch(searchConfig);
    }
};

async function startSearch(config) {
    const { cities, terms, minYears, requiredFields } = config;
    totalCombos = cities.length * terms.length;
    results = [];
    processedCombos = 0;

    try {
        // Initialize BBB scraper
        const scraper = new BBBScraper(minYears, requiredFields);
        
        for (let city of cities) {
            for (let term of terms) {
                try {
                    console.log(`Searching ${term} in ${city}...`);
                    
                    // Use the BBB scraper to search (uses mock data)
                    const businessResults = await scraper.searchBusinesses(city, term);
                    
                    // Filter results based on requirements
                    const validResults = businessResults.filter(business => 
                        scraper.validateBusiness(business)
                    );
                    
                    // Add valid results to our collection
                    results.push(...validResults);
                    
                    processedCombos++;
                    
                    // Calculate elapsed time and estimated time remaining
                    const elapsedMs = Date.now() - startTime;
                    const avgTimePerCombo = elapsedMs / processedCombos;
                    const remainingCombos = totalCombos - processedCombos;
                    const estimatedRemainingMs = avgTimePerCombo * remainingCombos;
                    
                    // Send progress update
                    self.postMessage({
                        type: 'progress',
                        data: {
                            progress: Math.floor((processedCombos / totalCombos) * 100),
                            results: validResults,
                            startTime: startTime,
                            processedCombos,
                            totalCombos,
                            currentCity: city,
                            currentTerm: term,
                            elapsedMs,
                            estimatedRemainingMs,
                            totalResults: results.length
                        }
                    });

                } catch (error) {
                    console.error(`Error searching ${term} in ${city}:`, error);
                }
                
                // Add a small delay between searches
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Send completion message
        self.postMessage({
            type: 'complete',
            data: {
                results: results,
                totalSearched: processedCombos,
                totalResults: results.length,
                elapsedMs: Date.now() - startTime
            }
        });

    } catch (error) {
        self.postMessage({
            type: 'error',
            data: {
                message: error.message,
                processedCombos,
                totalCombos
            }
        });
    }
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