async function adminMiddleware(req, res, next) {
    const isAdmin = req.msg.from.id === 877749921;
    const adminChatId = req.msg.chat.id;
  
    console.log("isAdmin:", isAdmin);
    console.log("adminChatId:", adminChatId);
    console.log("msg.text:", req.msg.text);
  
    req.msg.chatId = isAdmin && req.msg.text && req.msg.text.trim().split(' ').length > 1 
      ? extractChatIdFromText(req.msg.text) || adminChatId 
      : adminChatId;
  
    console.log("Determined chatId:", req.msg.chatId);
  
    await next();
  }
  
  module.exports = adminMiddleware;