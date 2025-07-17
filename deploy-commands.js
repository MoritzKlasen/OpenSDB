require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.warn(`[WARNING] The file ${file} has an invalid command format.`);
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`📤 Registering ${commands.length} slash commands...`);

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.ALLOWED_GUILD_ID),
      { body: commands }
    );

    console.log('✅ Successfully registered!');
  } catch (error) {
    console.error('❌ Error during registration:', error);
  }
})();
