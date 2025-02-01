const fetch = require('node-fetch');
const bcrypt = require('bcrypt');
const Wallet = require('../models/Wallet');

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

module.exports = { createWallet, saveWallet, getPrivateKey, getApiKey, getSolBalance };
