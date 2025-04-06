# BBB Business Search Tool

A web-based tool for searching and extracting business information from the Better Business Bureau (BBB) website. This tool allows users to search multiple cities and terms, track progress, and export results in a spreadsheet-friendly format.

## Features

- Password-protected access
- Search across multiple cities (up to 10)
- Multiple search terms (up to 5)
- Configurable minimum years in business
- Required field validation
- Real-time progress tracking
- Export to spreadsheet-compatible format
- User activity logging

## Setup

1. Create a Firebase project:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project
   - Enable Firestore database
   - Get your Firebase configuration (apiKey, authDomain, etc.)
   - Update `firebase-config.js` with your configuration

2. Deploy to GitHub Pages:
   - Fork this repository
   - Enable GitHub Pages in your repository settings
   - Set the source to the main branch

3. Update the domain:
   - Purchase a domain (optional)
   - Configure GitHub Pages to use your custom domain
   - Update Firebase configuration with your domain

## Usage

1. Access the tool using your web browser
2. Enter the password: `Oak_Tree_Ind`
3. Enter your full name
4. Configure your search:
   - Add cities (up to 10)
   - Select search terms (up to 5)
   - Set minimum years in business
   - Select required fields
5. Start the search
6. Monitor progress in real-time
7. Download results when complete

## File Structure

- `index.html` - Main web interface
- `firebase-config.js` - Firebase configuration and database functions
- `search-worker.js` - Background worker for BBB scraping
- `README.md` - This documentation

## Development

To run locally:
1. Install a local web server (e.g., `python -m http.server 8000`)
2. Open `http://localhost:8000` in your browser
3. Make sure to update Firebase configuration for local development

## Notes

- The tool respects BBB's rate limiting by adding delays between requests
- Search results are cached in Firebase to improve performance
- User activity is logged for monitoring purposes
- Results can be easily copied into Google Sheets 