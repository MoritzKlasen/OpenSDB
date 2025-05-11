// deploy-commands.js
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
    console.warn(`[WARNUNG] Die Datei ${file} hat kein gültiges Command-Format.`);
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`📤 Registriere ${commands.length} Slash-Commands...`);

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.ALLOWED_GUILD_ID),
      { body: commands }
    );

    console.log('✅ Erfolgreich registriert!');
  } catch (error) {
    console.error('❌ Fehler beim Registrieren:', error);
  }
})();
