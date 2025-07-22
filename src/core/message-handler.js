import { logger } from '../utils/utils.js';
import { config } from '../config.js';

const DEBUG = config.app?.debug || true;
const debugLog = (...args) => DEBUG && console.log('[DEBUG]', ...args);

export class MessageHandler {
  constructor(instagramBot, moduleManager, telegramBridge) {
    this.instagramBot = instagramBot;
    this.moduleManager = moduleManager;
    this.telegramBridge = telegramBridge;
  }

  async handleMessage(message) {
    try {
      debugLog(`[MessageHandler] Processing realtime message: Type=${message.type}, Text="${message.text}", Sender=@${message.senderUsername}`);

      // Mark message as seen (optional - be careful not to seem too bot-like)
      if (config.instagram?.markAsSeen !== false) {
        await this.instagramBot.markAsSeen(message.threadId, message.id);
      }

      // Process through modules for stats/logging/pre-processing
      message = await this.moduleManager.processMessage(message);
      debugLog(`[MessageHandler] Message after module processing: Text="${message.text}"`);

      // Handle commands INSTANTLY
      if (message.text?.startsWith('.')) {
        debugLog(`[MessageHandler] Command detected: ${message.text}`);
        
        // Indicate typing for better UX
        await this.instagramBot.indicateTyping(message.threadId, true);
        
        try {
          await this.handleCommand(message);
        } finally {
          // Stop typing indicator
          await this.instagramBot.indicateTyping(message.threadId, false);
        }
        return;
      }

      // Handle special message types
      await this.handleSpecialMessageTypes(message);

      // Forward to Telegram if enabled
      if (this.telegramBridge?.enabled && config.telegram.enabled && message.shouldForward) {
        debugLog(`[MessageHandler] Forwarding to Telegram`);
        await this.telegramBridge.forwardMessage(message);
      }

    } catch (error) {
      logger.error('Message handling error:', error.message);
    }
  }

  async handleSpecialMessageTypes(message) {
    try {
      switch (message.type) {
        case 'like':
          // Auto-react to likes with a heart
          if (config.instagram?.autoReactToLikes) {
            await this.instagramBot.sendReaction(message.threadId, message.id, '❤️');
          }
          break;
          
        case 'media':
        case 'media_share':
          // Handle media messages
          debugLog(`[MessageHandler] Media message received from @${message.senderUsername}`);
          break;
          
        case 'voice_media':
          // Handle voice messages
          debugLog(`[MessageHandler] Voice message received from @${message.senderUsername}`);
          break;
          
        case 'animated_media':
          // Handle GIFs
          debugLog(`[MessageHandler] GIF received from @${message.senderUsername}`);
          break;
      }
    } catch (error) {
      logger.error('Error handling special message type:', error.message);
    }
  }

  async handleCommand(message) {
    const commandText = message.text.slice(1).trim();
    const [commandName, ...args] = commandText.split(' ');
    
    debugLog(`[MessageHandler:handleCommand] Command: "${commandName}", Args: "${args.join(' ')}"`);

    const command = this.moduleManager.getCommand(commandName);

    if (!command) {
      debugLog(`[MessageHandler:handleCommand] Command not found: "${commandName}"`);
      
      // Send helpful message for unknown commands
      if (config.instagram?.respondToUnknownCommands !== false) {
        await this.instagramBot.sendMessage(
          message.threadId, 
          `❌ Unknown command: .${commandName}\nType .help for available commands`
        );
      }
      return;
    }

    debugLog(`[MessageHandler:handleCommand] Executing command: ${command.moduleName}.${commandName}`);

    // Admin check
    if (command.adminOnly && !this.isAdmin(message.senderUsername)) {
      debugLog(`[MessageHandler:handleCommand] Access denied for @${message.senderUsername}`);
      await this.instagramBot.sendMessage(message.threadId, '❌ Admin access required');
      return;
    }

    // Rate limiting check (optional)
    if (await this.isRateLimited(message.senderUsername, commandName)) {
      await this.instagramBot.sendMessage(message.threadId, '⏰ Please wait before using this command again');
      return;
    }

    try {
      // Log command execution
      logger.info(`⚡ Command executed: .${commandName} by @${message.senderUsername} in thread ${message.threadId}`);
      
      // Create enhanced context for command
      const commandContext = {
        ...message,
        bot: this.instagramBot,
        reply: async (text) => await this.instagramBot.sendMessage(message.threadId, text),
        react: async (emoji = '❤️') => await this.instagramBot.sendReaction(message.threadId, message.id, emoji),
        typing: async (isTyping = true) => await this.instagramBot.indicateTyping(message.threadId, isTyping)
      };
      
      // Execute command with enhanced context
      await command.handler(args, commandContext);
      debugLog(`[MessageHandler:handleCommand] Command .${commandName} executed successfully`);
      
    } catch (error) {
      logger.error(`Command ${commandName} error:`, error.message);
      await this.instagramBot.sendMessage(
        message.threadId, 
        `❌ Command error: ${error.message}`
      );
    }
  }

  async isRateLimited(username, commandName) {
    // Implement rate limiting logic here
    // You might want to use Redis or in-memory cache
    // For now, return false (no rate limiting)
    return false;
  }

  isAdmin(username) {
    const isAdminUser = config.admin?.users?.includes(username.toLowerCase()) || false;
    debugLog(`[MessageHandler:isAdmin] @${username} admin status: ${isAdminUser}`);
    return isAdminUser;
  }

  // Helper method to extract mentions from message
  extractMentions(text) {
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    
    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push(match[1]);
    }
    
    return mentions;
  }

  // Helper method to extract hashtags from message
  extractHashtags(text) {
    const hashtagRegex = /#(\w+)/g;
    const hashtags = [];
    let match;
    
    while ((match = hashtagRegex.exec(text)) !== null) {
      hashtags.push(match[1]);
    }
    
    return hashtags;
  }
}