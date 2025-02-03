const Message = require('../models/Message');
const { summarizeMessages } = require('../services/openaiClient');
const { extractChatIdFromText } = require('../utils/helpers');

module.exports = {
  registerCommands: (bot) => {
    bot.onText(/\/arewerich/, async (msg) => {
      const isAdmin = msg.from.id === 877749921;
      const adminChatId = msg.chat.id;
      const chatId = isAdmin ? extractChatIdFromText(msg.text) || adminChatId : adminChatId;
      const now = Date.now();
      const twelveHoursAgo = new Date(now - 12 * 60 * 60 * 1000);
      const chatName = msg.chat.title

      try {
        const recentMessages = await Message.find({
          chatId: chatId,
          date: { $gte: twelveHoursAgo }
        });

        const messagesForSummarization = recentMessages.map(m => `${m.username}: ${m.text}`);
        const summary = await summarizeMessages(messagesForSummarization, chatId, chatName);

        bot.sendMessage(adminChatId, `*ARE WE RICH?*\n\n${summary}`, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error('Error retrieving or summarizing messages:', error);
        bot.sendMessage(adminChatId, 'Sorry, there was an error generating the summary.', { parse_mode: 'Markdown' });
      }
    });
  }
};