# Instagram Realtime Bot

A modern Instagram bot built with real-time MQTT connections to avoid polling and reduce the risk of being flagged by Instagram.

## 🚀 Features

- **Real-time MQTT Connection**: No more polling! Uses Instagram's official MQTT protocol
- **Anti-Flag Protection**: Much safer than traditional polling bots
- **Modular Architecture**: Easy to extend with custom modules
- **Command System**: Prefix-based commands (e.g., `.help`, `.ping`)
- **Telegram Integration**: Optional Telegram bridge for notifications
- **Admin System**: Role-based command access
- **Auto-reconnection**: Robust connection handling with exponential backoff
- **Rate Limiting**: Built-in protection against spam
- **Database Integration**: MongoDB for persistent storage

## 🛡️ Why Real-time MQTT?

Traditional Instagram bots use polling (constantly checking for new messages), which:
- Creates suspicious API patterns
- Increases ban risk
- Wastes resources
- Has delays

This bot uses Instagram's real-time MQTT protocol:
- ✅ Instant message delivery
- ✅ Natural connection patterns
- ✅ Lower ban risk
- ✅ More efficient

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd instagram-realtime-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Setup MongoDB** (optional but recommended)
   ```bash
   # Install MongoDB locally or use MongoDB Atlas
   # Update MONGODB_URL in .env
   ```

## ⚙️ Configuration

Edit your `.env` file:

```env
# Instagram Configuration
IG_USERNAME=your_instagram_username
IG_MARK_AS_SEEN=true
IG_AUTO_REACT_LIKES=false
IG_RESPOND_UNKNOWN=true

# Admin Configuration
ADMIN_USERS=your_username,another_admin

# Optional: Telegram Integration
TG_ENABLED=false
TG_BOT_TOKEN=your_telegram_bot_token
TG_CHAT_ID=your_telegram_chat_id

# Database
MONGODB_URL=mongodb://localhost:27017/instagram-bot
```

## 🚀 Usage

1. **Start the bot**
   ```bash
   npm start
   ```

2. **Login to Instagram**
   - The bot will prompt for login or use saved cookies
   - For first-time setup, you might need to provide cookies

3. **Test the bot**
   - Send `.ping` to the bot via Instagram DM
   - Use `.help` to see available commands

## 📋 Available Commands

### Core Commands
- `.ping` - Test bot responsiveness
- `.help [command]` - Show help information
- `.commands` - List all available commands
- `.status` - Show bot statistics (admin only)
- `.react [emoji]` - React to message with emoji
- `.typing [seconds]` - Show typing indicator

### Admin Commands
- `.status` - Detailed bot statistics
- Add more admin commands by creating modules

## 🔧 Creating Custom Modules

Create a new file in `src/modules/`:

```javascript
export class MyModule {
  constructor() {
    this.name = 'my-module';
  }

  getCommands() {
    return {
      mycommand: {
        description: 'My custom command',
        usage: '.mycommand [args]',
        adminOnly: false,
        handler: this.handleMyCommand.bind(this)
      }
    };
  }

  async handleMyCommand(args, context) {
    await context.reply('Hello from my custom command!');
    await context.react('👋');
  }

  async process(message) {
    // Process every message (optional)
    return message;
  }

  async cleanup() {
    // Cleanup when bot shuts down
  }
}
```

## 🔒 Security Features

- **Rate Limiting**: Prevents command spam
- **Admin System**: Restrict sensitive commands
- **Input Validation**: Sanitize user inputs
- **Error Handling**: Graceful error recovery
- **Connection Security**: Secure MQTT connections

## 📊 Monitoring

The bot includes built-in monitoring:
- Connection status tracking
- Automatic reconnection
- Health checks every 30 seconds
- Detailed logging
- Statistics collection

## 🚨 Important Notes

1. **Cookie Management**: Keep your Instagram cookies secure
2. **Rate Limits**: Don't spam commands to avoid Instagram limits
3. **Admin Users**: Set up admin users in the config
4. **Database**: Use MongoDB for persistence (recommended)
5. **Monitoring**: Watch logs for connection issues

## 🛠️ Troubleshooting

### Connection Issues
- Check your Instagram credentials
- Verify network connectivity
- Look for rate limiting messages

### Command Not Working
- Ensure commands start with `.`
- Check if user has required permissions
- Verify module is loaded correctly

### Database Issues
- Ensure MongoDB is running
- Check connection string in `.env`
- Verify database permissions

## 📈 Performance

This real-time bot is significantly more efficient than polling bots:
- **Instant responses** (vs 1-5 second delays)
- **Lower resource usage** (no constant API calls)
- **Reduced ban risk** (natural connection patterns)
- **Better user experience** (real-time interactions)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This bot is for educational purposes. Use responsibly and comply with Instagram's Terms of Service. The authors are not responsible for any account restrictions or bans.

## 🆘 Support

If you encounter issues:
1. Check the troubleshooting section
2. Review the logs for error messages
3. Open an issue on GitHub
4. Join our community discussions

---

**Happy botting! 🤖✨**