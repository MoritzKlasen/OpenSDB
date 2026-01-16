const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');
const ServerSettings = require('../database/models/ServerSettings');
const { t } = require('../utils/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deanon')
    .setDescription('Displays information about a verified user.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user whose information is to be displayed.')
        .setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const verified = await VerifiedUser.findOne({ discordId: user.id });

    if (!verified) {
      return interaction.reply({
        content: await t(interaction.guildId, 'deanon.notVerified', { user: user.tag }),
        flags: 64
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(await t(interaction.guildId, 'deanon.title'))
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: await t(interaction.guildId, 'deanon.discord'), value: user.tag, inline: true },
        { name: await t(interaction.guildId, 'deanon.firstName'), value: verified.firstName || '–', inline: true },
        { name: await t(interaction.guildId, 'deanon.lastName'), value: verified.lastName || '–', inline: true }
      )
      .setColor('Blurple')
      .setTimestamp();

    const settings = await ServerSettings.findOne();
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    const isTeam = settings?.teamRoleId && interaction.member.roles.cache.has(settings.teamRoleId);
    const isPrivileged = isOwner || isTeam;

    if (isPrivileged && verified.comment && verified.comment.trim() !== '') {
      embed.addFields({ name: await t(interaction.guildId, 'deanon.commentTitle'), value: verified.comment });
    }

    if (isPrivileged && Array.isArray(verified.warnings) && verified.warnings.length > 0) {
      const lastWarnings = await Promise.all(
        verified.warnings
          .slice(-3)
          .reverse()
          .map(async (warn, i) => {
            const date = new Date(warn.date).toLocaleDateString('en-US');
            let issuerTag = 'Unkown';

            try {
              const issuer = await interaction.client.users.fetch(warn.issuedBy);
              issuerTag = issuer.tag;
            } catch {}

            return `**${i + 1}.** ${warn.reason} *(von ${issuerTag}, ${date})*`;
          })
      );

      embed.addFields({ name: await t(interaction.guildId, 'deanon.warningsTitle'), value: lastWarnings.join('\n') });
    }

    return interaction.reply({ embeds: [embed] });
  }
};