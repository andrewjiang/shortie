require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

console.log('Bot is starting...');

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

const userStates = {}; // To track user progress

// Load all command handlers
const commandFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  console.log(`Loading command file: ${file}`);
  const command = require(`../commands/${file}`);
  if (typeof command.registerCommands === 'function') {
    command.registerCommands(bot, userStates);
  } else {
    console.error(`Command file ${file} does not export a registerCommands function.`);
  }
}

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  console.log(`Received message from chat ${chatId}: ${text}`);
  // Add your logic here to handle generic text messages
  // For example, you could log the message or respond with a default message
//   if (text) {
//     bot.sendMessage(chatId, `You said: ${text}`);
//   }
});

// Define the commands
const commands = [
  { command: 'start', description: 'Start interacting with the bot' },
  { command: 'createwallet', description: 'Create a new group wallet' },
  { command: 'wallets', description: 'List all wallets' },
  { command: 'pump', description: 'Start memecoin creation' },
  { command: 'arewerich', description: 'Summarize recent chat activity' },
  // Add more commands as needed
];

// Set the commands for the bot
bot.setMyCommands(commands)
  .then(() => {
    console.log('Commands have been set successfully.');
  })
  .catch((error) => {
    console.error('Error setting commands:', error);
  });

module.exports = bot;