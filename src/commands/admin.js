const Setting = require('../models/Setting');

module.exports = {
  registerCommands: (bot) => {
    bot.onText(/\/admin/, async (msg) => {
      const chatId = msg.chat.id;
      console.log(`Received /admin from chat ${chatId}`);

      try {
        let setting = await Setting.findOne({ chatId });
        if (!setting) {
          setting = new Setting({ chatId });
          await setting.save();
        }

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

    bot.on('callback_query', async (callbackQuery) => {
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;

      if (data.startsWith('language_')) {
        const language = data.split('_')[1];
        try {
          await Setting.updateOne({ chatId }, { language });
          bot.sendMessage(chatId, `Language updated to ${language}.`);
        } catch (error) {
          console.error('Error updating language:', error);
          bot.sendMessage(chatId, 'An error occurred while updating the language.');
        }
      }

      bot.answerCallbackQuery(callbackQuery.id);
    });
  }
};