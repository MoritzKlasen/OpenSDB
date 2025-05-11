const { SlashCommandBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deanon')
    .setDescription('Zeigt den echten Namen eines verifizierten Benutzers')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, dessen Name gezeigt werden soll')
        .setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user');

    const verified = await VerifiedUser.findOne({ discordId: user.id });

    if (!verified) {
      return interaction.reply({
        content: `❌ ${user.tag} ist nicht verifiziert.`,
        flags: 64
      });
    }

    return interaction.reply({
      content: `🔍 ${user.tag} heißt in echt **${verified.firstName} ${verified.lastName}**.`,
    });
  }
};
