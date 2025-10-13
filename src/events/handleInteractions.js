const {
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ButtonBuilder,
  Colors
} = require('discord.js');

const ServerSettings = require('../database/models/ServerSettings');
const VerifiedUser   = require('../database/models/VerifiedUser');

function buildDisabledRowsFrom(message) {
  if (!message?.components?.length) return [];
  return message.components.map(row => {
    const newRow = new ActionRowBuilder();
    row.components.forEach(c => {
      const b = new ButtonBuilder().setDisabled(true);
      if (c.customId) b.setCustomId(c.customId);
      if (c.style)    b.setStyle(c.style);
      if (c.label)    b.setLabel(c.label);
      if (c.emoji)    b.setEmoji(c.emoji);
      newRow.addComponents(b);
    });
    return newRow;
  });
}

function topicSetFlag(topic, key, value) {
  const clean = (topic || '').trim();
  const map = Object.fromEntries(
    clean.split(';').map(s => s.trim()).filter(Boolean).map(s => {
      const [k, ...rest] = s.split(':');
      return [k.trim().toLowerCase(), rest.join(':').trim()];
    })
  );
  map[key] = value;
  return Object.entries(map).map(([k, v]) => `${k}:${v}`).join('; ');
}

function topicGetFlag(topic, key) {
  const clean = (topic || '').trim();
  for (const part of clean.split(';').map(s => s.trim()).filter(Boolean)) {
    const [k, ...rest] = part.split(':');
    if (k?.trim().toLowerCase() === key) return rest.join(':').trim();
  }
  return null;
}

async function resolveOpenerIdFromOverwrites(channel, teamRoleId) {
  const overwrites = channel.permissionOverwrites.cache;
  for (const po of overwrites.values()) {
    if (po.type === 1) { // 1 = Member (user) overwrite
      const allowsView = po.allow?.has?.('ViewChannel');
      if (allowsView) {
        if (teamRoleId) {
          const member = await channel.guild.members.fetch(po.id).catch(() => null);
          if (member?.roles.cache.has(teamRoleId)) continue; // skip team members
        }
        return po.id;
      }
    }
  }
  return null;
}

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
      const parentId   = extra || null;

      const settings = await ServerSettings.findOne() || {};
      const { teamRoleId, supportRoleId, verifyRoleId } = settings;

      const roleId = ticketType === 'support'
        ? (supportRoleId || teamRoleId)
        : (verifyRoleId  || teamRoleId);

      const channelName = `${ticketType}-${interaction.user.username}`.toLowerCase();

      const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentId ?? undefined,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: ['ViewChannel'] },
          { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
          ...(roleId
            ? [{ id: roleId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }]
            : [])
        ]
      });

      const meta1 = topicSetFlag('', 'status', 'open');
      const meta2 = topicSetFlag(meta1, 'type', ticketType);
      const meta3 = topicSetFlag(meta2, 'opener', interaction.user.id);
      await channel.setTopic(meta3).catch(() => {});

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`📨 ${ticketType === 'support' ? 'Support ' : 'Verification '}Ticket Opened`)
            .setDescription(
              `👋 **${interaction.user}**, welcome to your ticket!\n\n` +
              `Only you and the server team have access to this channel.\n` +
              (ticketType === 'support'
                ? 'Please describe your issue as accurately as possible.'
                : 'Please send an image of your EDU card or other proof of verification here.') +
              `\n\n🔒 *Note: Messages in this channel may be stored for up to 30 days.*`
            )
            .setColor(ticketType === 'support' ? Colors.Blurple : Colors.Green)
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('close_ticket')
              .setLabel('🔒 Close Ticket')
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
      const channel = interaction.channel;

      const alreadyClosed = (topicGetFlag(channel.topic, 'status') || '').toLowerCase() === 'closed';
      if (alreadyClosed) {
        try {
          const disabledRows = buildDisabledRowsFrom(interaction.message);
          if (disabledRows.length) {
            await interaction.update({ components: disabledRows });
          } else {
            await interaction.reply({ content: '✅ Ticket is already closed.', flags: 64 });
          }
        } catch {}
        return;
      }

      let openerId = topicGetFlag(channel.topic, 'opener');
      if (!openerId) {
        const settings = await ServerSettings.findOne() || {};
        openerId = await resolveOpenerIdFromOverwrites(channel, settings.teamRoleId);
      }

      try {
        if (openerId) {
          await channel.permissionOverwrites.edit(openerId, {
            ViewChannel: false,
            SendMessages: false,
            AddReactions: false
          }).catch(() => {});
        }
        const everyoneId = channel.guild.roles.everyone.id;
        await channel.permissionOverwrites.edit(everyoneId, {
          SendMessages: false,
          AddReactions: false
        }).catch(() => {});

        const settings = await ServerSettings.findOne() || {};
        const { teamRoleId } = settings;
        if (teamRoleId) {
          await channel.permissionOverwrites.edit(teamRoleId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('Permission lock error:', e);
      }

      try {
        const closedMeta = topicSetFlag(channel.topic, 'status', 'closed');
        await channel.setTopic(closedMeta).catch(() => {});
        if (!channel.name.startsWith('🔒')) {
          await channel.setName(`🔒-${channel.name.replace(/^🔒-/, '')}`).catch(() => {});
        }
      } catch (e) {
        console.warn('Topic/name update error:', e);
      }

      const closedEmbed = new EmbedBuilder()
        .setTitle('📁 Ticket Closed')
        .setDescription(`This ticket has been closed by ${interaction.user}.\nThank you for your request!`)
        .setColor(Colors.Red);

      try {
        const disabledRows = buildDisabledRowsFrom(interaction.message);
        if (disabledRows.length) {
          await interaction.update({ embeds: [closedEmbed], components: disabledRows });
        } else {
          await interaction.reply({ embeds: [closedEmbed] });
        }
      } catch (e) {
        console.warn('Button disable/update error:', e);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [closedEmbed] });
        }
      }
      return;
    }

    if (action === 'warn') {
      try {
        const target   = await client.users.fetch(userId);
        const verified = await VerifiedUser.findOne({ discordId: userId });
        if (!verified) {
          return interaction.reply({ content: '❌ User is not verified.', flags: 64 });
        }
        verified.warnings.push({
          reason:   `Warning for prohibited word: "${bannedWord}"`,
          issuedBy: interaction.user.id,
          date:     new Date()
        });
        await verified.save();
        try { await target.send(`⚠️ You have been warned for using the word "${bannedWord}".`); } catch {}
        return interaction.reply({ content: `✅ ${target.tag} has been warned.`, flags: 0 });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: '❌ Error while issuing warning.', flags: 64 });
      }
    }

    if (action === 'comment') {
      const modal = new ModalBuilder()
        .setCustomId(`commentmodal_${userId}`)
        .setTitle('Comment on Incident')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('comment')
              .setLabel('Comment Text')
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