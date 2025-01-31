const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  chatId: { type: Number, required: true, unique: true },
  language: { type: String, default: 'English' },
});

module.exports = mongoose.model('Setting', settingSchema);
