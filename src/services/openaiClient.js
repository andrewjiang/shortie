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
  const prompt = `You are a helpful assistant tasked with summarizing group chat discussions. The following messages are from a memecoin and cryptocurrency trading Telegram group chat over the past 12 hours. The odd strings you see are likely contract addresses for tokens. Please provide a concise summary that captures the main topics discussed, tokens that you think did really well and really poorly, and see if you can figure out an MVP group chat participant for the past 12 hours. Focus on clarity, guy humor, and brevity. Do not summarize anything beyond these messages sent to you.": ${messages.join('\n')}`;

  console.log('prompt', prompt);
  
  try {
    const chatCompletion = await retryWithBackoff(() => client.chat.completions.create({
      messages: [
        { role: 'system', content: `You are a hilarious memecoin and cryptocurrency trading assistant that tries to be insightful and bro humor funny, without being too longwinded. Keep things concise and make all the topic headers bold with single * around the fully uppercase words, e.g. *BOLD*. Put @ in front of usernames to link to their profile. Use Telegram formatting such as *bold* for emphasis, _italic_ for subtlety, and \`code\` for special terms or addresses.` },
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
