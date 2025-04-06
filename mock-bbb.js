// Mock BBB data generator
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

// Make MockBBBScraper available to the web worker
self.MockBBBScraper = MockBBBScraper; 