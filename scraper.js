const puppeteer = require('puppeteer');

// Helper function for delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function searchBusinesses(city, businessType) {
    let browser = null;
    try {
        console.log('Starting search for:', { city, businessType });
        
        // Launch browser with additional settings
        browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--window-size=1920,1080',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ],
            defaultViewport: {
                width: 1920,
                height: 1080
            }
        });
        
        const page = await browser.newPage();
        
        // Enable request interception
        await page.setRequestInterception(true);
        
        // Log all requests
        page.on('request', request => {
            console.log('Request:', request.url());
            request.continue();
        });
        
        // Set a more realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        // Modify navigator.webdriver flag and add other evasion
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
        
        console.log('Navigating to BBB homepage...');
        
        // Navigate to BBB homepage
        await page.goto('https://www.bbb.org/', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });
        
        console.log('Waiting for page to fully load...');
        await delay(5000);
        
        // Debug: Log the current page content
        const pageContent = await page.content();
        console.log('Page HTML:', pageContent);
        
        // Debug: Log all input elements
        const inputs = await page.evaluate(() => {
            const allInputs = document.querySelectorAll('input');
            return Array.from(allInputs).map(input => ({
                type: input.type,
                placeholder: input.placeholder,
                name: input.name,
                id: input.id,
                'aria-label': input.getAttribute('aria-label'),
                class: input.className
            }));
        });
        console.log('Available inputs:', JSON.stringify(inputs, null, 2));
        
        // Try to find any search-related element
        const searchElements = await page.evaluate(() => {
            const elements = document.querySelectorAll('*');
            const searchRelated = Array.from(elements).filter(el => {
                const text = (el.textContent || '').toLowerCase();
                const attrs = Array.from(el.attributes || []).map(attr => attr.value.toLowerCase());
                return text.includes('search') || 
                       text.includes('find') || 
                       attrs.some(attr => attr.includes('search') || attr.includes('find'));
            });
            return searchRelated.map(el => ({
                tag: el.tagName,
                text: el.textContent,
                attrs: Array.from(el.attributes).map(attr => `${attr.name}="${attr.value}"`)
            }));
        });
        console.log('Search-related elements:', JSON.stringify(searchElements, null, 2));
        
        // Try keyboard navigation
        await page.keyboard.press('Tab'); // Focus first interactive element
        await delay(500);
        
        // Press Tab multiple times to try to find search inputs
        for (let i = 0; i < 10; i++) {
            const focused = await page.evaluate(() => {
                const el = document.activeElement;
                return {
                    tag: el.tagName,
                    type: el.type,
                    placeholder: el.placeholder,
                    value: el.value,
                    'aria-label': el.getAttribute('aria-label')
                };
            });
            console.log('Focused element:', focused);
            
            // If we find a search input, use it
            if (focused.type === 'search' || 
                focused.placeholder?.toLowerCase().includes('search') || 
                focused['aria-label']?.toLowerCase().includes('search')) {
                console.log('Found search input!');
                await page.keyboard.type(businessType);
                break;
            }
            
            await page.keyboard.press('Tab');
            await delay(200);
        }
        
        // Try to find and click any visible search button
        const buttons = await page.evaluate(() => {
            const allButtons = document.querySelectorAll('button, input[type="submit"], a[role="button"]');
            return Array.from(allButtons)
                .filter(btn => {
                    const rect = btn.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                })
                .map(btn => ({
                    tag: btn.tagName,
                    text: btn.textContent,
                    type: btn.type,
                    visible: true,
                    attrs: Array.from(btn.attributes).map(attr => `${attr.name}="${attr.value}"`)
                }));
        });
        console.log('Available buttons:', JSON.stringify(buttons, null, 2));
        
        // Keep the browser open for manual inspection
        console.log('Browser kept open for debugging. Please check the page structure.');
        await delay(300000); // Keep open for 5 minutes
        
    } catch (error) {
        console.error('Search error:', error);
        throw error;
    } finally {
        if (browser) {
            // Keep browser open for debugging
            // await browser.close();
            console.log('Browser kept open for debugging');
        }
    }
}

// Example usage
async function main() {
    try {
        const businesses = await searchBusinesses('Boise, ID', 'Restaurant');
        console.log('Results:', JSON.stringify(businesses, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

main(); 