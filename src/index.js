const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
require('dotenv').config();
const connectDB = require('./database/connect');
const loadCommands = require('./loadCommands');
const ServerSettings = require('./database/models/ServerSettings');
const { logger } = require('./utils/logger');
const handleBannedWords = require('./events/handleBannedWords');
const handleInteractions = require('./events/handleInteractions');
const handleAntiScam = require('./events/handleAntiScam');

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
  await handleInteractions(client, interaction);
});

client.on('messageCreate', async (message) => {
  await handleBannedWords(client, message);
  await handleAntiScam(client, message);
});

client.login(process.env.DISCORD_TOKEN);