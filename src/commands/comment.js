const { SlashCommandBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('comment')
    .setDescription('Fügt einem verifizierten Benutzer einen Kommentar hinzu oder ändert ihn.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, dessen Kommentar gesetzt werden soll.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Der neue Kommentar.')
        .setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const text = interaction.options.getString('text');

    const verified = await VerifiedUser.findOne({ discordId: user.id });

    if (!verified) {
      return interaction.reply({
        content: `❌ ${user.tag} ist nicht verifiziert.`,
        flags: 64
      });
    }

    verified.comment = text;
    await verified.save();

    return interaction.reply({
      content: `✅ Kommentar für ${user.tag} wurde gesetzt:\n> ${text}`,
      flags: 0
    });
  }
};
