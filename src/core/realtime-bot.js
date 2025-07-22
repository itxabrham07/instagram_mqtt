import { withRealtime } from '../index.js';
import { IgApiClient } from 'instagram-private-api';
import { logger } from '../utils/utils.js';
import { config } from '../config.js';
import { SessionManager } from './session-manager.js';
import { MessageHandler } from './message-handler.js';
import { ModuleManager } from './module-manager.js';

export class InstagramRealtimeBot {
  constructor() {
    // Use the extended client with realtime capabilities
    this.ig = withRealtime(new IgApiClient());
    this.sessionManager = new SessionManager(this.ig);
    this.moduleManager = new ModuleManager(this);
    this.messageHandler = new MessageHandler(this, this.moduleManager, null);
    
    // Connection state
    this.isRealtimeConnected = false;
    this.isPolling = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.pollingInterval = null;
    this.lastMessageCheck = new Date();
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
      
      // Try to get initial inbox data for iris subscription
      let inboxData = null;
      try {
        inboxData = await this.ig.feed.directInbox().request();
        logger.info('✅ Inbox access successful');
      } catch (error) {
        logger.warn('⚠️ Cannot access inbox (account may be flagged), using fallback polling...');
        await this.startFallbackPolling();
        return;
      }
      
      // Setup realtime event listeners
      this.setupRealtimeListeners();
      
      // Connect to realtime with subscriptions
      await this.ig.realtime.connect({
        // GraphQL subscriptions for various real-time events
        graphQlSubs: [
          // App presence subscription
          '1/graphqlsubscriptions/17846944882223835/{"input_data":{"client_subscription_id":"' + this.generateUUID() + '"}}',
          // Direct status subscription  
          '1/graphqlsubscriptions/17854499065530643/{"input_data":{"client_subscription_id":"' + this.generateUUID() + '"}}',
          // Direct typing subscription
          '1/graphqlsubscriptions/17867973967082385/{"input_data":{"user_id":"' + this.ig.state.cookieUserId + '"}}',
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

      this.isRealtimeConnected = true;
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
          logger.debug(`User typing in thread: ${this.extractThreadId(directData.path)}`);
        }
      } catch (error) {
        logger.error('Error handling direct event:', error.message);
      }
    });

    // Handle connection errors
    this.ig.realtime.on('error', async (error) => {
      logger.error('Realtime connection error:', error.message);
      this.isRealtimeConnected = false;
      await this.handleReconnection();
    });

    // Handle disconnections
    this.ig.realtime.on('disconnect', async () => {
      logger.warn('⚠️ Realtime connection lost');
      this.isRealtimeConnected = false;
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
        rawMessage: message
      };

      logger.info(`📨 [REALTIME] New message from @${processedMessage.senderUsername}: ${processedMessage.text}`);
      
      // Process the message through our handler
      await this.messageHandler.handleMessage(processedMessage);

    } catch (error) {
      logger.error('Error processing realtime message:', error.message);
    }
  }

  // FALLBACK POLLING SYSTEM FOR FLAGGED ACCOUNTS
  async startFallbackPolling() {
    if (this.isPolling) return;
    
    this.isPolling = true;
    this.isRealtimeConnected = false;
    
    logger.info('🔄 Starting fallback polling mode (safe for flagged accounts)...');
    
    // Use longer intervals to avoid further flags
    const pollInterval = 45000; // 45 seconds - much safer
    
    this.pollingInterval = setInterval(async () => {
      if (this.isPolling) {
        try {
          await this.checkForNewMessages();
        } catch (error) {
          if (error.message.includes('login_required')) {
            logger.warn('Login required, attempting re-login...');
            try {
              await this.login();
            } catch (loginError) {
              logger.error('Re-login failed:', loginError.message);
            }
          } else if (error.message.includes('403') || error.message.includes('429')) {
            logger.warn('Rate limited, increasing poll interval...');
            // Temporarily increase interval when rate limited
            clearInterval(this.pollingInterval);
            setTimeout(() => {
              if (this.isPolling) {
                this.startFallbackPolling();
              }
            }, 120000); // Wait 2 minutes before resuming
          }
        }
      }
    }, pollInterval);
    
    logger.info(`✅ Fallback polling started (${pollInterval/1000}s intervals)`);
  }

  async checkForNewMessages() {
    try {
      const inboxFeed = this.ig.feed.directInbox();
      const inbox = await inboxFeed.items();
      
      if (!inbox?.length) return;

      // Only check first 3 threads to reduce API calls
      for (const thread of inbox.slice(0, 3)) {
        await this.checkThreadMessages(thread);
        await this.delay(3000); // 3 second delay between threads
      }

    } catch (error) {
      throw error;
    }
  }

  async checkThreadMessages(thread) {
    try {
      const threadFeed = this.ig.feed.directThread({ thread_id: thread.thread_id });
      const messages = await threadFeed.items();
      
      if (!messages?.length) return;

      const latestMessage = messages[0];
      
      if (this.isNewMessage(latestMessage)) {
        await this.handlePollingMessage(latestMessage, thread);
      }

    } catch (error) {
      // Silent fail for thread errors to avoid spam
      logger.debug('Thread check error:', error.message);
    }
  }

  isNewMessage(message) {
    const messageTime = new Date(message.timestamp / 1000);
    const isNew = messageTime > this.lastMessageCheck;
    
    if (isNew) {
      this.lastMessageCheck = messageTime;
    }
    
    return isNew;
  }

  async handlePollingMessage(message, thread) {
    try {
      // Skip our own messages
      if (message.user_id?.toString() === this.ig.state.cookieUserId) {
        return;
      }

      const sender = thread.users.find(u => u.pk.toString() === message.user_id.toString());
      
      const processedMessage = {
        id: message.item_id,
        text: message.text || this.extractMessageText(message),
        sender: message.user_id,
        senderUsername: sender?.username || 'Unknown',
        senderDisplayName: sender?.full_name || sender?.username || 'Unknown',
        timestamp: new Date(message.timestamp / 1000),
        threadId: thread.thread_id,
        threadTitle: thread.thread_title || 'Direct Message',
        type: message.item_type || 'text',
        shouldForward: true,
        rawMessage: message
      };

      logger.info(`📨 [POLLING] New message from @${processedMessage.senderUsername}: ${processedMessage.text}`);
      
      await this.messageHandler.handleMessage(processedMessage);

    } catch (error) {
      logger.error('Handle polling message error:', error.message);
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
    const delay = Math.min(4000 * Math.pow(2, this.reconnectAttempts), 60000);
    
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
      if (this.ig.realtime && this.isRealtimeConnected) {
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
      if (this.ig.realtime && this.isRealtimeConnected) {
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
      if (this.ig.realtime && this.isRealtimeConnected) {
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
      if (this.ig.realtime && this.isRealtimeConnected) {
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
      logger.info('🛑 Disconnecting from Instagram...');
      
      // Stop polling
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }
      this.isPolling = false;
      this.isRealtimeConnected = false;
      
      // Disconnect realtime if connected
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

  // Utility methods
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Method to get bot statistics
  getStats() {
    return {
      connected: this.isRealtimeConnected,
      polling: this.isPolling,
      reconnectAttempts: this.reconnectAttempts,
      userId: this.ig.state.cookieUserId,
      username: this.ig.state.cookieUsername
    };
  }
}