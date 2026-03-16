const fs = require('fs');
const path = require('path');
const { logger } = require('./utils/logger');

function loadCommands(client) {
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      logger.info(`Command loaded: ${command.data.name}`);
    } else {
      logger.warn(`Invalid command format in file: ${file}`);
    }
  }
}

module.exports = loadCommands;