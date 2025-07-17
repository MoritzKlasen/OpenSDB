const {
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ButtonBuilder
} = require('discord.js');

const ServerSettings = require('../database/models/ServerSettings');
const VerifiedUser   = require('../database/models/VerifiedUser');

module.exports = async (client, interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '⚠️ Error during execution!', flags: 64 });
    }
  }

  if (interaction.isButton()) {
    const [action, userId, extra] = interaction.customId.split('_');
    const bannedWord = extra?.replace(/-/g, ' ') || '';

    if (action === 'ticket') {
      const ticketType = userId; 
      const catId      = extra;

      const settings = await ServerSettings.findOne() || {};
      const { teamRoleId, supportRoleId, verifyRoleId } = settings;
      const roleId = ticketType === 'support'
        ? (supportRoleId || teamRoleId)
        : (verifyRoleId  || teamRoleId);

      const parentId    = catId || null;
      const channelName = `${ticketType}-${interaction.user.username}`.toLowerCase();

      const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentId ?? undefined,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone, deny: ['ViewChannel'] },
          { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
          ...(roleId
            ? [{
                id: roleId,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
              }]
            : [])
        ]
      });

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`📨 ${ticketType === 'support' ? 'Support-' : 'Verification-'}ticket opened`)
            .setDescription(
              `👋 **${interaction.user}**, welcome to the ticket!\n\n` +
              `Only you and the server team have access to this channel.\n` +
              `${ticketType === 'support'
                ? 'Please describe your issue as precisely as possible.'
                : 'Please send a picture of your EDU card or a verification proof here.'}\n\n` +
              `🔒 *Note: Messages in this channel may be stored for up to 30 days.*`
            )
            .setColor(ticketType === 'support' ? 'Blurple' : 'Green')
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('close_ticket')
              .setLabel('🔒 Close ticket')
              .setStyle(ButtonStyle.Danger)
          )
        ]
      });

      return interaction.reply({
        content: `✅ Ticket successfully created: ${channel}`,
        flags: 64
      });
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('📁 Ticket closed')
            .setDescription(`This ticket was closed by ${interaction.user}.\nThank you for your inquiry!`)
            .setColor('Red')
        ]
      });

      const settings = await ServerSettings.findOne() || {};
      const { teamRoleId } = settings;
      await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
        SendMessages: false
      });
      if (teamRoleId) {
        await interaction.channel.permissionOverwrites.edit(teamRoleId, {
          ViewChannel: true,
          SendMessages: true
        });
      }

      return interaction.reply({
        content: '✅ Ticket closed and channel locked.',
        flags: 64
      });
    }

    if (action === 'warn') {
      try {
        const target   = await client.users.fetch(userId);
        const verified = await VerifiedUser.findOne({ discordId: userId });
        if (!verified) {
          return interaction.reply({ content: '❌ User is not verified.', flags: 64 });
        }
        verified.warnings.push({
          reason:   `Warning due to banned word: "${bannedWord}"`,
          issuedBy: interaction.user.id,
          date:     new Date()
        });
        await verified.save();
        try { await target.send(`⚠️ You have been warned for the word "${bannedWord}".`); }
        catch {}
        return interaction.reply({ content: `✅ ${target.tag} was warned.`, flags: 0 });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: '❌ Error while warning.', flags: 64 });
      }
    }

    if (action === 'comment') {
      const modal = new ModalBuilder()
        .setCustomId(`commentmodal_${userId}`)
        .setTitle('Comment on the incident')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('comment')
              .setLabel('Comment text')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }
  }

  if (
    interaction.type === InteractionType.ModalSubmit &&
    interaction.customId.startsWith('commentmodal_')
  ) {
    const userId      = interaction.customId.split('_')[1];
    const commentText = interaction.fields.getTextInputValue('comment');
    const result = await VerifiedUser.findOneAndUpdate(
      { discordId: userId },
      { comment: commentText },
      { upsert: false }
    );
    if (result) {
      return interaction.reply({ content: '✅ Comment saved.', flags: 0 });
    }
    return interaction.reply({ content: '❌ No verified user found.', flags: 64 });
  }
};