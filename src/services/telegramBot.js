require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { summarizeMessages } = require('./openaiClient');
const Message = require('../models/Message');
const retryWithBackoff = require('../utils/retry');
const Setting = require('../models/Setting');

// Replace 'YOUR_TELEGRAM_BOT_TOKEN' with your actual bot token
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

console.log('Bot is starting...');

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Array to store messages
let messages = [];

// Function to clean up messages older than 24 hours
function cleanUpMessages() {
  const now = Date.now();
  messages = messages.filter(msg => now - msg.date * 1000 < 24 * 60 * 60 * 1000);
}

// Clean up messages every hour
setInterval(cleanUpMessages, 60 * 60 * 1000);

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`Received /start from chat ${chatId}`);
  bot.sendMessage(chatId, 'Hello! I am your friendly bot. Add me to a group to start summarizing messages.');
});

// Handle new chat members (when the bot is added to a group)
bot.on('new_chat_members', (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Hello everyone! I am here to help summarize your messages.');
});

// Handle messages in group chats
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  console.log('Received message object:', msg);
  // Ignore messages that are not from group chats
  if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') return;

  // Check if the message has text
  if (msg.text) {
    // Save the message to MongoDB
    const message = new Message({
      messageId: msg.message_id,
      userId: msg.from.id,
      username: msg.from.username,
      chatId: chatId,
      date: new Date(msg.date * 1000), // Convert from seconds to milliseconds
      text: msg.text,
    });

    try {
      await retryWithBackoff(() => message.save());
      console.log(`Saved message from chat ${chatId}: ${msg.text}`);
    } catch (error) {
      console.error('Error saving message after retries:', error);
    }
  } else {
    console.log(`Received non-text message in group ${chatId}`);
  }
});

// Handle /summary command
bot.onText(/\/summary/, async (msg) => {
  const chatId = msg.chat.id;
  const now = Date.now();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

  try {
    // Query MongoDB for messages from the last 24 hours in the specific chat
    const recentMessages = await Message.find({
      chatId: chatId,
      date: { $gte: twentyFourHoursAgo }
    });

    // Log the messages being sent to OpenAI
    console.log('Messages sent to OpenAI for summarization:', recentMessages.map(m => m.text));

    const summary = await summarizeMessages(recentMessages.map(m => m.text));
    bot.sendMessage(chatId, `Summary of the last 24 hours: ${summary}`);
  } catch (error) {
    console.error('Error retrieving or summarizing messages:', error);
    bot.sendMessage(chatId, 'Sorry, there was an error generating the summary.');
  }
});

// Handle /admin command
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    // Find or create the setting for the chat
    let setting = await Setting.findOne({ chatId });
    if (!setting) {
      setting = new Setting({ chatId });
      await setting.save();
    }

    // Create language selection buttons
    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'English', callback_data: 'language_English' },
            { text: 'Spanish', callback_data: 'language_Spanish' },
            { text: 'Chinese', callback_data: 'language_Chinese' },
          ],
        ],
      },
    };

    bot.sendMessage(chatId, `Current language: ${setting.language}`, options);
  } catch (error) {
    console.error('Error handling /admin command:', error);
    bot.sendMessage(chatId, 'An error occurred. Defaulting to English.');
  }
});

// Handle callback queries for language selection
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith('language_')) {
    const language = data.split('_')[1];

    // Update the language setting for the chat
    await Setting.updateOne({ chatId }, { language });

    bot.sendMessage(chatId, `Language updated to ${language}`);
  }

  // Acknowledge the callback query
  bot.answerCallbackQuery(callbackQuery.id);
});

module.exports = bot;