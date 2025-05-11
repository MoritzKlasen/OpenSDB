const { Client, GatewayIntentBits, Collection } = require('discord.js');
require('dotenv').config();
const connectDB = require('./database/connect');
const loadCommands = require('./loadCommands');
const BannedWord = require('./database/models/BannedWord');
const Config = require('./database/models/Config');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

connectDB();
loadCommands(client);

client.once('ready', () => {
  console.log(`✅ Bot ist online als ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: '⚠️ Fehler bei der Ausführung!', ephemeral: true });
  }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
  
    const content = message.content.toLowerCase();
    const bannedWords = await BannedWord.find();
  
    for (const entry of bannedWords) {
      if (content.includes(entry.word)) {
        const config = await Config.findOne({ key: 'adminChannelId' });
        if (!config) return;
  
        const adminChannel = await client.channels.fetch(config.value);
        if (!adminChannel) return;
  
        adminChannel.send({
          content: `🚨 **Verbotenes Wort erkannt**
  **User:** ${message.author.tag}
  **Channel:** ${message.channel}
  **Nachricht:** ${message.content}
  **Wort:** \`${entry.word}\``
        });
        break;
      }
    }
  });

client.login(process.env.DISCORD_TOKEN);
