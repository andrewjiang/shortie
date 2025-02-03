const { createAndSaveWallet } = require('../services/walletService');

module.exports = {
  registerCommands: (bot) => {
    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      console.log(`Received /start from chat ${chatId}`);
      bot.sendMessage(chatId, 
        'Hey there! 👋' +
        '\n\n' +
        'I\'m a friendly group chat agent here to help you cabal.' +
        '\n\n' +
        'I can help you create group wallets, create memecoins, summarize activities, and more.' +
        '\n\n' +
        '*START HERE*\n'+
        '1. Setup a group wallet using /createwallet\n' +
        '2. See your wallets and balances using /wallets\n' +
        '3. Create a memecoin together using /pump\n'+
        '4. Summarize recent chat activity using /arewerich'+
        '\n\n' +
        'Let\'s get started by creating a group wallet.',
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Create Group Wallet', callback_data: '/createwallet' }]
            ]
          }
        }
      );
    });

    bot.on('callback_query', (callbackQuery) => {
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;

      console.log(`Callback query received with data: ${data}`); // Debugging log

      if (data === '/createwallet') {
        console.log('Calling createAndSaveWallet function...'); // Debugging log
        createAndSaveWallet(bot, { chat: { id: chatId }, from: callbackQuery.from });
      }

      bot.answerCallbackQuery(callbackQuery.id);
    });
  }
};