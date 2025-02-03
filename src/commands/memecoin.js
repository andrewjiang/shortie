const { startMemecoinCreation, handleMemecoinTextMessage, handleMemecoinPhotoMessage } = require('../services/pumpService');

module.exports = {
  registerCommands: (bot, userStates) => {
    bot.onText(/\/pump/, (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      startMemecoinCreation(chatId, userId, bot, userStates);
    });

    bot.on('message', (msg) => {
      handleMemecoinTextMessage(msg, bot, userStates);
      handleMemecoinPhotoMessage(msg, bot, userStates);
    });

    bot.on('callback_query', (callbackQuery) => {
      const chatId = callbackQuery.message.chat.id;
      const userId = callbackQuery.from.id;
      const data = callbackQuery.data;

      if (data.startsWith('share_')) {
        const publicKey = data.split('_')[1];
        bot.sendMessage(chatId, `Public Key: ${publicKey}`, { parse_mode: 'Markdown' });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      if (!userStates[chatId] || userStates[chatId].userId !== userId) return;

      const userState = userStates[chatId];

      if (data === 'launch') {
        bot.sendMessage(chatId, '🚀 Launching your memecoin... Please wait.', { parse_mode: 'Markdown' });
        sendMemecoinData(userState.data, chatId)
          .then(result => {
            bot.sendMessage(chatId, `🎉 Success! Your memecoin has been created!\nTransaction: ${result.transaction}\nContract Address: ${result.contractAddress}`, { parse_mode: 'Markdown' });
          })
          .catch(error => {
            console.error('Error launching memecoin:', error);
            bot.sendMessage(chatId, 'An error occurred while launching your memecoin.', { parse_mode: 'Markdown' });
          });
        delete userStates[chatId];
      } else if (data === 'kill') {
        bot.sendMessage(chatId, 'Memecoin creation process has been cancelled.', { parse_mode: 'Markdown' });
        delete userStates[chatId];
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

      bot.answerCallbackQuery(callbackQuery.id);
    });
  }
};