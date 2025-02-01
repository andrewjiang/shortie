require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { summarizeMessages } = require('./openaiClient');
const Message = require('../models/Message');
const retryWithBackoff = require('../utils/retry');
const Setting = require('../models/Setting');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { startMemecoinCreation, handleMemecoinTextMessage, handleMemecoinPhotoMessage } = require('./pumpService');
const { createWallet, saveWallet, getApiKey, getSolBalance } = require('./walletService');
const Wallet = require('../models/Wallet');
const bcrypt = require('bcrypt');
const axios = require('axios');

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
  bot.sendMessage(chatId, "I'm here to help you cabal.");
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
bot.onText(/\/arewerich/, async (msg) => {
  console.log('msg', msg);
  console.log('msg.chat.id', msg.chat.id);
  const chatId = msg.chat.id;
  const now = Date.now();
  const twelveHoursAgo = new Date(now - 12 * 60 * 60 * 1000);

  try {
    // Query MongoDB for messages from the last 24 hours in the specific chat
    const recentMessages = await Message.find({
      chatId: chatId,
      date: { $gte: twelveHoursAgo }
    });

    // Log the messages being sent to OpenAI
    console.log('Chat ID is asking for a summary:', chatId);
    console.log('Messages sent to OpenAI for summarization:', recentMessages.map(m => m.text));

    const summary = await summarizeMessages(recentMessages.map(m => m.text), chatId);
    bot.sendMessage(chatId, `Summary of the last 12 hours: ${summary}`);
  } catch (error) {
    console.error('Error retrieving or summarizing messages:', error);
    bot.sendMessage(chatId, 'Sorry, there was an error generating the summary.');
  }
});

// Handle /admin command
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`Received /admin from chat ${chatId}`);

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

const userStates = {}; // To track user progress

// Start the memecoin creation process
bot.onText(/\/pump/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  startMemecoinCreation(chatId, userId, bot, userStates);
});

// Handle text messages for the memecoin creation process
bot.on('message', (msg) => {
  handleMemecoinTextMessage(msg, bot, userStates);
  handleMemecoinPhotoMessage(msg, bot, userStates);
});

// Handle callback queries for final decision
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id; // Get the user ID of the callback query sender
  const data = callbackQuery.data;

  // Handle wallet public key sharing
  if (data.startsWith('share_')) {
    const publicKey = data.split('_')[1];
    bot.sendMessage(chatId, `Public Key: ${publicKey}`);
    bot.answerCallbackQuery(callbackQuery.id);
    return; // Exit after handling the wallet sharing
  }

  if (!userStates[chatId] || userStates[chatId].userId !== userId) return; // Ensure the user is in the creation process and is the initiator

  const userState = userStates[chatId];

  if (data === 'launch') {
    // Proceed with memecoin creation
    bot.sendMessage(chatId, '🚀 Launching your memecoin... Please wait.');
    // Call the function to send data to the API
    sendMemecoinData(userState.data, chatId)
      .then(result => {
        bot.sendMessage(chatId, `🎉 Success! Your memecoin has been created!\nTransaction: ${result.transaction}\nContract Address: ${result.contractAddress}`);
      })
      .catch(error => {
        console.error('Error launching memecoin:', error);
        bot.sendMessage(chatId, 'An error occurred while launching your memecoin.');
      });
    delete userStates[chatId]; // Clean up state
  } else if (data === 'kill') {
    // Cancel the process
    bot.sendMessage(chatId, 'Memecoin creation process has been cancelled.');
    delete userStates[chatId]; // Clean up state
  } else if (data === 'skip_twitter') {
    userState.data.twitter = 'None';
    bot.sendMessage(chatId, 'Step 5: What is your Telegram handle?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Skip', callback_data: 'skip_telegram' }],
        ],
      },
    });
    userState.step++;
  } else if (data === 'skip_telegram') {
    userState.data.telegram = 'None';
    bot.sendMessage(chatId, 'Step 6: What is your website URL?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Skip', callback_data: 'skip_website' }],
        ],
      },
    });
    userState.step++;
  } else if (data === 'skip_website') {
    userState.data.website = 'None';
    bot.sendMessage(chatId, 'Step 7: Please upload a photo for your token.');
    userState.step++;
  }

  // Acknowledge the callback query
  bot.answerCallbackQuery(callbackQuery.id);
});

// Function to send data to the API
async function sendMemecoinData(data, chatId) {
  const formData = new FormData();
  formData.append('file', data.file, 'token_image.jpg');
  formData.append('name', data.name);
  formData.append('symbol', data.symbol);
  formData.append('description', data.description);
  formData.append('twitter', data.twitter);
  formData.append('telegram', data.telegram);
  formData.append('website', data.website);

  try {
    const wallet = await Wallet.findOne({ chatId });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const solBalance = await getSolBalance(wallet.walletPublicKey);
    if (solBalance <= 0.04) {
      bot.sendMessage(chatId, `SOL balance low (${solBalance} SOL). Add SOL to the ${wallet.walletName} wallet to continue.`);
      return;
    }

    console.log('formData:', formData);

    formData.append('apikey', wallet.apiKey);

    const response = await fetch('https://megaserver-flame.vercel.app/api/pump/create', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to create memecoin:', errorText);
      throw new Error('Failed to create memecoin');
    }

    const result = await response.json();
    console.log('Token creation response:', result);

    if (!result.transaction || !result.contractAddress) {
      console.error('Unexpected API response:', result);
      throw new Error('API response does not contain expected transaction details');
    }

    return {
      transaction: result.transaction,
      contractAddress: result.contractAddress,
    };
  } catch (error) {
    console.error('Error in sendMemecoinData:', error);
    throw error;
  }
}

bot.onText(/\/createwallet/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const { walletPublicKey, privateKey, apiKey } = await createWallet(chatId);
    const message = await bot.sendMessage(chatId, `Your wallet has been created!\nPublic Key: ${walletPublicKey}\nPlease provide a name for your wallet. This message will self-destruct in 10 seconds if no name is provided.`);

    // Schedule message deletion after 10 seconds
    setTimeout(() => {
      bot.deleteMessage(chatId, message.message_id).catch((error) => {
        console.error('Error deleting message:', error);
      });
    }, 10000);

    // Wait for the user's response for the wallet name
    bot.once('message', async (responseMsg) => {
      let walletName = responseMsg.text.trim();
      if (!walletName) {
        const { default: randomWords } = await import('random-words');
        walletName = randomWords({ exactly: 3, join: ' ' });
      }

      try {
        const confirmationMessage = await saveWallet(chatId, walletPublicKey, privateKey, apiKey, walletName);
        bot.sendMessage(chatId, confirmationMessage);
      } catch (error) {
        bot.sendMessage(chatId, error.message);
      }
    });
  } catch (error) {
    bot.sendMessage(chatId, 'An error occurred while creating your wallet.');
  }
});

async function verifyPrivateKey(chatId, inputPrivateKey, storedHashedKey) {
  try {
    const isMatch = await bcrypt.compare(inputPrivateKey + chatId, storedHashedKey);
    return isMatch;
  } catch (error) {
    console.error('Error verifying private key:', error);
    throw error;
  }
}

bot.onText(/\/wallets/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    // Retrieve all wallets associated with the chatId
    const wallets = await Wallet.find({ chatId });

    if (wallets.length === 0) {
      return bot.sendMessage(chatId, 'No wallets found for this chat.');
    }

    // Prepare the message with wallet information
    const walletButtons = [];
    for (const wallet of wallets) {
      const solBalance = await getSolBalance(wallet.walletPublicKey);
      walletButtons.push([
        {
          text: `${wallet.walletName}: ${solBalance} SOL`,
          callback_data: `share_${wallet.walletPublicKey}`,
        },
      ]);
    }

    const options = {
      reply_markup: {
        inline_keyboard: walletButtons,
      },
    };

    bot.sendMessage(chatId, 'Here are the wallets associated with this chat:', options);
  } catch (error) {
    console.error('Error retrieving wallets:', error);
    bot.sendMessage(chatId, 'An error occurred while retrieving wallets.');
  }
});

module.exports = bot;