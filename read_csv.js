const fs = require('fs');

try {
    const csvFile = 'bbb_scrape_progress_1743824900416.csv';
    console.log(`Reading CSV file: ${csvFile}`);
    const content = fs.readFileSync(csvFile, 'utf8');
    
    const lines = content.split('\n');
    console.log('\nFirst 10 lines:');
    lines.slice(0, 10).forEach((line, i) => {
        console.log(`${i + 1}: ${line}`);
    });
    
    console.log(`\nTotal lines: ${lines.length}`);
    
    // Count valid entries (non-empty lines with commas)
    const validLines = lines.filter(line => line.trim() && line.includes(','));
    console.log(`Valid entries: ${validLines.length}`);
    
    // Check for common data patterns
    const hasUndefined = lines.some(line => line.includes('undefined'));
    const hasPdfMarkers = lines.some(line => line.includes('obj') || line.includes('<<'));
    
    if (hasUndefined) console.log('\nWarning: File contains "undefined" values');
    if (hasPdfMarkers) console.log('Warning: File contains PDF markers');
    
} catch (error) {
    console.error('Error:', error);
    process.exit(1);
} 