# Business Search Tool

A web application for searching and collecting business information. The tool supports searching multiple industries and locations simultaneously, with filtering options for business age and required fields.

## 🌐 [Live Demo](https://Nate080.github.io/business-search-tool)

The live demo uses mock data to demonstrate the functionality. For full features with real data, please follow the local installation instructions below.

## ✨ Features

- 🔍 Search multiple industries and locations simultaneously
- ⚡ Real-time progress tracking
- 📊 Filter results by years in business
- 📝 Require complete business information
- 📥 Export results to CSV
- 🎯 Estimated search time calculation

## 🚀 Local Installation

1. Clone the repository:
```bash
git clone https://github.com/Nate080/business-search-tool.git
cd business-search-tool
```

2. Install dependencies:
```bash
npm install
```

3. Start the backend server:
```bash
node server.js
```

4. In a new terminal, start the frontend server:
```bash
npx http-server
```

5. Open your browser and navigate to:
```
http://localhost:8080
```

## 🛠️ Technology Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Web Scraping: Puppeteer
- Rate Limiting: express-rate-limit

## 📝 Usage

1. Enter one or more industries/business types (one per line)
2. Enter one or more locations (one per line)
3. Set the number of pages to search per combination
4. Set minimum years in business
5. Optionally require all fields to be present
6. Click "Start Search" and monitor progress
7. Download results as CSV when complete

## ⚠️ Rate Limiting

The backend includes rate limiting to prevent abuse:
- 100 requests per 15 minutes per IP address
- Random delays between requests to avoid detection

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 