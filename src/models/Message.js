const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  messageId: { type: Number, required: true },
  userId: { type: Number, required: true },
  username: { type: String },
  chatId: { type: Number, required: true },
  date: { type: Date, required: true },
  text: { type: String, required: true },
});

module.exports = mongoose.model('Message', messageSchema);