const TelegramBot = require('node-telegram-bot-api');

// Function to initialize the memecoin creation process
function startMemecoinCreation(chatId, userId, bot, userStates) {
  userStates[chatId] = { step: 0, data: {}, userId };

  const introMessage = `🚀 Welcome to the Memecoin Creation Wizard! 🚀

Provide the following to create your own memecoin:
  1. Token Name
  2. Token Symbol
  3. Description
  4. Twitter Handle (optional)
  5. Telegram Handle (optional)
  6. Website URL (optional)
  7. Token Image

Type /cancel to stop the process at any time.
  `;

  bot.sendMessage(chatId, introMessage).then(() => {
    bot.sendMessage(chatId, "Let's get started! What is the name of your token?", {
      reply_markup: {
        force_reply: true,
      },
    });
  });
}

// Function to handle text messages for the memecoin creation process
function handleMemecoinTextMessage(msg, bot, userStates) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (msg.text) {
    const text = msg.text;

    if (!userStates[chatId] || userStates[chatId].userId !== userId) return;

    if (text.toLowerCase() === '/cancel') {
      delete userStates[chatId];
      bot.sendMessage(chatId, 'Memecoin creation process has been cancelled.');
      return;
    }

    const userState = userStates[chatId];

    switch (userState.step) {
      case 0:
        userState.data.name = text;
        bot.sendMessage(chatId, 'Step 2: What is the symbol of your token?', {
          reply_markup: {
            force_reply: true,
          },
        });
        userState.step++;
        break;
      case 1:
        userState.data.symbol = text;
        bot.sendMessage(chatId, 'Step 3: Please provide a description for your token.');
        userState.step++;
        break;
      case 2:
        userState.data.description = text;
        bot.sendMessage(chatId, 'Step 4: What is your Twitter handle?', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Skip', callback_data: 'skip_twitter' }],
            ],
          },
        });
        userState.step++;
        break;
      case 3:
        userState.data.twitter = text;
        bot.sendMessage(chatId, 'Step 5: What is your Telegram handle?', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Skip', callback_data: 'skip_telegram' }],
            ],
          },
        });
        userState.step++;
        break;
      case 4:
        userState.data.telegram = text;
        bot.sendMessage(chatId, 'Step 6: What is your website URL?', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Skip', callback_data: 'skip_website' }],
            ],
          },
        });
        userState.step++;
        break;
      case 5:
        userState.data.website = text;
        bot.sendMessage(chatId, 'Step 7: Please upload a photo for your token.');
        userState.step++;
        break;
      default:
        break;
    }
  }
}

// Function to handle photo messages for the memecoin creation process
function handleMemecoinPhotoMessage(msg, bot, userStates) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (msg.photo) {
    if (!userStates[chatId] || userStates[chatId].userId !== userId) return;

    const userState = userStates[chatId];
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;

    bot.getFileLink(fileId).then((fileUrl) => {
      userState.data.file = fileUrl;

      bot.sendPhoto(chatId, fileId, {
        caption: `Please review your memecoin details:
- Name: ${userState.data.name}
- Symbol: ${userState.data.symbol}
- Description: ${userState.data.description}
- Twitter: ${userState.data.twitter || 'None'}
- Telegram: ${userState.data.telegram || 'None'}
- Website: ${userState.data.website || 'None'}

Do you want to LAUNCH or KILL the creation?`,
        reply_markup: {
          inline_keyboard: [
            [{ text: 'LAUNCH', callback_data: 'launch' }, { text: 'KILL', callback_data: 'kill' }],
          ],
        },
      });
    }).catch((error) => {
      console.error('Error getting file link:', error);
      bot.sendMessage(chatId, 'An error occurred while processing your photo.');
    });
  }
}

module.exports = {
  startMemecoinCreation,
  handleMemecoinTextMessage,
  handleMemecoinPhotoMessage,
}; 