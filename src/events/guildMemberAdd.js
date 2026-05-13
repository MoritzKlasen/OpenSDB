const { PermissionFlagsBits } = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');
const { logger } = require('../utils/logger');

async function notifyAdminChannel(guild, settings, message) {
  const channelId = settings?.adminChannelId;
  if (!channelId) return;
  try {
    const channel = guild.channels.cache.get(channelId)
      ?? await guild.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased()) {
      await channel.send(message);
    }
  } catch (err) {
    logger.warn('guildMemberAdd: could not send admin channel notification', { error: err.message });
  }
}

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    try {
      const settings = await ServerSettings.findOne({ guildId: member.guild.id });
      const roleId = settings?.onJoinRoleId;
      if (!roleId) {
        logger.debug('guildMemberAdd: no onJoinRoleId configured', { guildId: member.guild.id });
        return;
      }

      const me = member.guild.members.me
        ?? await member.guild.members.fetchMe().catch(() => null);

      if (!me) {
        logger.warn('guildMemberAdd: could not resolve bot guild member', { guildId: member.guild.id });
        return;
      }

      if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        logger.warn('guildMemberAdd: bot lacks ManageRoles permission', { guildId: member.guild.id });
        await notifyAdminChannel(member.guild, settings,
          `⚠️ **On-Join Role** – ${member} joined but the bot lacks the **Manage Roles** permission and cannot assign the on-join role.`);
        return;
      }

      const role =
        member.guild.roles.cache.get(roleId) ||
        await member.guild.roles.fetch(roleId).catch(() => null);

      if (!role) {
        logger.warn('guildMemberAdd: onJoinRole not found', { guildId: member.guild.id, roleId });
        await notifyAdminChannel(member.guild, settings,
          `⚠️ **On-Join Role** – ${member} joined but the configured on-join role no longer exists. Run \`/setrole onjoinrole:\` to reconfigure it.`);
        return;
      }

      if (role.position >= me.roles.highest.position) {
        logger.warn('guildMemberAdd: onJoinRole is above bot\'s highest role', {
          guildId: member.guild.id,
          roleId,
          rolePosition: role.position,
          botHighest: me.roles.highest.position,
        });
        await notifyAdminChannel(member.guild, settings,
          `⚠️ **On-Join Role** – ${member} joined but the bot cannot assign **${role.name}** because it is above the bot's highest role in the hierarchy. Move the bot's role above **${role.name}** in Server Settings › Roles.`);
        return;
      }

      await member.roles.add(role, 'Auto-Assign OnJoinRole');
    } catch (err) {
      logger.warn('Failed to assign on-join role', { memberId: member.id, error: err.message });
    }
  }
};