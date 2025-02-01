require('dotenv').config();

const OpenAI = require('openai');
const retryWithBackoff = require('../utils/retry');
const Setting = require('../models/Setting');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // This is the default and can be omitted
});

async function summarizeMessages(messages, chatId) {
  let language = 'English'; // Default language

  console.log('chatId', chatId);

  try {
    let setting = await Setting.findOne({ chatId });
    if (!setting) {
      setting = new Setting({ chatId });
      await setting.save();
    }
    language = setting.language;
    console.log('language for chatId', chatId, 'is', language);
  } catch (error) {
    console.error('Error retrieving or creating setting:', error);
  }

  console.log("Messages sent to OpenAI: ", messages);
  const prompt = `You are a helpful assistant tasked with summarizing group chat discussions. The following messages are from a Telegram group chat over the past 24 hours. Please provide a concise summary that captures the main topics discussed, any decisions made, and any action items mentioned. Focus on clarity and brevity. Do not summarize anything beyond these messages sent to you.": ${messages.join('\n')}`;

  console.log('prompt', prompt);
  
  try {
    const chatCompletion = await retryWithBackoff(() => client.chat.completions.create({
      messages: [
        { role: 'system', content: `You are a helpful assistant that replies in ${language}.` },
        { role: 'user', content: prompt }
      ],
      model: 'gpt-4o',
    }));
    return chatCompletion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error summarizing messages after retries:', error);
    throw error;
  }
}

module.exports = { summarizeMessages };
