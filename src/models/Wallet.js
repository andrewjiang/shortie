const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  chatId: { type: Number, required: true },
  walletPublicKey: { type: String, required: true },
  privateKey: { type: String, required: true },
  apiKey: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  walletName: { type: String, required: true },
});

module.exports = mongoose.model('Wallet', walletSchema);
