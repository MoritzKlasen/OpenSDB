const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
require('dotenv').config();
const connectDB = require('./database/connect');
const loadCommands = require('./loadCommands');
const handleBannedWords = require('./events/handleBannedWords');
const handleInteractions = require('./events/handleInteractions');

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
  console.log(`Bot is online as ${client.user.tag}`);
  
  // Register slash commands with Discord API
  const commands = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());
  
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    console.log(`Registering ${commands.length} slash commands to Discord...`);
    
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );
    
    console.log('Slash commands registered successfully!');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
});

client.on('interactionCreate', async interaction => {
  await handleInteractions(client, interaction);
});

client.on('messageCreate', async (message) => {
  await handleBannedWords(client, message);
});

client.login(process.env.DISCORD_TOKEN);