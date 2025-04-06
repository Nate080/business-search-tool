const XLSX = require('xlsx');
const fs = require('fs');

try {
    // Read the clean CSV file
    const csvFile = 'clean_business_data.csv';
    console.log(`Reading ${csvFile}...`);
    
    const content = fs.readFileSync(csvFile, 'utf8');
    const lines = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    if (lines.length <= 1) {
        console.error('No data found in CSV file');
        process.exit(1);
    }
    
    // Parse header
    const header = lines[0].split(',')
        .map(h => h.replace(/["\r]/g, '').trim());
    
    console.log('Headers:', header);
    
    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',')
            .map(val => val.replace(/["\r]/g, '').trim());
        
        if (values.length === header.length) {
            const row = {};
            header.forEach((col, index) => {
                row[col] = values[index];
            });
            data.push(row);
        }
    }
    
    console.log(`Found ${data.length} businesses`);
    
    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Set column widths
    worksheet['!cols'] = [
        { wch: 40 }, // Company Name
        { wch: 20 }, // City
        { wch: 20 }  // Search Term
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'BBB Businesses');
    
    // Save to Excel file
    const excelFileName = 'BBB_Business_List.xlsx';
    XLSX.writeFile(workbook, excelFileName);
    
    console.log('\nSuccessfully created Excel file!');
    console.log(`Filename: ${excelFileName}`);
    console.log('\nFirst 3 entries:');
    console.log(JSON.stringify(data.slice(0, 3), null, 2));
    
} catch (error) {
    if (error.code === 'ENOENT') {
        console.error('Please run extract_data.js first to create the clean CSV file');
    } else {
        console.error('Error:', error.message);
    }
    process.exit(1);
} 