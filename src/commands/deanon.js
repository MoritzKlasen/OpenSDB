const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deanon')
    .setDescription('Zeigt Informationen über einen verifizierten Benutzer an.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, dessen Informationen angezeigt werden sollen.')
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

    const settings = await ServerSettings.findOne();
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    const isTeam = settings?.teamRoleId && interaction.member.roles.cache.has(settings.teamRoleId);
    const isPrivileged = isOwner || isTeam;

    if (isPrivileged && verified.comment && verified.comment.trim() !== '') {
      embed.addFields({ name: '📝 Kommentar', value: verified.comment });
    }

    if (isPrivileged && Array.isArray(verified.warnings) && verified.warnings.length > 0) {
      const lastWarnings = await Promise.all(
        verified.warnings
          .slice(-3)
          .reverse()
          .map(async (warn, i) => {
            const date = new Date(warn.date).toLocaleDateString('en-US');
            let issuerTag = 'Unbekannt';

            try {
              const issuer = await interaction.client.users.fetch(warn.issuedBy);
              issuerTag = issuer.tag;
            } catch {}

            return `**${i + 1}.** ${warn.reason} *(von ${issuerTag}, ${date})*`;
          })
      );

      embed.addFields({ name: '⚠️ Kürzliche Verwarnungen', value: lastWarnings.join('\n') });
    }

    return interaction.reply({ embeds: [embed] });
  }
};
