export class CoreModule {
  constructor(instagramBot) {
    this.name = 'core';
    this.instagramBot = instagramBot;
  }

  getCommands() {
    return {
      ping: {
        description: 'Check if bot is responsive',
        usage: '.ping',
        adminOnly: false,
        handler: this.handlePing.bind(this)
      },
      
      status: {
        description: 'Get bot status and statistics',
        usage: '.status',
        adminOnly: true,
        handler: this.handleStatus.bind(this)
      },
      
      react: {
        description: 'React to the message with an emoji',
        usage: '.react [emoji]',
        adminOnly: false,
        handler: this.handleReact.bind(this)
      },
      
      typing: {
        description: 'Show typing indicator for a few seconds',
        usage: '.typing [seconds]',
        adminOnly: false,
        handler: this.handleTyping.bind(this)
      }
    };
  }

  async handlePing(args, context) {
    const start = Date.now();
    await context.reply('🏓 Pong!');
    const latency = Date.now() - start;
    
    setTimeout(async () => {
      await context.reply(`⚡ Response time: ${latency}ms\n🔗 Realtime: ${this.instagramBot.isRealtimeConnected() ? 'Connected' : 'Disconnected'}`);
    }, 1000);
  }

  async handleStatus(args, context) {
    const stats = this.instagramBot.getStats();
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    const statusMessage = `
📊 **Bot Status**

🔗 **Connection:** ${stats.connected ? '✅ Realtime Connected' : stats.polling ? '🔄 Polling Mode' : '❌ Disconnected'}
🔄 **Reconnects:** ${stats.reconnectAttempts}
👤 **User ID:** ${stats.userId}
📱 **Username:** @${stats.username}
⏱️ **Uptime:** ${hours}h ${minutes}m
🧠 **Memory:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB

${stats.connected ? '🚀 **Realtime MQTT Active**' : stats.polling ? '🔄 **Fallback Polling Mode**' : '❌ **Disconnected**'}
    `.trim();

    await context.reply(statusMessage);
  }

  async handleReact(args, context) {
    const emoji = args[0] || '❤️';
    await context.react(emoji);
    
    // Don't send a text reply for reactions to keep it clean
  }

  async handleTyping(args, context) {
    const seconds = parseInt(args[0]) || 3;
    const maxSeconds = 10; // Limit to prevent abuse
    
    const duration = Math.min(seconds, maxSeconds);
    
    await context.typing(true);
    await context.reply(`⌨️ Typing for ${duration} seconds...`);
    
    setTimeout(async () => {
      await context.typing(false);
      await context.reply('✅ Done typing!');
    }, duration * 1000);
  }

  async process(message) {
    // Log all messages for statistics
    console.log(`📨 [${new Date().toISOString()}] @${message.senderUsername}: ${message.text}`);
    return message;
  }

  async cleanup() {
    // Cleanup resources if needed
  }
}