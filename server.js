const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Rate limiting to prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);

// Helper function for delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Validate numeric inputs
function validateNumber(input, defaultValue) {
    const num = parseInt(input, 10);
    if (isNaN(num) || num < 1) {
        return defaultValue;
    }
    return num;
}

// Helper function for navigation with retry logic
async function safeGoto(page, url, options, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await page.goto(url, options);
            return;
        } catch (err) {
            if (err.message.includes('net::ERR_NETWORK_CHANGED') && attempt < retries) {
                console.log(`Network error at ${url}, retrying attempt ${attempt}...`);
                await delay(3000);
            } else {
                throw err;
            }
        }
    }
}

// Business scraping function with improved error handling
async function scrapeBusinessSequential(page, link, minYears, requireAllFields) {
    try {
        console.log(`Visiting business detail: ${link}`);
        await safeGoto(page, link, { waitUntil: 'networkidle0', timeout: 30000 });
        
        // Wait for the business name with a more flexible selector
        await page.waitForSelector('span.bpr-header-business-name#businessName, h1[class*="business-name"]', { 
            timeout: 15000 
        });
        
        const business = await page.evaluate(() => {
            const getText = (selector) => {
                const el = document.querySelector(selector);
                return el ? el.innerText.trim() : '';
            };

            // More flexible selectors
            const nameSelectors = ['span.bpr-header-business-name#businessName', 'h1[class*="business-name"]'];
            const name = nameSelectors.map(s => getText(s)).find(t => t) || '';

            const phoneSelectors = ['a[href^="tel:"]', '[class*="phone"]'];
            const phone = phoneSelectors.map(s => getText(s)).find(t => t) || '';

            let address = '';
            const addrContainer = document.querySelector('div.bpr-overview-address, [class*="address"]');
            if (addrContainer) {
                const ps = addrContainer.querySelectorAll('p.bds-body, [class*="address"]');
                if (ps.length >= 2) {
                    address = ps[1].innerText.trim();
                } else if (ps.length === 1) {
                    address = ps[0].innerText.trim();
                }
            }

            let yearsInBusiness = '';
            const yearSelectors = [
                'p:contains("Years in Business")',
                '[class*="years"]',
                '[class*="established"]'
            ];
            for (const selector of yearSelectors) {
                const el = document.querySelector(selector);
                if (el && el.textContent.includes('Year')) {
                    yearsInBusiness = el.textContent.replace(/.*?(\d+).*/, '$1').trim();
                    break;
                }
            }

            let owner = '';
            const ownerSelectors = [
                'div.bpr-details-dl-data[data-type="on-separate-lines"] dt:contains("Business Management")',
                '[class*="owner"]',
                '[class*="management"]'
            ];
            for (const selector of ownerSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    const dd = el.nextElementSibling;
                    if (dd) {
                        owner = dd.textContent.trim();
                        break;
                    }
                }
            }

            let website = '';
            const websiteSelectors = [
                'a[href*="://"][target="_blank"]',
                'a:contains("Visit Website")',
                '[class*="website"] a'
            ];
            for (const selector of websiteSelectors) {
                const el = document.querySelector(selector);
                if (el && !el.href.includes('bbb.org')) {
                    website = el.href;
                    break;
                }
            }

            return {
                name,
                phone,
                address,
                yearsInBusiness,
                owner,
                website,
            };
        });

        // Filtering based on minimum years and required fields
        const years = parseInt(business.yearsInBusiness);
        if (isNaN(years) || years < minYears) {
            console.log(`⏩ Skipping ${business.name} (Years: ${business.yearsInBusiness})`);
            return null;
        }
        if (requireAllFields && (!business.name || !business.phone || !business.address || !business.yearsInBusiness || !business.owner || !business.website)) {
            console.log(`⏩ Skipping ${business.name} due to missing fields.`);
            return null;
        }
        console.log(`✅ Scraped: ${business.name}`);
        return business;
    } catch (err) {
        console.log(`❌ Error scraping ${link}: ${err.message}`);
        return null;
    }
}

app.post('/api/search', async (req, res) => {
    const {
        industry,
        location,
        pages = 1,
        minYears = 10,
        requireAllFields = false
    } = req.body;

    let browser = null;
    try {
        // Launch browser with improved settings
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--window-size=1920,1080'
            ],
            defaultViewport: {
                width: 1920,
                height: 1080
            }
        });

        const page = await browser.newPage();
        
        // Set a more realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // Add more evasion techniques
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            window.chrome = {
                runtime: {},
                app: {},
                loadTimes: () => {},
                csi: () => {},
                webstore: {}
            };
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
        });

        const results = [];
        const numPages = validateNumber(pages, 1);
        const validMinYears = validateNumber(minYears, 10);

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const url = `https://www.bbb.org/search?find_text=${encodeURIComponent(industry)}&find_loc=${encodeURIComponent(location)}&page=${pageNum}`;
            console.log(`Visiting listing page: ${url}`);
            
            await safeGoto(page, url, { waitUntil: 'networkidle0', timeout: 30000 });
            
            try {
                // More flexible selector for business cards
                await page.waitForSelector('div.card.result-card, [class*="business-card"], [class*="search-result"]', { 
                    timeout: 30000 
                });
            } catch (e) {
                console.log("Could not find search result elements on page.");
                continue;
            }

            // More flexible selector for business links
            const businessLinks = await page.$$eval(
                'div.card.result-card h3.result-business-name a, [class*="business-card"] a, [class*="search-result"] a[href*="/profile/"]',
                links => links.map(link =>
                    link.href.startsWith('http')
                        ? link.href
                        : `https://www.bbb.org${link.getAttribute('href')}`
                )
            );

            console.log(`Found ${businessLinks.length} businesses on page ${pageNum}`);

            for (let link of businessLinks) {
                const business = await scrapeBusinessSequential(page, link, validMinYears, requireAllFields);
                if (business) {
                    results.push(business);
                }
                // Add a small delay between requests
                await delay(Math.random() * 1000 + 500);
            }

            // Add a random delay between pages
            if (pageNum < numPages) {
                await delay(Math.random() * 2000 + 1000);
            }
        }

        res.json(results);

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (browser) {
            await browser.close();
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