const fs = require('fs');

// Function to find the most recent CSV file
function findMostRecentCSV() {
    const files = fs.readdirSync('.')
        .filter(file => file.startsWith('bbb_scrape_progress_') && file.endsWith('.csv'))
        .map(file => ({
            name: file,
            time: fs.statSync(file).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);
    
    return files.length > 0 ? files[0].name : null;
}

// Function to extract business data from CSV content
function extractBusinessData(csvContent) {
    const lines = csvContent.split('\n');
    if (lines.length < 2) {
        throw new Error('CSV file is empty or has no data rows');
    }
    
    // Parse header
    const headers = lines[0].split(',').map(h => h.trim());
    console.log('Found headers:', headers);
    
    const businesses = new Map();
    
    // Process each line
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Split the line, handling quoted values
        const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
        if (values.length < headers.length - 1) { // -1 for timestamp
            console.log(`Skipping line ${i + 1}: Invalid number of columns`);
            continue;
        }
        
        // Create business object
        const business = {};
        headers.forEach((header, index) => {
            let value = values[index] || '';
            // Remove quotes and clean the value
            value = value.replace(/^"|"$/g, '').trim();
            business[header] = value;
        });
        
        // Validate business data
        if (business['Company Name'] &&
            typeof business['Company Name'] === 'string' &&
            !business['Company Name'].includes('undefined') &&
            !business['Company Name'].includes('obj') &&
            !business['Company Name'].includes('%') &&
            !business['Company Name'].includes('<<') &&
            business['Company Name'].length > 0 &&
            /^[\x20-\x7E]+$/.test(business['Company Name'])) { // Only allow printable ASCII characters
            
            const key = `${business['Company Name']}|${business['City']}`;
            if (!businesses.has(key)) {
                businesses.set(key, business);
            }
        }
    }
    
    return Array.from(businesses.values());
}

try {
    // Read the CSV file that we know contains valid data
    const csvFile = 'bbb_scrape_progress_1743824900416.csv';
    console.log(`Reading CSV file: ${csvFile}`);
    const csvContent = fs.readFileSync(csvFile, 'utf8');
    
    // Extract business data
    const businesses = extractBusinessData(csvContent);
    
    if (businesses.length === 0) {
        console.error('No valid business data found');
        process.exit(1);
    }
    
    // Create CSV header
    const headers = ['Company Name', 'City', 'Search Term', 'Phone', 'Address', 'Years in Business', 'Owner', 'Website'];
    const csvRows = [headers.join(',')];
    
    // Add business data rows
    businesses.forEach(business => {
        const row = headers.map(header => {
            const value = business[header] || '';
            // Escape commas and quotes in the value
            return `"${value.replace(/"/g, '""')}"`;
        });
        csvRows.push(row.join(','));
    });
    
    // Write to CSV file
    fs.writeFileSync('clean_business_data.csv', csvRows.join('\n'));
    
    console.log(`Successfully extracted ${businesses.length} unique businesses`);
    console.log('\nFirst three entries:');
    console.log(JSON.stringify(businesses.slice(0, 3), null, 2));
    
} catch (error) {
    console.error('Error:', error);
    process.exit(1);
} 