require('dotenv').config();
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const rateLimit = require('express-rate-limit');
const app = express();

// Trust proxy - required for Render deployment
app.set('trust proxy', 1);

// Enable detailed error logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// CORS configuration
const corsOptions = {
    origin: ['https://nate080.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 204
};

// Apply CORS middleware first
app.use(cors(corsOptions));

// Additional CORS headers for redundancy
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    // Only set CORS headers if origin matches allowed list
    if (corsOptions.origin.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Origin');
        res.header('Access-Control-Allow-Credentials', 'true');
    }
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    
    next();
});

app.use(express.json());

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        timestamp: new Date().toISOString(),
        origin: req.headers.origin
    });
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 0, // limit each IP in production
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
    // Use forwarded IP from Render's proxy
    keyGenerator: (req) => {
        return req.ip; // Since we set trust proxy, this will use X-Forwarded-For
    }
});

app.use('/api/', limiter);

// Health check endpoint with detailed status
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        cors: {
            origin: req.headers.origin,
            method: req.method
        }
    });
});

// Search endpoint
app.post('/api/search', async (req, res) => {
    let browser = null;
    try {
        const { businessType, city, minYearsInBusiness, requirePhone } = req.body;
        
        console.log('Starting search for:', { businessType, city, minYearsInBusiness, requirePhone });
        
        // Launch browser with system Chrome configuration
        const puppeteerConfig = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions',
                '--window-size=1920,1080',
                '--disable-web-security',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            ],
            ignoreHTTPSErrors: true
        };

        // Use system Chrome if available
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            console.log('Using system Chrome at:', process.env.PUPPETEER_EXECUTABLE_PATH);
            try {
                // Check if Chrome exists
                const fs = require('fs');
                if (fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
                    puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
                    console.log('Chrome executable found at specified path');
                } else {
                    console.error('Chrome executable not found at:', process.env.PUPPETEER_EXECUTABLE_PATH);
                    throw new Error('Chrome executable not found');
                }
            } catch (error) {
                console.error('Error checking Chrome executable:', error);
                throw error;
            }
        } else {
            console.log('No system Chrome path specified, using bundled Chromium');
        }
        
        console.log('Launching browser with config:', JSON.stringify(puppeteerConfig, null, 2));
        try {
            browser = await puppeteer.launch(puppeteerConfig);
            const version = await browser.version();
            console.log('Browser version:', version);
        } catch (error) {
            console.error('Browser launch error:', error);
            throw new Error(`Failed to launch browser: ${error.message}`);
        }
        
        const page = await browser.newPage();
        
        // Set a reasonable viewport
        await page.setViewport({
            width: 1920,
            height: 1080
        });
        
        // Set cookies and localStorage to appear more like a real browser
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
        });
        
        // Enable request interception
        await page.setRequestInterception(true);
        
        // Handle different types of requests
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            const url = request.url();
            
            // Log important requests
            if (resourceType === 'xhr' || resourceType === 'fetch') {
                console.log(`Making ${resourceType} request to:`, url);
            }
            
            // Block unnecessary resources
            if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
                request.abort();
            } else {
                request.continue();
            }
        });
        
        // Log console messages from the page
        page.on('console', msg => console.log('Page console:', msg.text()));
        
        console.log('Navigating to BBB search page...');
        
        // Navigate to BBB search page with error handling
        try {
            const response = await page.goto('https://www.bbb.org/', {
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 60000
            });
            
            if (!response.ok()) {
                throw new Error(`Failed to load BBB website: ${response.status()} ${response.statusText()}`);
            }
            
            // Wait for and check if the main content loaded
            const content = await page.content();
            if (!content.includes('bbb-search-query')) {
                throw new Error('BBB search form not found in page content');
            }
        } catch (error) {
            console.error('Navigation error:', error);
            throw new Error('Failed to load BBB website: ' + error.message);
        }
        
        // Wait for and fill search form
        try {
            console.log('Waiting for search form...');
            
            // Wait for both input fields with increased timeout
            await Promise.all([
                page.waitForSelector('#bbb-search-query', { timeout: 30000, visible: true }),
                page.waitForSelector('#bbb-search-location', { timeout: 30000, visible: true })
            ]);
            
            // Type with random delays to appear more human-like
            await page.type('#bbb-search-query', businessType, { delay: Math.floor(Math.random() * 100) + 50 });
            
            // Clear location field and type new location
            await page.$eval('#bbb-search-location', el => el.value = '');
            await page.type('#bbb-search-location', city, { delay: Math.floor(Math.random() * 100) + 50 });
            
            // Wait a bit before clicking (like a human would)
            await page.waitForTimeout(Math.random() * 1000 + 500);
            
            console.log('Submitting search...');
            const searchButton = await page.waitForSelector('button[data-testid="search-button"]', { timeout: 30000, visible: true });
            
            // Click the button and wait for navigation
            await Promise.all([
                searchButton.click(),
                page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 })
            ]);
            
            // Verify we're on the results page
            const url = page.url();
            if (!url.includes('search?')) {
                throw new Error('Navigation to search results failed');
            }
        } catch (error) {
            console.error('Search form error:', error);
            throw new Error('Failed to submit search form: ' + error.message);
        }
        
        console.log('On results page, extracting business data...');
        
        // Extract business data with error handling
        try {
            await page.waitForSelector('[data-testid="search-result-list"]', { timeout: 60000, visible: true });
            
            const businesses = await page.evaluate((minYearsInBusiness) => {
                const results = [];
                const items = document.querySelectorAll('[data-testid="search-result-list"] > div');
                
                items.forEach(item => {
                    try {
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
                    } catch (error) {
                        console.error('Error extracting business data:', error);
                    }
                });
                
                return results;
            }, minYearsInBusiness);
            
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
            throw new Error('Failed to extract business data: ' + error.message);
        }
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ 
            error: 'Failed to perform search',
            details: error.message,
            timestamp: new Date().toISOString()
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 