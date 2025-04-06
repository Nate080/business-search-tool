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

try {
    const csvFile = findMostRecentCSV();
    if (!csvFile) {
        console.error('No CSV file found');
        process.exit(1);
    }

    console.log(`Reading CSV file: ${csvFile}`);
    const buffer = fs.readFileSync(csvFile);
    
    // Print first 1000 bytes in hex and ASCII
    console.log('\nFirst 1000 bytes:');
    let hexOutput = '';
    let asciiOutput = '';
    let lineCount = 0;
    
    for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
        const byte = buffer[i];
        hexOutput += byte.toString(16).padStart(2, '0') + ' ';
        asciiOutput += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
        
        if ((i + 1) % 16 === 0 || i === buffer.length - 1) {
            console.log(`${hexOutput.padEnd(48)} | ${asciiOutput}`);
            hexOutput = '';
            asciiOutput = '';
            lineCount++;
            
            if (lineCount >= 20) {
                console.log('...');
                break;
            }
        }
    }
    
    // Print file stats
    const stats = fs.statSync(csvFile);
    console.log(`\nFile size: ${stats.size} bytes`);
    
    // Try to detect BOM
    if (buffer.length >= 3) {
        const possibleBOM = buffer.slice(0, 3);
        if (possibleBOM[0] === 0xEF && possibleBOM[1] === 0xBB && possibleBOM[2] === 0xBF) {
            console.log('File has UTF-8 BOM');
        } else if (possibleBOM[0] === 0xFE && possibleBOM[1] === 0xFF) {
            console.log('File has UTF-16 BE BOM');
        } else if (possibleBOM[0] === 0xFF && possibleBOM[1] === 0xFE) {
            console.log('File has UTF-16 LE BOM');
        } else {
            console.log('No BOM detected');
        }
    }
    
    // Count occurrences of common delimiters
    const commas = buffer.filter(byte => byte === 44).length; // ASCII for comma
    const semicolons = buffer.filter(byte => byte === 59).length; // ASCII for semicolon
    const tabs = buffer.filter(byte => byte === 9).length; // ASCII for tab
    const newlines = buffer.filter(byte => byte === 10).length; // ASCII for newline
    
    console.log('\nDelimiter analysis:');
    console.log(`Commas: ${commas}`);
    console.log(`Semicolons: ${semicolons}`);
    console.log(`Tabs: ${tabs}`);
    console.log(`Newlines: ${newlines}`);
    
    // Check for null bytes
    const nullBytes = buffer.filter(byte => byte === 0).length;
    if (nullBytes > 0) {
        console.log(`\nWarning: Found ${nullBytes} null bytes in the file`);
    }
    
} catch (error) {
    console.error('Error:', error);
    process.exit(1);
} 