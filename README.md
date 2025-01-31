# Shortie

Shortie is a Node.js application that provides a RESTful API and integrates with a Telegram bot to summarize group chat messages using OpenAI's GPT-4o model.

## Features

- RESTful API built with Express.js
- Telegram bot integration for summarizing group chat messages
- MongoDB for storing chat messages
- Docker support for containerization

## Prerequisites

- Node.js (version 18 or later)
- MongoDB
- Docker (optional, for containerization)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/oceanserver.git
   cd oceanserver
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and add your environment variables:
   ```plaintext
   MONGODB_URI=your_mongodb_uri
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   OPENAI_API_KEY=your_openai_api_key
   PORT=3000
   ```

4. Start the application:
   ```bash
   npm start
   ```

## Usage

- The API is accessible at `http://localhost:3000/api`.
- Add the Telegram bot to a group chat to start summarizing messages.

## Docker

To run the application in a Docker container:

1. Build the Docker image:
   ```bash
   docker build -t oceanserver .
   ```

2. Run the Docker container:
   ```bash
   docker run -p 3000:3000 --env-file .env oceanserver
   ```

## License

This project is licensed under the MIT License -