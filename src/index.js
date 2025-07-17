const { Client, GatewayIntentBits, Collection } = require('discord.js');
require('dotenv').config();
const connectDB = require('./database/connect');
const loadCommands = require('./loadCommands');
const handleBannedWords = require('./events/handleBannedWords');
const handleInteractions = require('./events/handleInteractions');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

client.commands = new Collection();

connectDB();
loadCommands(client);

client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  await handleInteractions(client, interaction);
});

client.on('messageCreate', async (message) => {
  await handleBannedWords(client, message);
});

client.login(process.env.DISCORD_TOKEN);