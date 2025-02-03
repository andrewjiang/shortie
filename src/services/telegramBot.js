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
  bot.sendMessage(chatId, 'Hello! I am your friendly bot. Add me to a group to start summarizing messages.', { parse_mode: 'Markdown' });
});

// Handle new chat members (when the bot is added to a group)
bot.on('new_chat_members', (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "I'm here to help you cabal.", { parse_mode: 'Markdown' });
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

// Helper function to extract chatId from message text
function extractChatIdFromText(text) {
  const parts = text.split(' ');
  if (parts.length > 1) {
    const chatId = parseInt(parts[1], 10);
    if (!isNaN(chatId)) {
      return chatId;
    }
  }
  return null;
}

// Handle /arewerich command
bot.onText(/\/arewerich/, async (msg) => {
  const isAdmin = msg.from.id === 877749921;
  const adminChatId = msg.chat.id;
  const chatId = isAdmin ? extractChatIdFromText(msg.text) || adminChatId : adminChatId;
  console.log('msg', msg);
  console.log('msg.chat.id', chatId);
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
    console.log('Messages sent to OpenAI for summarization:', recentMessages.map(m => ({ text: m.text, username: m.username })));

    // Include username in the messages sent to OpenAI
    const messagesForSummarization = recentMessages.map(m => `${m.username}: ${m.text}`);
    const summary = await summarizeMessages(messagesForSummarization, chatId);

    bot.sendMessage(adminChatId, `*ARE WE RICH?*\n\n${summary}`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error retrieving or summarizing messages:', error);
    bot.sendMessage(adminChatId, 'Sorry, there was an error generating the summary.', { parse_mode: 'Markdown' });
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
    bot.sendMessage(chatId, 'An error occurred. Defaulting to English.', { parse_mode: 'Markdown' });
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
    bot.sendMessage(chatId, `Public Key: ${publicKey}`, { parse_mode: 'Markdown' });
    bot.answerCallbackQuery(callbackQuery.id);
    return; // Exit after handling the wallet sharing
  }

  if (!userStates[chatId] || userStates[chatId].userId !== userId) return; // Ensure the user is in the creation process and is the initiator

  const userState = userStates[chatId];

  if (data === 'launch') {
    // Proceed with memecoin creation
    bot.sendMessage(chatId, '🚀 Launching your memecoin... Please wait.', { parse_mode: 'Markdown' });
    // Call the function to send data to the API
    sendMemecoinData(userState.data, chatId)
      .then(result => {
        bot.sendMessage(chatId, `🎉 Success! Your memecoin has been created!\nTransaction: ${result.transaction}\nContract Address: ${result.contractAddress}`, { parse_mode: 'Markdown' });
      })
      .catch(error => {
        console.error('Error launching memecoin:', error);
        bot.sendMessage(chatId, 'An error occurred while launching your memecoin.', { parse_mode: 'Markdown' });
      });
    delete userStates[chatId]; // Clean up state
  } else if (data === 'kill') {
    // Cancel the process
    bot.sendMessage(chatId, 'Memecoin creation process has been cancelled.', { parse_mode: 'Markdown' });
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
    bot.sendMessage(chatId, 'Step 7: Please upload a photo for your token.', { parse_mode: 'Markdown' });
    userState.step++;
  }

  // Acknowledge the callback query
  bot.answerCallbackQuery(callbackQuery.id);
});

// Function to send data to the API
async function sendMemecoinData(data, chatId) {
  const formData = new FormData();

  // Ensure the file is correctly appended
  const response = await fetch(data.file);
  const fileBuffer = await response.buffer();
  formData.append('file', fileBuffer, 'token_image.jpg');
  formData.append('name', data.name);
  formData.append('symbol', data.symbol);
  formData.append('description', data.description);
  formData.append('twitter', data.twitter);
  formData.append('telegram', data.telegram);
  formData.append('website', data.website);
  formData.append('devbuy', 0.0001);

  try {
    const wallet = await Wallet.findOne({ chatId });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const solBalance = await getSolBalance(wallet.walletPublicKey);
    console.log('sol balance in the wallet: ', solBalance);
    if (solBalance <= 40000000) { // Assuming solBalance is in lamports (1 SOL = 1,000,000,000 lamports)
      bot.sendMessage(chatId, `SOL balance low (${solBalance} SOL). Add SOL to the ${wallet.walletName} wallet to continue.`, { parse_mode: 'Markdown' });
      return;
    }

    formData.append('apikey', wallet.apiKey);
    

    const DEBUG_MODE = false;
    console.log(`file: ${formData.getBuffer()}`);
    let result;
    if (DEBUG_MODE) {
      console.log('Debug mode is ON. Returning fake response.');
      result = {
        transaction: 'fake-transaction-id',
        contractAddress: 'fake-contract-address',
      };
    } else {
      const apiResponse = await fetch('https://megaserver-flame.vercel.app/api/pump/create', {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders(), // Ensure headers are set correctly
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error('Failed to create memecoin:', errorText);
        throw new Error('Failed to create memecoin');
      }

      result = await apiResponse.json();
      console.log('Token creation response:', result);

      if (!result.transaction || !result.contractAddress) {
        console.error('Unexpected API response:', result);
        throw new Error('API response does not contain expected transaction details');
      }
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

// Handle /createwallet command
bot.onText(/\/createwallet/, async (msg) => {
  const isAdmin = msg.from.id === 877749921;
  const adminChatId = msg.chat.id;
  const chatId = isAdmin ? extractChatIdFromText(msg.text) || adminChatId : adminChatId;

  try {
    const { walletPublicKey, privateKey, apiKey } = await createWallet(chatId);
    const message = await bot.sendMessage(chatId, `Your wallet has been created!\nPublic Key: ${walletPublicKey}\nPlease provide a name for your wallet. This message will self-destruct in 10 seconds if no name is provided.`, { parse_mode: 'Markdown' });

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
        bot.sendMessage(adminChatId, `Wallet created for chat ${chatId}:\nPublic Key: ${walletPublicKey}`, { parse_mode: 'Markdown' });
      } catch (error) {
        bot.sendMessage(adminChatId, error.message, { parse_mode: 'Markdown' });
      }
    });
  } catch (error) {
    bot.sendMessage(adminChatId, 'An error occurred while creating your wallet.', { parse_mode: 'Markdown' });
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

// Handle /wallets command
bot.onText(/\/wallets/, async (msg) => {
  const isAdmin = msg.from.id === 877749921;
  const adminChatId = msg.chat.id;
  const chatId = isAdmin ? extractChatIdFromText(msg.text) || adminChatId : adminChatId;

  try {
    // Retrieve all wallets associated with the chatId
    const wallets = await Wallet.find({ chatId });

    if (wallets.length === 0) {
      return bot.sendMessage(chatId, 'No wallets found for this chat.', { parse_mode: 'Markdown' });
    }

    // Prepare the message with wallet information
    const walletButtons = [];
    for (const wallet of wallets) {
      const solBalanceLamports = await getSolBalance(wallet.walletPublicKey);
      const solBalance = solBalanceLamports / 1_000_000_000; // Convert lamports to SOL
      walletButtons.push([
        {
          text: `${wallet.walletName}: ${solBalance.toFixed(4)} SOL`, // Format to 4 decimal places
          callback_data: `share_${wallet.walletPublicKey}`,
        },
      ]);
    }

    const options = {
      reply_markup: {
        inline_keyboard: walletButtons,
      },
    };

    bot.sendMessage(adminChatId, `Here are the wallets associated with chat ${chatId}:`, options);
  } catch (error) {
    console.error('Error retrieving wallets:', error);
    bot.sendMessage(adminChatId, 'An error occurred while retrieving wallets.', { parse_mode: 'Markdown' });
  }
});

module.exports = bot;