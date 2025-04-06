require('dotenv').config();
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const rateLimit = require('express-rate-limit');
const app = express();

// Enable detailed error logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// CORS configuration
app.use(cors({
    origin: '*', // Allow all origins for debugging
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    optionsSuccessStatus: 200
}));

// Add error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
    });
});

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
        const { businessType, city, minYearsInBusiness, requirePhone } = req.body;
        
        console.log('Starting search for:', { businessType, city, minYearsInBusiness, requirePhone });
        
        // Launch browser with production-ready configuration
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions'
            ]
        });
        
        const page = await browser.newPage();
        
        // Set a reasonable viewport
        await page.setViewport({
            width: 1280,
            height: 800
        });
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        // Enable request interception to block unnecessary resources
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
                request.abort();
            } else {
                request.continue();
            }
        });
        
        console.log('Navigating to BBB search page...');
        
        // Navigate to BBB search page with error handling
        try {
            await page.goto('https://www.bbb.org/', {
                waitUntil: 'networkidle0',
                timeout: 30000
            });
        } catch (error) {
            console.error('Navigation error:', error);
            throw new Error('Failed to load BBB website');
        }
        
        // Wait for and fill search form
        try {
            await page.waitForSelector('#bbb-search-query', { timeout: 10000 });
            await page.type('#bbb-search-query', businessType, { delay: 50 });
            
            await page.waitForSelector('#bbb-search-location', { timeout: 10000 });
            await page.$eval('#bbb-search-location', el => el.value = '');
            await page.type('#bbb-search-location', city, { delay: 50 });
            
            await page.waitForSelector('button[data-testid="search-button"]', { timeout: 10000 });
            await Promise.all([
                page.click('button[data-testid="search-button"]'),
                page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 })
            ]);
        } catch (error) {
            console.error('Search form error:', error);
            throw new Error('Failed to submit search form');
        }
        
        console.log('On results page, extracting business data...');
        
        // Extract business data with error handling
        try {
            await page.waitForSelector('[data-testid="search-result-list"]', { timeout: 30000 });
            
            const businesses = await page.evaluate(() => {
                const results = [];
                const items = document.querySelectorAll('[data-testid="search-result-list"] > div');
                
                items.forEach(item => {
                    const nameElement = item.querySelector('[data-testid="business-name"]');
                    if (!nameElement) return;
                    
                    const addressElement = item.querySelector('[data-testid="address"]');
                    const phoneElement = item.querySelector('[data-testid="phone-number"]');
                    const ratingElement = item.querySelector('[data-testid="rating"]');
                    const yearsElement = item.querySelector('[data-testid="years-in-business"]');
                    
                    const years = yearsElement ? 
                        parseInt(yearsElement.textContent.match(/\d+/)?.[0] || '0') : 0;
                    
                    if (!minYearsInBusiness || years >= minYearsInBusiness) {
                        results.push({
                            name: nameElement.textContent.trim(),
                            address: addressElement ? addressElement.textContent.trim() : '',
                            phone: phoneElement ? phoneElement.textContent.trim() : '',
                            rating: ratingElement ? ratingElement.textContent.trim() : '',
                            yearsInBusiness: years
                        });
                    }
                });
                
                return results;
            });
            
            console.log(`Found ${businesses.length} businesses`);
            
            // Filter results
            const filteredBusinesses = businesses.filter(business => {
                if (requirePhone && !business.phone) return false;
                return true;
            });
            
            console.log(`Returning ${filteredBusinesses.length} filtered businesses`);
            
            res.json(filteredBusinesses);
        } catch (error) {
            console.error('Data extraction error:', error);
            throw new Error('Failed to extract business data');
        }
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