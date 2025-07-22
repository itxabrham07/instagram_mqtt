export class HelpModule {
  constructor(moduleManager) {
    this.name = 'help';
    this.moduleManager = moduleManager;
  }

  getCommands() {
    return {
      help: {
        description: 'Show available commands',
        usage: '.help [command]',
        adminOnly: false,
        handler: this.handleHelp.bind(this)
      },
      
      commands: {
        description: 'List all available commands',
        usage: '.commands',
        adminOnly: false,
        handler: this.handleCommands.bind(this)
      }
    };
  }

  async handleHelp(args, context) {
    if (args.length > 0) {
      // Show help for specific command
      const commandName = args[0].toLowerCase();
      const command = this.moduleManager.getCommand(commandName);
      
      if (!command) {
        await context.reply(`❌ Command '.${commandName}' not found.`);
        return;
      }
      
      const helpText = `
📖 **Command Help: .${commandName}**

📝 **Description:** ${command.description}
💡 **Usage:** ${command.usage}
🔒 **Admin Only:** ${command.adminOnly ? 'Yes' : 'No'}
🏷️ **Module:** ${command.moduleName}
      `.trim();
      
      await context.reply(helpText);
    } else {
      // Show general help
      const helpText = `
🤖 **Instagram Realtime Bot Help**

⚡ **Real-time MQTT Connection** - No polling!
🛡️ **Instagram-friendly** - Reduced flag risk

📋 **Quick Commands:**
• .help [command] - Get help
• .commands - List all commands  
• .ping - Test bot response
• .status - Bot statistics (admin)

💡 **Tips:**
• All commands start with a dot (.)
• Use .help <command> for detailed info
• Real-time responses via MQTT!

🔗 Type .commands to see all available commands.
      `.trim();
      
      await context.reply(helpText);
    }
  }

  async handleCommands(args, context) {
    const allCommands = this.moduleManager.getAllCommands();
    const isAdmin = context.senderUsername && 
      this.moduleManager.instagramBot.messageHandler.isAdmin(context.senderUsername);
    
    const commandsByModule = {};
    
    for (const [name, command] of allCommands) {
      // Skip admin commands for non-admins
      if (command.adminOnly && !isAdmin) continue;
      
      const moduleName = command.moduleName || 'unknown';
      if (!commandsByModule[moduleName]) {
        commandsByModule[moduleName] = [];
      }
      
      commandsByModule[moduleName].push({
        name,
        description: command.description,
        adminOnly: command.adminOnly
      });
    }
    
    let commandsText = '📋 **Available Commands:**\n\n';
    
    for (const [moduleName, commands] of Object.entries(commandsByModule)) {
      commandsText += `🔹 **${moduleName.toUpperCase()}**\n`;
      
      for (const cmd of commands) {
        const adminBadge = cmd.adminOnly ? ' 🔒' : '';
        commandsText += `  • .${cmd.name}${adminBadge} - ${cmd.description}\n`;
      }
      
      commandsText += '\n';
    }
    
    commandsText += '💡 Use .help <command> for detailed usage info';
    
    await context.reply(commandsText);
  }

  async process(message) {
    return message;
  }

  async cleanup() {
    // Cleanup if needed
  }
}