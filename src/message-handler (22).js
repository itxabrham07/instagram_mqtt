// message-handler.js
import { logger } from '../utils/utils.js';
import { config } from '../config.js';

// 🔧 Global Debug Flag (ensure this is consistent with bot.js or use config.app.logLevel)
const DEBUG = true;
const debugLog = (...args) => DEBUG && console.log('[DEBUG]', ...args);

export class MessageHandler {
  constructor(instagramBot, moduleManager, telegramBridge) {
    this.instagramBot = instagramBot;
    this.moduleManager = moduleManager;
    this.telegramBridge = telegramBridge;
  }

  async handleMessage(message) {
    try {
      debugLog(`[MessageHandler] Incoming message for processing: Type=${message.type}, Text="${message.text}", Sender=@${message.senderUsername}`);

      // Process through modules for stats/logging/pre-processing
      const originalMessageText = message.text; // Store original text for comparison
      message = await this.moduleManager.processMessage(message);
      debugLog(`[MessageHandler] Message after module processing: Text="${message.text}"`);

      // Handle commands INSTANTLY
      if (message.text?.startsWith('.')) {
        debugLog(`[MessageHandler] Message starts with '.', attempting to handle as command.`);
        await this.handleCommand(message);
        return;
      } else {
        debugLog(`[MessageHandler] Message does NOT start with '.', not a command.`);
      }

      // Forward to Telegram if enabled
      if (this.telegramBridge?.enabled && config.telegram.enabled) {
        debugLog(`[MessageHandler] Telegram bridge enabled, forwarding message.`);
        await this.telegramBridge.forwardMessage(message);
      } else {
        debugLog(`[MessageHandler] Telegram bridge disabled or not enabled in config. Skipping forwarding.`);
      }

    } catch (error) {
      logger.error('Message handling error:', error.message);
    }
  }

  async handleCommand(message) {
    const commandText = message.text.slice(1).trim();
    const [commandName, ...args] = commandText.split(' ');
    
    debugLog(`[MessageHandler:handleCommand] Raw command text: "${commandText}"`);
    debugLog(`[MessageHandler:handleCommand] Parsed command name: "${commandName}", Args: "${args.join(' ')}"`);

    const command = this.moduleManager.getCommand(commandName);

    if (!command) {
      debugLog(`[MessageHandler:handleCommand] No command found for name: "${commandName}".`);
      // Optionally, send a "command not found" message to the user
      // await this.instagramBot.sendMessage(message.threadId, `❌ Command '.${commandName}' not found.`);
      return;
    }

    debugLog(`[MessageHandler:handleCommand] Command found: ${command.moduleName}.${commandName}`);

    // Admin check
    if (command.adminOnly && !this.isAdmin(message.senderUsername)) {
      debugLog(`[MessageHandler:handleCommand] User @${message.senderUsername} is not admin for command .${commandName}.`);
      await this.instagramBot.sendMessage(message.threadId, '❌ Admin only');
      return;
    } else if (command.adminOnly) {
      debugLog(`[MessageHandler:handleCommand] User @${message.senderUsername} is admin. Proceeding.`);
    }


    try {
      // Log command execution
      logger.info(`⚡ Command executed: .${commandName} by @${message.senderUsername}`);
      
      // Execute command INSTANTLY
      await command.handler(args, message);
      debugLog(`[MessageHandler:handleCommand] Command .${commandName} handler executed successfully.`);
      
    } catch (error) {
      logger.error(`Command ${commandName} error:`, error.message);
      await this.instagramBot.sendMessage(message.threadId, `❌ Error: ${error.message}`);
    }
  }

  isAdmin(username) {
    const isAdminUser = config.admin.users.includes(username.toLowerCase());
    debugLog(`[MessageHandler:isAdmin] Checking if @${username} is admin. Result: ${isAdminUser}`);
    return isAdminUser;
  }
}
