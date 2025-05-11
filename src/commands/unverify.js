const { SlashCommandBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unverify')
    .setDescription('Löscht die Verifizierung eines Benutzers (nur zum Testen)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, der ent-verifiziert werden soll')
        .setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser('user');

    const result = await VerifiedUser.findOneAndDelete({ discordId: user.id });

    if (!result) {
      return interaction.reply({
        content: `❌ ${user.tag} war nicht verifiziert.`,
        flags: 64
      });
    }

    await interaction.reply({
      content: `✅ Verifizierung von ${user.tag} wurde gelöscht.`,
      flags: 64
    });
  }
};
