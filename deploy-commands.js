require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const args = process.argv.slice(2);
const shouldClear = args.includes('--clear');
const shouldDeployGlobal = args.includes('--global');

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
    if (shouldClear) {
      console.log('🗑️  Clearing all commands...');
      
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: [] }
      );
      console.log('✅ Global commands cleared');
      
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.ALLOWED_GUILD_ID),
        { body: [] }
      );
      console.log('✅ Guild commands cleared');
      
      return;
    }
    
    console.log(`📤 Deploying ${commands.length} slash commands...`);
    
    if (shouldDeployGlobal) {
      console.warn('⚠️  WARNING: Deploying commands globally (may take up to 1 hour to sync)');
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log('✅ Commands deployed globally');
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: [] }
      );
      console.log('✅ Global commands cleared');
      
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.ALLOWED_GUILD_ID),
        { body: commands }
      );
      console.log(`✅ Commands deployed to guild ${process.env.ALLOWED_GUILD_ID}`);
    }
    
    console.log('\n💡 TIP: Commands are automatically deployed when the bot starts.');
    console.log('   You only need to run this script manually for debugging.');
  } catch (error) {
    console.error('❌ Error during deployment:', error);
  }
})();
