// Re-export the instagram_mqtt library components
export { withRealtime, withFbns, withFbnsAndRealtime, IgApiClientExt } from 'instagram_mqtt';

// Main application entry point
import { InstagramRealtimeBot } from './core/realtime-bot.js';
import { TelegramBridge } from './tg-bridge/bridge.js';
import { logger } from './utils/utils.js';
import { config } from './config.js';

console.clear();

class HyperInstaRealtime {
  constructor() {
    this.startTime = new Date();
    this.instagramBot = new InstagramRealtimeBot();
    this.telegramBridge = config.telegram?.enabled ? new TelegramBridge() : null;
    this.isShuttingDown = false;
  }

  async initialize() {
    try {
      this.showStartupBanner();
      
      console.log('📱 Connecting to Instagram...');
      await this.instagramBot.login();
      console.log('✅ Instagram connected');
      
      if (this.telegramBridge) {
        console.log('📨 Initializing Telegram bridge...');
        await this.telegramBridge.initialize();
        console.log('✅ Telegram bridge connected');
      }
      
      console.log('🔌 Loading modules & setting up handlers...');
      await this.instagramBot.setupMessageHandlers(this.telegramBridge);
      console.log('✅ Modules loaded & handlers ready');
      
      console.log('⚡ Connecting to Instagram realtime...');
      try {
        await this.instagramBot.connectRealtime();
        console.log('✅ Realtime connection established');
      } catch (error) {
        console.log('⚠️ Realtime connection failed, but bot will continue...');
        logger.warn('Realtime connection failed:', error.message);
      }
      
      this.showLiveStatus();
      this.setupHealthCheck();
      
    } catch (error) {
      console.log(`❌ Startup failed: ${error.message}`);
      logger.error('Startup error:', error);
      process.exit(1);
    }
  }

  setupHealthCheck() {
    // Health check every 30 seconds
    setInterval(() => {
      if (!this.isShuttingDown) {
        const stats = this.instagramBot.getStats();
        
        if (!stats.connected && !stats.polling) {
          logger.warn('⚠️ Bot is not connected via realtime or polling');
        }
        
        // Log stats every 5 minutes
        if (Date.now() % (5 * 60 * 1000) < 30000) {
          logger.info('📊 Bot stats:', stats);
        }
      }
    }, 30000);
  }

  showStartupBanner() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    🚀 HYPER INSTA REALTIME - INITIALIZING                  ║
║                                                              ║
║    ⚡ Real-time MQTT • 🔌 Modular • 🛡️ Anti-Flag           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
  }

  showLiveStatus() {
    const uptime = Date.now() - this.startTime;
    const stats = this.instagramBot.getStats();
    
    console.clear();
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    🚀 HYPER INSTA REALTIME - LIVE & OPERATIONAL            ║
║                                                              ║
║    ${stats.connected ? '✅ Instagram: Connected via MQTT Realtime' : stats.polling ? '🔄 Instagram: Safe Polling Mode (Flagged)' : '❌ Instagram: Disconnected'}               ║
║    ${this.telegramBridge ? '✅' : '❌'} Telegram: ${this.telegramBridge ? 'Connected & Bridged' : 'Disabled'}                        ║
║    ⚡ Startup Time: ${Math.round(uptime)}ms                                  ║
║    🕒 Started: ${this.startTime.toLocaleTimeString()}                                ║
║                                                              ║
║    🎯 Ready for ${stats.connected ? 'INSTANT real-time' : 'safe polling'} commands...              ║
║    ${stats.connected ? '🛡️ No more polling - Instagram friendly!' : '🛡️ Safe polling mode - won\'t get more flags!'}                ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

${stats.connected ? '🔥 Bot is running with REAL-TIME MQTT!' : '🔄 Bot is running in SAFE POLLING MODE!'}
💡 Type .help in Instagram to see all commands
${stats.connected ? '🚫 No more API polling - much safer from flags!' : '⚠️ Account flagged - using safe 45s intervals'}
    `);
  }

  async start() {
    await this.initialize();
    
    // Graceful shutdown handlers
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      this.isShuttingDown = true;
      
      try {
        await this.instagramBot.disconnect();
        
        if (this.telegramBridge) {
          await this.telegramBridge.disconnect();
        }
        
        console.log('✅ Hyper Insta Realtime stopped gracefully');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }
}

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const bot = new HyperInstaRealtime();
  bot.start().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}