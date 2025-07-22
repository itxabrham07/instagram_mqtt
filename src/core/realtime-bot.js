import { withRealtime } from 'instagram_mqtt';
import { IgApiClient } from 'instagram-private-api';
import { logger } from '../utils/utils.js';
import { config } from '../config.js';
import { SessionManager } from './session-manager.js';
import { MessageHandler } from './message-handler.js';
import { ModuleManager } from './module-manager.js';
import { GraphQLSubscriptions } from 'instagram_mqtt';

export class InstagramRealtimeBot {
  constructor() {
    // Use the extended client with realtime capabilities
    this.ig = withRealtime(new IgApiClient());
    this.sessionManager = new SessionManager(this.ig);
    this.moduleManager = new ModuleManager(this);
    this.messageHandler = new MessageHandler(this, this.moduleManager, null);
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async login() {
    try {
      logger.info('🔐 Logging into Instagram...');
      const success = await this.sessionManager.login();
      if (success) {
        logger.info('✅ Instagram login successful');
        return true;
      }
      throw new Error('Login failed');
    } catch (error) {
      logger.error('❌ Instagram login failed:', error.message);
      throw error;
    }
  }

  async setupMessageHandlers(telegramBridge) {
    // Load modules first
    await this.moduleManager.loadModules();
    
    // Update message handler with telegram bridge
    this.messageHandler = new MessageHandler(this, this.moduleManager, telegramBridge);
    
    // Setup Telegram reply handler
    if (telegramBridge?.enabled) {
      telegramBridge.onMessage(async (reply) => {
        if (reply.type === 'telegram_reply') {
          await this.sendMessage(reply.threadId, reply.text);
        }
      });
    }
  }

  async connectRealtime() {
    try {
      logger.info('🔌 Connecting to Instagram realtime...');
      
      // Setup realtime event listeners
      this.setupRealtimeListeners();
      
      // Try to get initial inbox data for iris subscription
      let inboxData = null;
      try {
        inboxData = await this.ig.feed.directInbox().request();
      } catch (error) {
        logger.warn('⚠️ Cannot access inbox (account may be flagged), using fallback polling...');
        // Start fallback polling instead
        await this.startFallbackPolling();
        return;
      }
      
      // Connect to realtime with subscriptions
      await this.ig.realtime.connect({
        // GraphQL subscriptions for various real-time events
        graphQlSubs: [
          GraphQLSubscriptions.getAppPresenceSubscription(),
          GraphQLSubscriptions.getDirectStatusSubscription(),
          GraphQLSubscriptions.getDirectTypingSubscription(this.ig.state.cookieUserId),
          GraphQLSubscriptions.getClientConfigUpdateSubscription(),
        ],
        
        // Iris subscription for direct messages
        irisData: {
          seq_id: inboxData.seq_id || 0,
          snapshot_at_ms: inboxData.snapshot_at_ms || Date.now()
        },
        
        // Connection settings
        connectOverrides: {
          keepAliveTimeout: 60,
        }
      });

      this.isConnected = true;
      this.reconnectAttempts = 0;
      logger.info('✅ Instagram realtime connected successfully');
      
    } catch (error) {
      logger.error('❌ Failed to connect to realtime:', error.message);
      await this.handleReconnection();
      throw error;
    }
  }

  setupRealtimeListeners() {
    // Handle incoming direct messages
    this.ig.realtime.on('message', async (messageWrapper) => {
      try {
        await this.handleRealtimeMessage(messageWrapper);
      } catch (error) {
        logger.error('Error handling realtime message:', error.message);
      }
    });

    // Handle thread updates (user joins/leaves, etc.)
    this.ig.realtime.on('threadUpdate', async (threadUpdate) => {
      try {
        logger.debug('Thread update received:', threadUpdate.meta);
      } catch (error) {
        logger.error('Error handling thread update:', error.message);
      }
    });

    // Handle typing indicators
    this.ig.realtime.on('direct', async (directData) => {
      try {
        if (directData.op === 'replace' && directData.path?.includes('activity_indicator_id')) {
          // Someone is typing
          logger.debug(`User typing in thread: ${this.extractThreadId(directData.path)}`);
        }
      } catch (error) {
        logger.error('Error handling direct event:', error.message);
      }
    });

    // Handle presence updates
    this.ig.realtime.on('appPresence', (presenceData) => {
      logger.debug('Presence update:', presenceData.presence_event);
    });

    // Handle connection errors
    this.ig.realtime.on('error', async (error) => {
      logger.error('Realtime connection error:', error.message);
      this.isConnected = false;
      await this.handleReconnection();
    });

    // Handle disconnections
    this.ig.realtime.on('disconnect', async () => {
      logger.warn('⚠️ Realtime connection lost');
      this.isConnected = false;
      await this.handleReconnection();
    });

    // Handle warnings
    this.ig.realtime.on('warning', (warning) => {
      logger.warn('Realtime warning:', warning.message);
    });
  }

  async handleRealtimeMessage(messageWrapper) {
    try {
      const { message } = messageWrapper;
      
      // Skip if no message data
      if (!message || !message.item_id) {
        return;
      }

      // Skip our own messages
      if (message.user_id?.toString() === this.ig.state.cookieUserId) {
        return;
      }

      // Get thread information
      const threadId = message.thread_id;
      if (!threadId) {
        logger.warn('Message received without thread_id');
        return;
      }

      // Get thread details to find sender info
      const thread = await this.getThreadInfo(threadId);
      if (!thread) {
        logger.warn(`Could not get thread info for ${threadId}`);
        return;
      }

      const sender = thread.users?.find(u => u.pk?.toString() === message.user_id?.toString());
      
      const processedMessage = {
        id: message.item_id,
        text: message.text || this.extractMessageText(message),
        sender: message.user_id,
        senderUsername: sender?.username || 'Unknown',
        senderDisplayName: sender?.full_name || sender?.username || 'Unknown',
        timestamp: new Date(parseInt(message.timestamp) / 1000),
        threadId: threadId,
        threadTitle: thread.thread_title || 'Direct Message',
        type: message.item_type || 'text',
        shouldForward: true,
        rawMessage: message // Keep raw message for advanced processing
      };

      logger.info(`📨 New message from @${processedMessage.senderUsername}: ${processedMessage.text}`);
      
      // Process the message through our handler
      await this.messageHandler.handleMessage(processedMessage);

    } catch (error) {
      logger.error('Error processing realtime message:', error.message);
    }
  }

  extractMessageText(message) {
    // Handle different message types
    switch (message.item_type) {
      case 'text':
        return message.text || '';
      case 'media':
        return message.media?.caption?.text || '[Media]';
      case 'media_share':
        return `[Shared: ${message.media_share?.caption?.text || 'Media'}]`;
      case 'like':
        return '❤️';
      case 'hashtag':
        return `#${message.hashtag?.name || 'hashtag'}`;
      case 'location':
        return `📍 ${message.location?.name || 'Location'}`;
      case 'profile':
        return `👤 @${message.profile?.username || 'user'}`;
      case 'voice_media':
        return '🎵 [Voice Message]';
      case 'animated_media':
        return '🎭 [GIF]';
      default:
        return `[${message.item_type || 'Unknown'}]`;
    }
  }

  async getThreadInfo(threadId) {
    try {
      // Try to get from cache first (you might want to implement caching)
      const thread = await this.ig.entity.directThread(threadId).info();
      return thread;
    } catch (error) {
      logger.error(`Failed to get thread info for ${threadId}:`, error.message);
      return null;
    }
  }

  extractThreadId(path) {
    const match = path.match(/\/direct_v2\/threads\/(\d+)/);
    return match ? match[1] : null;
  }

  async handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('❌ Max realtime reconnection attempts reached.');
      logger.info('🔄 Switching to fallback polling mode...');
      await this.startFallbackPolling();
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000); // Exponential backoff, max 60s
    
    logger.info(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`);
    
    setTimeout(async () => {
      try {
        await this.connectRealtime();
      } catch (error) {
        logger.error('Reconnection failed:', error.message);
        await this.handleReconnection();
      }
    }, delay);
  }

  async sendMessage(threadId, text) {
    try {
      // Use realtime client for sending if available
      if (this.ig.realtime && this.isConnected) {
        await this.ig.realtime.direct.sendText({
          threadId: threadId,
          text: text
        });
      } else {
        // Fallback to regular API
        await this.ig.entity.directThread(threadId).broadcastText(text);
      }
      return true;
    } catch (error) {
      logger.error('Failed to send message:', error.message);
      return false;
    }
  }

  async sendReaction(threadId, itemId, emoji = '❤️') {
    try {
      if (this.ig.realtime && this.isConnected) {
        await this.ig.realtime.direct.sendReaction({
          threadId: threadId,
          itemId: itemId,
          emoji: emoji,
          reactionStatus: 'created'
        });
      }
      return true;
    } catch (error) {
      logger.error('Failed to send reaction:', error.message);
      return false;
    }
  }

  async markAsSeen(threadId, itemId) {
    try {
      if (this.ig.realtime && this.isConnected) {
        await this.ig.realtime.direct.markAsSeen({
          threadId: threadId,
          itemId: itemId
        });
      }
      return true;
    } catch (error) {
      logger.error('Failed to mark as seen:', error.message);
      return false;
    }
  }

  async indicateTyping(threadId, isTyping = true) {
    try {
      if (this.ig.realtime && this.isConnected) {
        await this.ig.realtime.direct.indicateActivity({
          threadId: threadId,
          isActive: isTyping
        });
      }
      return true;
    } catch (error) {
      logger.error('Failed to indicate typing:', error.message);
      return false;
    }
  }

  async disconnect() {
    try {
      logger.info('🛑 Disconnecting from Instagram realtime...');
      this.isConnected = false;
      
      if (this.ig.realtime) {
        await this.ig.realtime.disconnect();
      }
      
      // Save cookies to DB on disconnect
      await this.sessionManager.saveCookiesToDb();
      await this.moduleManager.cleanup();
      
      logger.info('✅ Disconnected successfully');
    } catch (error) {
      logger.error('Error during disconnect:', error.message);
    }
  }

  // Utility method to check connection status
  isRealtimeConnected() {
    return this.isConnected && this.ig.realtime;
  }

  // Method to get bot statistics
  getStats() {
    return {
      connected: this.isConnected,
      polling: this.isPolling || false,
      reconnectAttempts: this.reconnectAttempts,
      userId: this.ig.state.cookieUserId,
      username: this.ig.state.cookieUsername
    };
  }
}