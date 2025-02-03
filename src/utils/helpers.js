
function extractChatIdFromText(text) {
    const parts = text.split(' ');
    if (parts.length > 1) {
        const chatId = parseInt(parts[1], 10);
        if (!isNaN(chatId)) {
        return chatId;
        }
    }
    return null;
}

module.exports = { extractChatIdFromText };