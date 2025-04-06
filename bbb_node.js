const puppeteer = require('puppeteer');
const fs = require('fs-extra');

// ----- Fixed Parameters -----
const MAX_PAGES = 25;         // Cap each search to 25 pages
const MIN_YEARS = 10;         // Minimum years in business required
const PAGE_TIMEOUT = 30000;   // Increased from 15000 to 30000ms
const MAX_RETRIES = 3;        // Increased retries

// Remaining Idaho cities
const cities = [
    "Twin Falls, ID",
    "Pocatello, ID",
    "Caldwell, ID",
    "Coeur d'Alene, ID",
    "Post Falls, ID",
    "Lewiston, ID"
];

// Search terms
const searchTerms = [
    "tree service",
    "landscaping",
    "hardscaping",
    "irrigation"
];

// Track processed URLs to avoid duplicates
const processedUrls = new Set();

// Load previously processed URLs if exists
try {
    const processed = fs.readFileSync('processed_urls.json', 'utf8');
    const urls = JSON.parse(processed);
    urls.forEach(url => processedUrls.add(url));
    console.log(`Loaded ${processedUrls.size} previously processed URLs`);
} catch (err) {
    console.log('No previous URL cache found, starting fresh');
}

// Save processed URLs periodically
function saveProcessedUrls() {
    const urls = Array.from(processedUrls);
    fs.writeFileSync('processed_urls.json', JSON.stringify(urls), 'utf8');
    console.log(`Saved ${urls.length} processed URLs to cache`);
}

// ----- Helper Functions -----
// Synchronously write CSV data and force flush to disk.
function writeCSV(filename, results) {
    const header = 'Company Name,Phone,Address,Years in Business,Owner,Website,Search Term,City\n';
    const lines = results.map(r =>
        `"${r.name}","${r.phone}","${r.address}","${r.yearsInBusiness}","${r.owner}","${r.website}","${r.searchTerm}","${r.city}"`
    ).join('\n');
    const data = header + lines;
    const fd = fs.openSync(filename, 'w');
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    console.log(`Saved ${results.length} results to ${filename}`);
}

// Save partial results.
function savePartialResults(results) {
    const timestamp = Date.now();
    writeCSV(`bbb_scrape_progress_${timestamp}.csv`, results);
    saveProcessedUrls();
}

// Quick check if a URL is an ad
function isAdUrl(url) {
    return url.includes('doubleclick.net') || url.includes('adclick') || url.includes('google.com');
}

// Wrap page.goto with extended timeout and retry logic.
async function safeGoto(page, url, options, retries = MAX_RETRIES) {
    if (isAdUrl(url)) {
        console.log('⏩ Skipping advertisement URL');
        return false;
    }

    const extendedOptions = Object.assign({}, options, { timeout: PAGE_TIMEOUT });
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await page.goto(url, extendedOptions);
            // Add a small delay after successful navigation
            await new Promise(resolve => setTimeout(resolve, 1000));
            return true;
        } catch (err) {
            if (attempt < retries) {
                console.log(`Error navigating to ${url}, attempt ${attempt}: ${err.message}`);
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            } else {
                console.log(`Failed to navigate to ${url} after ${retries} attempts: ${err.message}`);
                return false;
            }
        }
    }
    return false;
}

// ----- Business Detail Scraping -----
// Processes one business detail page sequentially.
async function scrapeBusinessSequential(page, link) {
  // Skip if already processed
  if (processedUrls.has(link)) {
    console.log(`⏩ Skipping already processed business: ${link}`);
    return null;
  }

  try {
    console.log(`Visiting business detail: ${link}`);
    const success = await safeGoto(page, link, { waitUntil: 'networkidle0' });
    if (!success) return null;

    // Quick check for years in business before full scrape
    const yearsText = await page.evaluate(() => {
      const pElements = document.querySelectorAll('p.bds-body');
      for (const p of pElements) {
        if (p.innerText.includes('Years in Business:')) {
          return p.innerText.replace('Years in Business:', '').trim();
        }
      }
      return '';
    });

    const years = parseInt(yearsText);
    if (isNaN(years) || years < MIN_YEARS) {
      console.log(`⏩ Quick skip: Insufficient years (${yearsText})`);
      processedUrls.add(link);
      return null;
    }

    const business = await page.evaluate(() => {
      const getText = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.innerText.trim() : '';
      };
      const name = getText('span.bpr-header-business-name#businessName');
      const phone = getText('a[href^="tel:"]');
      let address = '';
      const addrContainer = document.querySelector('div.bpr-overview-address');
      if (addrContainer) {
        const ps = addrContainer.querySelectorAll('p.bds-body');
        if (ps.length >= 2) {
          address = ps[1].innerText.trim();
        }
      }
      let yearsInBusiness = '';
      const pElements = document.querySelectorAll('p.bds-body');
      pElements.forEach(p => {
        if (p.innerText.includes('Years in Business:')) {
          yearsInBusiness = p.innerText.replace('Years in Business:', '').trim();
        }
      });
      let owner = '';
      const detailDivs = document.querySelectorAll('div.bpr-details-dl-data[data-type="on-separate-lines"]');
      detailDivs.forEach(div => {
        const dt = div.querySelector('dt');
        const dd = div.querySelector('dd');
        if (dt && dt.innerText.includes('Business Management:') && dd) {
          owner = dd.innerText.trim();
        }
      });
      let website = '';
      const headerContact = document.querySelector('div.bpr-header-contact');
      if (headerContact) {
        const headerLinks = headerContact.querySelectorAll('a');
        headerLinks.forEach(link => {
          if (link.innerText.includes('Visit Website')) {
            website = link.href;
          }
        });
      }
      return { name, phone, address, yearsInBusiness, owner, website };
    });
    
    if (!business.phone) {
      console.log(`⏩ Skipping business because phone number is missing.`);
      processedUrls.add(link);
      return null;
    }

    console.log(`✅ Scraped: ${business.name}`);
    processedUrls.add(link);
    return business;
  } catch (err) {
    console.log(`❌ Error scraping ${link}: ${err.message}`);
    return null;
  }
}

// ----- Search Scraping Function -----
async function scrapeSearch(term, city, browser) {
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36");
  
  // Set request interception to block ads and unnecessary resources
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (
      request.resourceType() === 'image' ||
      request.resourceType() === 'stylesheet' ||
      request.resourceType() === 'font' ||
      request.url().includes('doubleclick.net') ||
      request.url().includes('google-analytics') ||
      request.url().includes('facebook')
    ) {
      request.abort();
    } else {
      request.continue();
    }
  });
  
  const firstPageUrl = `https://www.bbb.org/search?find_text=${encodeURIComponent(term)}&find_loc=${encodeURIComponent(city)}&page=1`;
  console.log(`Visiting first listing page for "${term}" in ${city}: ${firstPageUrl}`);
  
  const success = await safeGoto(page, firstPageUrl, { waitUntil: 'networkidle0' });
  if (!success) {
    await page.close();
    return [];
  }
  
  let availablePages = MAX_PAGES;
  try {
    const pages = await page.$$eval('ul li a', links => {
      return links.map(link => {
        let text = "";
        link.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent;
          }
        });
        return parseInt(text.trim());
      }).filter(num => !isNaN(num));
    });
    if (pages.length > 0) {
      availablePages = Math.min(Math.max(...pages), MAX_PAGES);
    } else {
      availablePages = 1;
    }
    console.log(`Maximum available page for "${term}" in ${city}: ${availablePages}`);
  } catch (e) {
    console.log("Could not determine maximum page number. Defaulting to 1.");
    availablePages = 1;
  }
  
  let results = [];
  for (let pageNum = 1; pageNum <= availablePages; pageNum++) {
    const url = `https://www.bbb.org/search?find_text=${encodeURIComponent(term)}&find_loc=${encodeURIComponent(city)}&page=${pageNum}`;
    console.log(`Visiting listing page: ${url}`);
    
    const success = await safeGoto(page, url, { waitUntil: 'networkidle0' });
    if (!success) continue;

    try {
      await page.waitForSelector('div.card.result-card', { timeout: PAGE_TIMEOUT });
    } catch (e) {
      console.log("Could not find search result elements on page.");
      continue;
    }

    const businessLinks = await page.$$eval(
      'div.card.result-card h3.result-business-name a',
      links => links.map(link =>
        link.href.startsWith('http')
          ? link.href
          : `https://www.bbb.org${link.getAttribute('href')}`
      )
    );

    // Filter out already processed links
    const newLinks = businessLinks.filter(link => !processedUrls.has(link));
    console.log(`Found ${businessLinks.length} businesses on page ${pageNum}, ${newLinks.length} new to process`);
    
    for (let link of newLinks) {
      const biz = await scrapeBusinessSequential(page, link);
      if (biz) {
        biz.searchTerm = term;
        biz.city = city;
        results.push(biz);
      }
    }

    // Save progress every page
    if (results.length > 0 && pageNum % 2 === 0) {
      savePartialResults(results);
    }
  }
  await page.close();
  return results;
}

// ----- Massive Search Execution: One Browser Instance per City -----  
(async () => {
    console.log(`Fixed parameters: MAX_PAGES=${MAX_PAGES}, MIN_YEARS=${MIN_YEARS}, required field: phone.`);
    
    let aggregatedResults = [];
    
    // Load existing results if any
    try {
        const files = fs.readdirSync('.')
            .filter(f => f.startsWith('bbb_scrape_progress_'))
            .sort((a, b) => b.localeCompare(a));
        
        if (files.length > 0) {
            const latestFile = files[0];
            console.log(`Loading existing results from ${latestFile}`);
            const content = fs.readFileSync(latestFile, 'utf8');
            const lines = content.split('\n').slice(1); // Skip header
            aggregatedResults = lines
                .filter(line => line.trim()) // Skip empty lines
                .map(line => {
                    const [name, phone, address, yearsInBusiness, owner, website, searchTerm, city] = line.split(',').map(s => s.replace(/^"|"$/g, ''));
                    return { name, phone, address, yearsInBusiness, owner, website, searchTerm, city };
                });
            console.log(`Loaded ${aggregatedResults.length} existing results`);
        }
    } catch (err) {
        console.log('No existing results found, starting fresh');
    }
    
    // Process each city one at a time using its own browser instance.
    for (let city of cities) {
        console.log(`\n=== Starting search for city "${city}" ===`);
        let cityResults = [];
        let browser = null;
        try {
            browser = await puppeteer.launch({
                headless: true,
                protocolTimeout: 180000,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920x1080'
                ]
            });
            
            for (let term of searchTerms) {
                console.log(`\n--- Searching for term "${term}" in ${city} ---`);
                try {
                    const results = await scrapeSearch(term, city, browser);
                    console.log(`Finished search for term "${term}" in ${city}. Found ${results.length} results.`);
                    cityResults = cityResults.concat(results);
                    
                    // Save progress after each search term
                    aggregatedResults = aggregatedResults.concat(results);
                    savePartialResults(aggregatedResults);
                } catch (err) {
                    console.log(`Error processing search for term "${term}" in ${city}: ${err.message}`);
                }
                
                // Add delay between search terms
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } catch (err) {
            console.log(`Global error for ${city}: ${err.message}`);
        } finally {
            if (browser) {
                await browser.close();
            }
        }
        
        // Save progress after each city
        savePartialResults(aggregatedResults);
        console.log(`Partial results saved after finishing ${city}. Total: ${aggregatedResults.length}`);
        
        // Short delay between cities
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
    
    writeCSV(`bbb_scrape_final_${Date.now()}.csv`, aggregatedResults);
    console.log(`🎉 Final results saved. Total aggregated results: ${aggregatedResults.length}`);
})();

// Global error handling.
process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.log('Uncaught Exception:', err);
});

// BBB Scraping functionality for browser
class BBBScraper {
    constructor(minYears, requiredFields) {
        this.minYears = minYears || 10;
        this.requiredFields = requiredFields || ['phone'];
    }

    async searchBusinesses(city, term) {
        // For testing, return mock data immediately
        console.log(`Searching ${term} in ${city} (mock data)`);
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

// Make BBBScraper available to the web worker
self.BBBScraper = BBBScraper; 