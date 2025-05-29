const { SlashCommandBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Verwarnt einen verifizierten Benutzer.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, der verwarnt werden soll.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('grund')
        .setDescription('Der Grund für die Verwarnung.')
        .setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const grund = interaction.options.getString('grund');

    const verified = await VerifiedUser.findOne({ discordId: user.id });

    if (!verified) {
      return interaction.reply({
        content: `❌ ${user.tag} ist nicht verifiziert.`,
        ephemeral: true
      });
    }

    verified.warnings.push({
      reason: grund,
      issuedBy: interaction.user.id,
      date: new Date()
    });

    await verified.save();

    return interaction.reply({
      content: `✅ ${user.tag} wurde verwarnt.\nGrund: *${grund}*`,
      ephemeral: false
    });
  }
};