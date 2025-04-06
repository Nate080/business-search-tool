// Combined mock data generator and web worker
class MockBBBScraper {
    constructor(minYears, requiredFields) {
        this.minYears = minYears || 10;
        this.requiredFields = requiredFields || ['phone'];
    }

    async searchBusinesses(city, term) {
        // Generate and return mock data
        console.log(`[Mock] Searching ${term} in ${city}`);
        return this.getMockData(city, term);
    }

    validateBusiness(business) {
        // Check years in business
        const years = parseInt(business.yearsInBusiness);
        if (isNaN(years) || years < this.minYears) {
            return false;
        }

        // Check required fields
        for (const field of this.requiredFields) {
            if (!business[field]) {
                return false;
            }
        }

        return true;
    }

    getMockData(city, term) {
        const results = [];
        // Generate 5-10 random results
        const numResults = Math.floor(Math.random() * 6) + 5;
        
        for (let i = 1; i <= numResults; i++) {
            const years = Math.floor(Math.random() * 20) + 10; // 10-30 years
            results.push({
                name: `${term} Company ${i} of ${city}`,
                city: city,
                searchTerm: term,
                phone: `(${Math.floor(Math.random() * 900) + 100}) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
                address: `${Math.floor(Math.random() * 9999) + 1} Business Ave, ${city}`,
                yearsInBusiness: String(years),
                owner: `Owner ${i}`,
                website: `www.example${i}.com`,
                isMatch: true
            });
        }
        
        // Add a small delay to simulate network request
        return new Promise(resolve => {
            setTimeout(() => resolve(results), 500);
        });
    }
}

// Web Worker state
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
        // Initialize mock BBB scraper
        const scraper = new MockBBBScraper(minYears, requiredFields);
        
        for (let city of cities) {
            for (let term of terms) {
                try {
                    console.log(`Processing ${term} in ${city}...`);
                    
                    // Get mock data for this city/term combination
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
                    console.error(`Error processing ${term} in ${city}:`, error);
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