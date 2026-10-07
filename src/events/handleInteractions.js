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

const LocalizedMessage = require('../database/models/LocalizedMessage');
const ScamDetectionEvent = require('../database/models/ScamDetectionEvent');
const { t } = require("../utils/i18n");
const ServerSettings = require('../database/models/ServerSettings');
const VerifiedUser   = require('../database/models/VerifiedUser');
const { notifyAdminServer } = require('../utils/botNotifier');
const { logger } = require('../utils/logger');
const { MAX_COMMENT_LENGTH } = require('../utils/constants');
require('dotenv').config();

if (!process.env.INTERNAL_SECRET) {
  throw new Error('INTERNAL_SECRET environment variable is required');
}
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

async function notifyAdminServerHelper(type) {
  return notifyAdminServer(type, INTERNAL_SECRET);
}

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

// The banned word lives in the alert embed's field; older alerts still carry it in the customId
function getBannedWordFromAlert(interaction) {
  const fieldValue = interaction.message?.embeds?.[0]?.fields?.[0]?.value;
  if (fieldValue) return fieldValue.replace(/^`|`$/g, '');
  return interaction.customId.split('_').slice(2).join('_');
}

// Guards against double-clicks creating two tickets before the first channel exists
const ticketCreationLocks = new Set();

async function resolveOpenerIdFromOverwrites(channel, teamRoleId) {
  const overwrites = channel.permissionOverwrites.cache;
  for (const po of overwrites.values()) {
    if (po.type === 1) { 
      const allowsView = po.allow?.has?.('ViewChannel');
      if (allowsView) {
        if (teamRoleId) {
          const member = await channel.guild.members.fetch(po.id).catch(() => null);
          if (member?.roles.cache.has(teamRoleId)) continue; 
        }
        return po.id;
      }
    }
  }
  return null;
}

async function createTicket(interaction, ticketType, parentId) {
  const settings = await ServerSettings.findOne({ guildId: interaction.guildId }).lean() || {};
  const roleId = settings.teamRoleId;

  const channelName = `${ticketType}-${interaction.user.username}`.toLowerCase();

  const meta1 = topicSetFlag('', 'status', 'open');
  const meta2 = topicSetFlag(meta1, 'type', ticketType);
  const meta3 = topicSetFlag(meta2, 'opener', interaction.user.id);

  let channel;
  try {
    channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parentId ?? undefined,
      // Set topic on creation so the open-ticket check sees it immediately
      topic: meta3,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: ['ViewChannel'] },
        { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
        ...(roleId
          ? [{ id: roleId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }]
          : [])
      ]
    });
  } catch (err) {
    logger.error('Failed to create ticket channel', {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      error: err.message,
    });
    return interaction.editReply({ content: await t(interaction.guildId, "errors.generic") });
  }

  const guildId = interaction.guildId;

  const titleKey = ticketType === "support"
    ? "tickets.openedTitleSupport"
    : "tickets.openedTitleVerify";

  const askKey = ticketType === "support"
    ? "tickets.supportAsk"
    : "tickets.verifyAsk";

  const ticketMsg = await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(await t(guildId, titleKey))
        .setDescription(
          `${await t(guildId, "tickets.welcome", { user: `${interaction.user}` })}\n\n` +
          `${await t(guildId, "tickets.accessInfo")}\n` +
          `${await t(guildId, askKey)}\n\n` +
          `${await t(guildId, "tickets.privacy")}`
        )
        .setColor(ticketType === "support" ? Colors.Blurple : Colors.Green)
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel(await t(guildId, "tickets.close"))
          .setStyle(ButtonStyle.Danger)
      )
    ]
  });

  await LocalizedMessage.updateOne(
    { guildId: interaction.guildId, messageId: ticketMsg.id },
    {
      $set: {
        guildId: interaction.guildId,
        channelId: channel.id,
        messageId: ticketMsg.id,
        key: "ticket.opened",
        vars: {
          type: ticketType,
          userMention: `${interaction.user}` 
        }
      }
    },
    { upsert: true }
  );

  return interaction.editReply({
    content: await t(interaction.guildId, "tickets.created", { channel: `${channel}` })
  });
}

module.exports = async (client, interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error('Error executing command', {
        guildId: interaction.guildId,
        command: interaction.commandName,
        error: err.message,
      });
      const payload = { content: await t(interaction.guildId, "errors.executionError"), flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
    return;
  }

  if (interaction.isButton()) {
    const [action, userId, extra] = interaction.customId.split('_');

    if (action === 'ticket') {
      const ticketType = userId;
      const parentId   = extra || null;

      // Channel creation + several DB/i18n lookups can exceed Discord's 3s reply window
      await interaction.deferReply({ flags: 64 });

      // Only one open ticket per user and ticket type
      const existing = interaction.guild.channels.cache.find(ch =>
        ch.type === ChannelType.GuildText &&
        topicGetFlag(ch.topic, 'opener') === interaction.user.id &&
        topicGetFlag(ch.topic, 'type') === ticketType &&
        (topicGetFlag(ch.topic, 'status') || '').toLowerCase() === 'open'
      );
      if (existing) {
        return interaction.editReply({
          content: await t(interaction.guildId, "tickets.alreadyOpen", { channel: `${existing}` })
        });
      }

      const lockKey = `${interaction.guildId}_${interaction.user.id}_${ticketType}`;
      if (ticketCreationLocks.has(lockKey)) {
        return interaction.deleteReply().catch(() => {});
      }
      ticketCreationLocks.add(lockKey);
      try {
        return await createTicket(interaction, ticketType, parentId);
      } finally {
        ticketCreationLocks.delete(lockKey);
      }
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
            await interaction.reply({ content: await t(interaction.guildId, "tickets.alreadyClosed"), flags: 64 });
          }
        } catch {}
        return;
      }

      let openerId = topicGetFlag(channel.topic, 'opener');
      if (!openerId) {
        const settings = await ServerSettings.findOne({ guildId: interaction.guildId }).lean() || {};
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

        const settings = await ServerSettings.findOne({ guildId: interaction.guildId }).lean() || {};
        const { teamRoleId } = settings;
        if (teamRoleId) {
          await channel.permissionOverwrites.edit(teamRoleId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          }).catch(() => {});
        }
      } catch (e) {
        logger.warn('Failed to update channel permissions', { channelId: channel.id, error: e.message });
      }

      try {
        const closedMeta = topicSetFlag(channel.topic, 'status', 'closed');
        await channel.setTopic(closedMeta).catch(() => {});
        if (!channel.name.startsWith('🔒')) {
          await channel.setName(`🔒-${channel.name.replace(/^🔒-/, '')}`).catch(() => {});
        }
      } catch (e) {
        logger.warn('Failed to update channel topic/name', { channelId: channel.id, error: e.message });
      }

      const closedEmbed = new EmbedBuilder()
        .setTitle(await t(interaction.guildId, "tickets.closedTitle"))
        .setDescription(await t(interaction.guildId, "tickets.closedDesc", { user: `${interaction.user}` }))
        .setColor(Colors.Red);

      try {
        const disabledRows = buildDisabledRowsFrom(interaction.message);
        if (disabledRows.length) {
          await interaction.update({ embeds: [closedEmbed], components: disabledRows });
        } else {
          await interaction.reply({ embeds: [closedEmbed] });
        }
      } catch (e) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: await t(interaction.guildId, "errors.generic"), flags: 64 });
        } else {
          await interaction.reply({ content: await t(interaction.guildId, "errors.generic"), flags: 64 });
        }
      }
      return;
    }

    if (action === 'warn') {
      const bannedWord = getBannedWordFromAlert(interaction);
      try {
        const verified = await VerifiedUser.findOne({ discordId: userId });
        if (!verified) {
          return interaction.reply({ content: await t(interaction.guildId, "warnings.notVerified"), flags: 64 });
        }
        // Notifying the admin server and DMing the user can exceed Discord's 3s reply window
        await interaction.deferReply();
        const target = await client.users.fetch(userId);
        verified.warnings.push({
          reason:   `Warning for prohibited word: "${bannedWord}"`,
          issuedBy: interaction.user.id,
          date:     new Date()
        });
        await verified.save();
        
        await notifyAdminServerHelper('warning');
        
        try { await target.send(await t(interaction.guildId, "warnings.dmMessage", { word: bannedWord })); } catch {}
        return interaction.editReply({ content: await t(interaction.guildId, "warnings.issued", { user: `${target.tag}` }) });
      } catch (err) {
        logger.error('Error issuing warning', {
          guildId: interaction.guildId,
          userId: interaction.user.id,
          targetId: userId,
          bannedWord,
          error: err.message,
        });
        const content = await t(interaction.guildId, "warnings.error");
        return interaction.deferred
          ? interaction.editReply({ content })
          : interaction.reply({ content, flags: 64 });
      }
    }

    if (action === 'comment') {
      const modal = new ModalBuilder()
        .setCustomId(`commentmodal_${userId}`)
        .setTitle(await t(interaction.guildId, 'comments.modalTitle'))
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('comment')
              .setLabel(await t(interaction.guildId, 'comments.modalLabel'))
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(MAX_COMMENT_LENGTH)
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('scam_')) {
      const parts = interaction.customId.split('_');
      const [, action, ...params] = parts;
      
      try {
        if (action === 'delete') {
          const alertMessageId = params[0];
          // Deleting several messages one by one easily exceeds the 3s reply window
          await interaction.deferReply({ flags: 64 });
          
          const { getAlertMessageData, cleanupDeletedAlert } = require('./handleAntiScam');
          const alertData = await getAlertMessageData(alertMessageId);
          
          if (!alertData) {
            return await interaction.editReply({
              content: await t(interaction.guildId, 'scamAlert.alertNotFound')
            });
          }
          
          const { messages } = alertData;
          
          let deletedCount = 0;
          let failedCount = 0;
          
          for (const msg of messages) {
            try {
              const channel = await interaction.guild?.channels.fetch(msg.channelId).catch(() => null);
              if (!channel?.isTextBased()) {
                failedCount++;
                continue;
              }
              
              const message = await channel.messages.fetch(msg.messageId).catch(() => null);
              if (message) {
                await message.delete();
                deletedCount++;
              } else {
                failedCount++;
              }
            } catch (err) {
              logger.error('Failed to delete spam message', {
                messageId: msg.messageId,
                channelId: msg.channelId,
                error: err.message
              });
              failedCount++;
            }
          }
          
          const resultMessage = deletedCount > 0
            ? await t(interaction.guildId, 'scamAlert.deleted', { count: deletedCount }) +
              (failedCount > 0 ? ` ${await t(interaction.guildId, 'scamAlert.alreadyDeleted', { count: failedCount })}` : '')
            : await t(interaction.guildId, 'scamAlert.noneDeleted');
          
          await interaction.editReply({ content: resultMessage });
          
          logger.security('Messages deleted via scam alert', {
            guildId: interaction.guildId,
            deletedCount,
            failedCount,
            deletedBy: interaction.user.id
          });
          
          if (deletedCount > 0) {
            cleanupDeletedAlert(alertMessageId);
          }
          
          try {
            if (interaction.message?.components?.length >= 2) {
              const row1Components = interaction.message.components[0].components;
              const row2Components = interaction.message.components[1].components;
              
              const viewLabel = await t(interaction.guildId, 'scamAlert.buttonView');
              const newRow1 = new ActionRowBuilder();
              row1Components.forEach(c => {
                if (c.style === ButtonStyle.Link) {
                  newRow1.addComponents(
                    new ButtonBuilder()
                      .setCustomId('scam_view_disabled')
                      .setLabel(viewLabel)
                      .setStyle(ButtonStyle.Secondary)
                      .setDisabled(true)
                  );
                } else if (c.customId?.startsWith('scam_delete')) {
                  newRow1.addComponents(
                    new ButtonBuilder()
                      .setCustomId(c.customId)
                      .setLabel(c.label)
                      .setStyle(c.style)
                      .setDisabled(true)
                  );
                } else {
                  newRow1.addComponents(
                    new ButtonBuilder()
                      .setCustomId(c.customId)
                      .setLabel(c.label)
                      .setStyle(c.style)
                  );
                }
              });
              
              const newRow2 = new ActionRowBuilder();
              row2Components.forEach(c => {
                if (c.customId?.startsWith('scam_dismiss')) {
                  newRow2.addComponents(
                    new ButtonBuilder()
                      .setCustomId(c.customId)
                      .setLabel(c.label)
                      .setStyle(c.style)
                      .setDisabled(true)
                  );
                } else {
                  newRow2.addComponents(
                    new ButtonBuilder()
                      .setCustomId(c.customId)
                      .setLabel(c.label)
                      .setStyle(c.style)
                  );
                }
              });
              
              await interaction.message.edit({ components: [newRow1, newRow2] }).catch(() => {});
            }
          } catch (err) {}
          
          return;
        }
        
        if (action === 'timeout') {
          const userId = params[0];
          const duration = parseInt(params[1]) || 60;
          
          try {
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            if (!member) {
              return await interaction.reply({
                content: await t(interaction.guildId, 'scamAlert.userNotFound'),
                flags: 64
              });
            }
            
            await member.timeout(
              duration * 60 * 1000,
              'Scam/spam activity (admin action)'
            );
            
            await interaction.reply({
              content: await t(interaction.guildId, 'scamAlert.timedOut', { duration }),
              flags: 64
            });
            
            logger.security('User timed out via scam alert', {
              guildId: interaction.guildId,
              userId,
              duration,
              actionBy: interaction.user.id
            });
          } catch (error) {
            logger.error('Failed to timeout user', {
              userId,
              error: error.message
            });
            await interaction.reply({
              content: await t(interaction.guildId, 'scamAlert.timeoutFailed'),
              flags: 64
            });
          }
          return;
        }
        
        if (action === 'dismiss') {
          const messageId = params[0];
          
          const { forgetAlert } = require('./handleAntiScam');
          forgetAlert(interaction.message.id);
          await interaction.message.delete().catch(() => null);
          
          await ScamDetectionEvent.findOneAndUpdate(
            { messageId },
            { 
              dismissed: true,
              dismissedAt: new Date(),
              dismissedBy: interaction.user.id
            }
          ).catch(() => null);
          
          return;
        }
      } catch (error) {
        logger.error('Error handling anti-scam action', {
          guildId: interaction.guildId,
          action,
          error: error.message
        });
        
        const content = await t(interaction.guildId, 'scamAlert.actionError');
        if (interaction.deferred) {
          return await interaction.editReply({ content }).catch(() => {});
        }
        if (!interaction.replied) {
          return await interaction.reply({ content, flags: 64 });
        }
      }
    }
  }

  if (
    interaction.type === InteractionType.ModalSubmit &&
    interaction.customId.startsWith('commentmodal_')
  ) {
    try {
      const userId      = interaction.customId.split('_')[1];
      const commentText = interaction.fields.getTextInputValue('comment');
      const result = await VerifiedUser.findOneAndUpdate(
        { discordId: userId },
        { comment: commentText },
        { upsert: false }
      );
      if (result) {
        return interaction.reply({ content: await t(interaction.guildId, "comments.saved"), flags: 0 });
      }
      return interaction.reply({ content: await t(interaction.guildId, "comments.noUser"), flags: 64 });
    } catch (err) {
      logger.error('Error handling comment modal', {
        guildId: interaction.guildId,
        error: err.message,
      });
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({ content: await t(interaction.guildId, "errors.executionError"), flags: 64 });
      }
    }
  }
};