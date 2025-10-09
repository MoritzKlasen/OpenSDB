const { PermissionFlagsBits } = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    try {
      const settings = await ServerSettings.findOne({});
      const roleId = settings?.onJoinRoleId;
      if (!roleId) return;

      const me = member.guild.members.me;
      if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return;

      const role =
        member.guild.roles.cache.get(roleId) ||
        await member.guild.roles.fetch(roleId).catch(() => null);
      if (!role) return;

      if (role.position >= me.roles.highest.position) return;

      await member.roles.add(role, 'Auto-Assign OnJoinRole');
    } catch (err) {
      console.error('OnJoinRole Zuweisung fehlgeschlagen:', err);
    }
  }
};