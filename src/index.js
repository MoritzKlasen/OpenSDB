const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
require('dotenv').config();
const connectDB = require('./database/connect');
const loadCommands = require('./loadCommands');
const { logger } = require('./utils/logger');
const handleBannedWords = require('./events/handleBannedWords');
const handleInteractions = require('./events/handleInteractions');
const handleAntiScam = require('./events/handleAntiScam');
const guildMemberAdd = require('./events/guildMemberAdd');
const { startAIHealthMonitor } = require('./utils/scamDetection/aiHealth');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

client.commands = new Collection();

connectDB();
loadCommands(client);

client.once('ready', async () => {
  logger.info(`Bot is online as ${client.user.tag}`);
  startAIHealthMonitor(client);
  
  const commands = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());
  
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    logger.info(`Deploying ${commands.length} slash commands to Discord`, { commandCount: commands.length });
    
    if (!process.env.CLIENT_ID) {
      throw new Error('CLIENT_ID not set in environment');
    }
    if (!process.env.ALLOWED_GUILD_ID) {
      throw new Error('ALLOWED_GUILD_ID not set in environment');
    }
    
    logger.info('Environment validated', { 
      clientId: process.env.CLIENT_ID, 
      guildId: process.env.ALLOWED_GUILD_ID 
    });
    
    logger.info('Clearing global commands (if any)...');
    try {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: [] },
      );
      logger.info('Global commands cleared');
    } catch (clearError) {
      logger.warn('Failed to clear global commands (may not have permission)', { error: clearError.message });
    }
    
    logger.info(`Registering ${commands.length} commands to guild ${process.env.ALLOWED_GUILD_ID}...`);
    const result = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.ALLOWED_GUILD_ID),
      { body: commands },
    );
    
    logger.info('Slash commands registered successfully', { 
      registeredCount: result.length,
      guildId: process.env.ALLOWED_GUILD_ID 
    });
  } catch (error) {
    logger.error('Failed to register commands', { 
      error: error.message,
      stack: error.stack,
      clientId: process.env.CLIENT_ID,
      guildId: process.env.ALLOWED_GUILD_ID
    });
  }
});

client.on('interactionCreate', async interaction => {
  try {
    await handleInteractions(client, interaction);
  } catch (err) {
    logger.error('Interaction handler error', {
      interactionId: interaction?.id,
      customId: interaction?.customId,
      command: interaction?.commandName,
      error: err.message,
      stack: err.stack,
    });
  }
});

client.on('messageCreate', async (message) => {
  try {
    await handleBannedWords(client, message);
    await handleAntiScam(client, message);
  } catch (err) {
    logger.error('Message handler error', { messageId: message?.id, error: err.message });
  }
});

client.on('guildMemberAdd', async (member) => {
  try {
    await guildMemberAdd.execute(member);
  } catch (err) {
    logger.error('guildMemberAdd handler error', { memberId: member?.id, error: err.message });
  }
});

client.on('error', (err) => {
  logger.error('Discord client error', { error: err.message });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  // Without a gateway connection the bot is useless; exit so the container restarts visibly
  logger.error('Discord login failed', { error: err.message });
  process.exit(1);
});