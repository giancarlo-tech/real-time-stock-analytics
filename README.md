# Real-Time Stock Analytics

This project aims to provide a real-time stock trading analytics platform that gathers and processes stock data in real-time. The system is designed to monitor stock prices, analyze trends, and provide insights for decision-making.

## Key Features:
- Real-time stock data monitoring
- Data analytics and trend prediction (using Apache Beam for data processing)
- Backend API to serve processed stock data
- Integration with stock data sources for up-to-date market information

## Project Structure:
- **node-backend**: Contains the backend API built with Node.js for handling requests and serving stock data.
- **beam-pipeline**: Contains an Apache Beam pipeline for real-time data processing and analysis of stock market trends.
- **docker-compose.yml**: Configuration file to set up the environment and services needed for the project.

## Installation:
1. Clone the repository:
   ```bash
   git clone https://github.com/giancarlo-tech/real-time-stock-analytics.git
   cd real-time-stock-analytics
   ```

2. Install backend dependencies:
   ```bash
   cd node-backend
   npm install
   ```

3. Install Beam pipeline dependencies (if applicable):
   ```bash
   cd beam-pipeline
   # Setup Beam dependencies if required
   ```

4. Run the backend server:
   ```bash
   npm start
   ```

5. Run the Beam pipeline for data processing (if applicable).

## Limitations:
This project is incomplete due to cost limitations associated with real-time stock trading. Continuous pulling of stock data for real-time analysis can be expensive as many APIs charge for constant updates. This project requires access to real-time stock data, which is often not free.

## Future Work:
- Implementation of more advanced analytics and trend prediction models.
- Integration with additional stock data providers.
- Optimization for better performance in real-time data handling.

## License:
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.