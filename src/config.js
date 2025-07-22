export const config = {
  instagram: {
    username: process.env.IG_USERNAME || '',
    // Auto-mark messages as seen (be careful - might seem bot-like)
    markAsSeen: process.env.IG_MARK_AS_SEEN !== 'false',
    // Auto-react to likes with hearts
    autoReactToLikes: process.env.IG_AUTO_REACT_LIKES === 'true',
    // Respond to unknown commands
    respondToUnknownCommands: process.env.IG_RESPOND_UNKNOWN !== 'false'
  },
  
  telegram: {
    enabled: process.env.TG_ENABLED === 'true',
    botToken: process.env.TG_BOT_TOKEN || '',
    chatId: process.env.TG_CHAT_ID || ''
  },
  
  admin: {
    users: (process.env.ADMIN_USERS || '').split(',').map(u => u.trim().toLowerCase()).filter(Boolean)
  },
  
  app: {
    debug: process.env.DEBUG === 'true',
    logLevel: process.env.LOG_LEVEL || 'info'
  },
  
  database: {
    uri: process.env.MONGODB_URL || 'mongodb://localhost:27017/instagram-bot',
    enabled: process.env.MONGODB_ENABLED !== 'false'
  }
};