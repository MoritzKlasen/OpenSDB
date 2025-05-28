const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deanon')
    .setDescription('Zeigt Informationen zu einem verifizierten Benutzer an.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, dessen Infos gezeigt werden sollen.')
        .setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const verified = await VerifiedUser.findOne({ discordId: user.id });

    if (!verified) {
      return interaction.reply({
        content: `❌ ${user.tag} ist nicht verifiziert.`,
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Verifizierter Benutzer`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: 'Discord', value: user.tag, inline: true },
        { name: 'Name', value: `${verified.firstName} ${verified.lastName}`, inline: true },
      )
      .setColor('Blurple')
      .setTimestamp();

    if (verified.comment && verified.comment.trim() !== '') {
      embed.addFields({ name: '📝 Kommentar', value: verified.comment });
    }

    return interaction.reply({ embeds: [embed] });
  }
};