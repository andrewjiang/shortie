const fetch = require('node-fetch');
const bcrypt = require('bcrypt');
const Wallet = require('../models/Wallet');
const { extractChatIdFromText } = require('../utils/helpers');
const adminMiddleware = require('../middleware/adminMiddleware');

async function createWallet(chatId) {
  try {
    const response = await fetch('https://pumpportal.fun/api/create-wallet');
    if (!response.ok) {
      throw new Error('Failed to create wallet');
    }
    const data = await response.json();

    // Use chatId as part of the salt
    const saltRounds = 10;
    const salt = await bcrypt.genSalt(saltRounds);
    const hashedPrivateKey = await bcrypt.hash(data.privateKey + chatId, salt);

    return {
      walletPublicKey: data.walletPublicKey,
      privateKey: hashedPrivateKey, // Store the hashed private key
      apiKey: data.apiKey, // Include apiKey
    };
  } catch (error) {
    console.error('Error creating wallet:', error);
    throw error;
  }
}

async function saveWallet(chatId, walletPublicKey, privateKey, apiKey, walletName) {
  const wallet = new Wallet({
    chatId,
    walletPublicKey,
    privateKey, // Store the hashed private key
    apiKey, // Store the apiKey
    walletName,
  });

  try {
    await wallet.save();
    return `Wallet saved with name: ${walletName}`;
  } catch (error) {
    console.error('Error saving wallet:', error);
    throw new Error('An error occurred while saving your wallet.');
  }
}

async function getPrivateKey(chatId, inputPrivateKey) {
  try {
    // Retrieve the wallet from the database
    const wallet = await Wallet.findOne({ chatId });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Verify the private key
    const isMatch = await bcrypt.compare(inputPrivateKey + chatId, wallet.privateKey);
    if (!isMatch) {
      throw new Error('Invalid private key');
    }

    // Return the original private key if verification is successful
    return inputPrivateKey;
  } catch (error) {
    console.error('Error retrieving private key:', error);
    throw error;
  }
}

async function getApiKey(chatId) {
  try {
    // Retrieve the wallet from the database
    const wallet = await Wallet.findOne({ chatId });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Return the API key
    return wallet.apiKey;
  } catch (error) {
    console.error('Error retrieving API key:', error);
    throw error;
  }
}

async function getSolBalance(walletPublicKey) {
  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "jsonrpc": "2.0",
        "id": "1",
        "method": "getBalance",
        "params": [
          walletPublicKey
        ]
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch SOL balance');
    }
    const data = await response.json();
    return data.result.value; // Assuming the API returns balance in a field named 'result.value'
  } catch (error) {
    console.error('Error fetching SOL balance:', error);
    throw error;
  }
}

async function createAndSaveWallet(bot, msg) {
  await adminMiddleware({ msg }, null, async () => {

    try {
        const { walletPublicKey, privateKey, apiKey } = await createWallet(chatId);
        const message = await bot.sendMessage(chatId, `Your wallet has been created!\nPublic Key: ${walletPublicKey}\nPlease provide a name for your wallet. This message will self-destruct in 10 seconds if no name is provided.`, { parse_mode: 'Markdown' });

        setTimeout(() => {
        bot.deleteMessage(chatId, message.message_id).catch((error) => {
            console.error('Error deleting message:', error);
        });
        }, 10000);

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
}

async function listWallets(bot, msg) {
    // Apply middleware logic
    await adminMiddleware({ msg }, null, async () => {
      const chatId = msg.chatId; // Now using the chatId set by middleware
      const chatName = msg.chat.title
      console.log('chatName', chatName);
      try {
        // Find wallets that are not hidden
        const wallets = await Wallet.find({
          chatId,
          $or: [{ hidden: false }, { hidden: { $exists: false } }]
        });
  
        if (wallets.length === 0) {
          return bot.sendMessage(chatId, 'No wallets found for this chat.', { parse_mode: 'Markdown' });
        }
  
        const walletButtons = [];
        for (const wallet of wallets) {
          const solBalanceLamports = await getSolBalance(wallet.walletPublicKey);
          const solBalance = solBalanceLamports / 1_000_000_000;
          walletButtons.push([
            {
              text: `${wallet.walletName}: ${solBalance.toFixed(4)} SOL`,
              callback_data: `display_${wallet.walletPublicKey}`,
            },
          ]);
        }
  
        const options = {
          reply_markup: {
            inline_keyboard: walletButtons,
          }, 
          parse_mode: 'Markdown'
        };
  
        bot.sendMessage(chatId, `Here are the wallets for *${chatName}*:`, options);

        // Listen for callback queries
        bot.on('callback_query', async (callbackQuery) => {
          const data = callbackQuery.data;
          if (data.startsWith('display_')) {
            const walletPublicKey = data.split('_')[1];
            await displayWallet(bot, chatId, walletPublicKey);
          }
          bot.answerCallbackQuery(callbackQuery.id);
        });

      } catch (error) {
        console.error('Error retrieving wallets:', error);
        bot.sendMessage(chatId, 'An error occurred while retrieving wallets.', { parse_mode: 'Markdown' });
      }
    });
}

async function displayWallet(bot, chatId, walletPublicKey) {
  try {
    const wallet = await Wallet.findOne({ walletPublicKey });
    if (!wallet) {
      return bot.sendMessage(chatId, 'Wallet not found.', { parse_mode: 'Markdown' });
    }

    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Export Private Key', callback_data: `export_${walletPublicKey}` }],
          [{ text: 'Hide Wallet', callback_data: `hide_${walletPublicKey}` }],
          [{ text: 'Delete Wallet', callback_data: `delete_${walletPublicKey}` }],
        ],
      },
      parse_mode: 'Markdown'
    };

    bot.sendMessage(chatId, `Details for *${wallet.walletName}*\n\nAddress: ${wallet.walletPublicKey}`, options);

    // Handle button actions
    bot.on('callback_query', async (callbackQuery) => {
      const data = callbackQuery.data;
      if (data === `export_${walletPublicKey}`) {
        await exportPrivateKey(bot, chatId, wallet);
      } else if (data === `hide_${walletPublicKey}`) {
        await hideWallet(bot, chatId, wallet);
      } else if (data === `delete_${walletPublicKey}`) {
        await deleteWallet(bot, chatId, wallet);
      }
      bot.answerCallbackQuery(callbackQuery.id);
    });

  } catch (error) {
    console.error('Error displaying wallet:', error);
    bot.sendMessage(chatId, 'An error occurred while displaying the wallet.', { parse_mode: 'Markdown' });
  }
}

async function exportPrivateKey(bot, chatId, wallet) {
  try {
    // Retrieve the original private key using the getPrivateKey function
    const originalPrivateKey = await getPrivateKey(chatId, wallet.privateKey);

    // Send the original private key to the user
    bot.sendMessage(chatId, `Private key: ${originalPrivateKey}`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error exporting private key:', error);
    bot.sendMessage(chatId, 'An error occurred while exporting the private key.', { parse_mode: 'Markdown' });
  }
}

async function hideWallet(bot, chatId, wallet) {
  try {
    // Update the wallet's hidden status to true
    await Wallet.updateOne({ _id: wallet._id }, { hidden: true });
    bot.sendMessage(chatId, `Wallet ${wallet.walletName} is now hidden.`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error hiding wallet:', error);
    bot.sendMessage(chatId, 'An error occurred while hiding the wallet.', { parse_mode: 'Markdown' });
  }
}

async function deleteWallet(bot, chatId, wallet) {
  try {
    await Wallet.deleteOne({ _id: wallet._id });
    bot.sendMessage(chatId, `Wallet ${wallet.walletName} has been deleted.`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error deleting wallet:', error);
    bot.sendMessage(chatId, 'An error occurred while deleting the wallet.', { parse_mode: 'Markdown' });
  }
}

module.exports = {
  createWallet,
  saveWallet,
  getPrivateKey,
  getApiKey,
  getSolBalance,
  createAndSaveWallet,
  listWallets,
};
