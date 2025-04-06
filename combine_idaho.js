const fs = require('fs');

function findIdahoCSVFiles() {
    return fs.readdirSync('.')
        .filter(file => file.endsWith('.csv'))
        .map(file => ({
            name: file,
            time: fs.statSync(file).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);
}

function extractBusinessData(csvContent) {
    const lines = csvContent.split('\n');
    if (lines.length < 2) {
        return [];
    }
    
    // Parse header
    const headers = lines[0].split(',').map(h => h.trim());
    const businesses = new Map();
    
    // Process each line
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Split the line, handling quoted values
        const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
        if (values.length < headers.length - 1) continue; // -1 for timestamp if present
        
        // Create business object
        const business = {};
        headers.forEach((header, index) => {
            let value = values[index] || '';
            // Remove quotes and clean the value
            value = value.replace(/^"|"$/g, '').trim();
            business[header] = value;
        });
        
        // Only include Idaho businesses
        if (business['City'] && 
            (business['City'].includes(', ID') || business['Address']?.includes(', ID'))) {
            
            // Validate business data
            if (business['Company Name'] &&
                typeof business['Company Name'] === 'string' &&
                !business['Company Name'].includes('undefined') &&
                !business['Company Name'].includes('obj') &&
                !business['Company Name'].includes('%') &&
                !business['Company Name'].includes('<<') &&
                business['Company Name'].length > 0 &&
                /^[\x20-\x7E]+$/.test(business['Company Name'])) {
                
                const key = `${business['Company Name']}|${business['City']}`;
                if (!businesses.has(key)) {
                    businesses.set(key, business);
                }
            }
        }
    }
    
    return Array.from(businesses.values());
}

try {
    const csvFiles = findIdahoCSVFiles();
    console.log(`Found ${csvFiles.length} CSV files`);
    
    let allBusinesses = new Map();
    let processedFiles = 0;
    let totalLinesProcessed = 0;
    
    // Process each CSV file
    for (const file of csvFiles) {
        try {
            console.log(`Processing ${file.name}...`);
            const content = fs.readFileSync(file.name, 'utf8');
            const lines = content.split('\n');
            totalLinesProcessed += lines.length;
            
            const businesses = extractBusinessData(content);
            businesses.forEach(business => {
                const key = `${business['Company Name']}|${business['City']}`;
                if (!allBusinesses.has(key)) {
                    allBusinesses.set(key, business);
                }
            });
            processedFiles++;
            
        } catch (error) {
            console.log(`Error processing ${file.name}: ${error.message}`);
        }
    }
    
    const finalBusinesses = Array.from(allBusinesses.values());
    
    // Create CSV header
    const headers = ['Company Name', 'City', 'Search Term', 'Phone', 'Address', 'Years in Business', 'Owner', 'Website'];
    const csvRows = [headers.join(',')];
    
    // Add business data rows
    finalBusinesses.forEach(business => {
        const row = headers.map(header => {
            const value = business[header] || '';
            // Escape commas and quotes in the value
            return `"${value.replace(/"/g, '""')}"`;
        });
        csvRows.push(row.join(','));
    });
    
    // Write to CSV file
    const outputFile = 'idaho_businesses_combined.csv';
    fs.writeFileSync(outputFile, csvRows.join('\n'));
    
    console.log(`\nProcessing complete:`);
    console.log(`- Processed ${processedFiles} files`);
    console.log(`- Total lines processed: ${totalLinesProcessed}`);
    console.log(`- Found ${finalBusinesses.length} unique Idaho businesses`);
    console.log(`- Saved to: ${outputFile}`);
    
    // Display first few entries as sample
    console.log('\nFirst three entries:');
    console.log(JSON.stringify(finalBusinesses.slice(0, 3), null, 2));
    
} catch (error) {
    console.error('Error:', error);
    process.exit(1);
} 