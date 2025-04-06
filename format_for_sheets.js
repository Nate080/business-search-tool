const fs = require('fs');

try {
    // Read the combined CSV file
    const content = fs.readFileSync('idaho_businesses_combined.csv', 'utf8');
    const lines = content.split('\n');
    
    // Create TSV content (tab-separated)
    const tsvLines = lines.map(line => {
        // Parse CSV values, handling quotes properly
        const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
        return values.map(value => {
            // Remove quotes and clean the value
            value = value.replace(/^"|"$/g, '').trim();
            // Replace any tabs with spaces to prevent format issues
            value = value.replace(/\t/g, ' ');
            return value;
        }).join('\t');
    });
    
    // Write to both TSV and TXT files for flexibility
    fs.writeFileSync('idaho_businesses_for_sheets.tsv', tsvLines.join('\n'));
    fs.writeFileSync('idaho_businesses_for_sheets.txt', tsvLines.join('\n'));
    
    console.log('Files created:');
    console.log('1. idaho_businesses_for_sheets.tsv');
    console.log('2. idaho_businesses_for_sheets.txt');
    console.log('\nBoth files contain the same data in a tab-separated format that you can easily copy and paste into Google Sheets.');
    console.log('\nTo use:');
    console.log('1. Open either file');
    console.log('2. Select all (Ctrl+A)');
    console.log('3. Copy (Ctrl+C)');
    console.log('4. Paste into Google Sheets (Ctrl+V)');
    console.log('\nFirst few entries for verification:');
    console.log('----------------------------------------');
    console.log(tsvLines.slice(0, 5).join('\n'));
    
} catch (error) {
    console.error('Error:', error);
    process.exit(1);
} 