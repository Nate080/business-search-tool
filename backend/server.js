require('dotenv').config();
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const rateLimit = require('express-rate-limit');
const app = express();

// CORS configuration
const corsOptions = {
    origin: ['https://nate080.github.io', 'http://localhost:8080'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    credentials: false,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 0, // limit each IP in production
    message: 'Too many requests from this IP, please try again after 15 minutes'
});

app.use('/api/', limiter);

// Search endpoint
app.post('/api/search', async (req, res) => {
    let browser = null;
    try {
        const { city, businessType, minYearsInBusiness, requirePhone } = req.body;
        
        console.log('Starting search for:', { city, businessType, minYearsInBusiness, requirePhone });
        
        // Launch browser with Windows-specific configuration
        browser = await puppeteer.launch({
            headless: false, // Set to false for debugging
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1920,1080'
            ],
            defaultViewport: null
        });
        
        const page = await browser.newPage();
        
        // Log console messages from the page
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        console.log('Navigating to BBB search page...');
        
        // Navigate to BBB search page
        await page.goto('https://www.bbb.org/', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });
        
        // Wait for and click the search box to activate it
        await page.waitForSelector('#bbb-search-query', { timeout: 10000 });
        await page.click('#bbb-search-query');
        
        // Type the business type
        await page.type('#bbb-search-query', businessType, { delay: 100 });
        
        // Wait for and click the location input
        await page.waitForSelector('#bbb-search-location', { timeout: 10000 });
        await page.click('#bbb-search-location');
        
        // Clear any existing location and type the new one
        await page.$eval('#bbb-search-location', el => el.value = '');
        await page.type('#bbb-search-location', city, { delay: 100 });
        
        console.log('Filled in search form, waiting for submit button...');
        
        // Wait for and click the search button
        await page.waitForSelector('button[data-testid="search-button"]', { timeout: 10000 });
        await page.click('button[data-testid="search-button"]');
        
        // Wait for results to load
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
        
        console.log('On results page, waiting for business listings...');
        
        // Wait for business listings to appear
        await page.waitForSelector('[data-testid="search-result-list"]', { timeout: 30000 });
        
        // Extract business data
        const businesses = await page.evaluate(() => {
            const results = [];
            const items = document.querySelectorAll('[data-testid="search-result-list"] > div');
            
            items.forEach(item => {
                // Find business name
                const nameElement = item.querySelector('[data-testid="business-name"]');
                if (!nameElement) return;
                
                // Extract other details
                const addressElement = item.querySelector('[data-testid="address"]');
                const phoneElement = item.querySelector('[data-testid="phone-number"]');
                const ratingElement = item.querySelector('[data-testid="rating"]');
                const yearsElement = item.querySelector('[data-testid="years-in-business"]');
                
                results.push({
                    name: nameElement.textContent.trim(),
                    address: addressElement ? addressElement.textContent.trim() : '',
                    phone: phoneElement ? phoneElement.textContent.trim() : '',
                    rating: ratingElement ? ratingElement.textContent.trim() : '',
                    yearsInBusiness: yearsElement ? 
                        parseInt(yearsElement.textContent.match(/\d+/)?.[0] || '0') : 0
                });
            });
            
            return results;
        });
        
        console.log(`Found ${businesses.length} businesses`);
        
        // Filter results
        const filteredBusinesses = businesses.filter(business => {
            if (requirePhone && !business.phone) return false;
            if (minYearsInBusiness && business.yearsInBusiness < minYearsInBusiness) return false;
            return true;
        });
        
        console.log(`Returning ${filteredBusinesses.length} filtered businesses`);
        
        res.json(filteredBusinesses);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ 
            error: 'Failed to perform search',
            details: error.message
        });
    } finally {
        if (browser) {
            try {
                await browser.close();
                console.log('Browser closed successfully');
            } catch (error) {
                console.error('Error closing browser:', error);
            }
        }
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 