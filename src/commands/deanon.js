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
        flags: 64
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Verifizierter Benutzer`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: 'Discord', value: user.tag, inline: true },
        { name: 'Vorname', value: verified.firstName || '–', inline: true },
        { name: 'Nachname', value: verified.lastName || '–', inline: true }
      )
      .setColor('Blurple')
      .setTimestamp();

    if (verified.comment && verified.comment.trim() !== '') {
      embed.addFields({ name: '📝 Kommentar', value: verified.comment });
    }

    // Verwarnungen anzeigen – nur wenn vorhanden
    if (Array.isArray(verified.warnings) && verified.warnings.length > 0) {
      const lastWarnings = await Promise.all(
        verified.warnings
          .slice(-3)
          .reverse()
          .map(async (warn, i) => {
            const date = new Date(warn.date).toLocaleDateString('de-DE');
            let issuerTag = `Unbekannt`;

            try {
              const issuer = await interaction.client.users.fetch(warn.issuedBy);
              issuerTag = issuer.tag;
            } catch {}

            return `**${i + 1}.** ${warn.reason} *(von ${issuerTag}, ${date})*`;
          })
      );

      embed.addFields({ name: '⚠️ Letzte Verwarnungen', value: lastWarnings.join('\n') });
    }

    return interaction.reply({ embeds: [embed] });
  }
};
