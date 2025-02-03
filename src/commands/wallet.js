const { createAndSaveWallet, listWallets } = require('../services/walletService');

module.exports = {
    registerCommands: (bot) => {
      bot.onText(/\/createwallet/, (msg) => createAndSaveWallet(bot, msg));
      bot.onText(/\/wallets/, (msg) => listWallets(bot, msg));
    }
};
