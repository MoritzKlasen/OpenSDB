const { SlashCommandBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unverify')
    .setDescription('Deletes the verification from a user.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to be unverified.')
        .setRequired(true)),

  async execute(interaction) {
    const guildOwnerId = interaction.guild.ownerId;
    const userId = interaction.user.id;

    const settings = await ServerSettings.findOne();
    const teamRoleId = settings?.teamRoleId;
    const verifiedRoleId = settings?.verifiedRoleId;

    const isOwner = userId === guildOwnerId;
    const isTeam = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

    if (!isOwner && !isTeam) {
      return interaction.reply({
        content: '❌ No permission.',
        flags: 64
      });
    }

    const user = interaction.options.getUser('user');
    const result = await VerifiedUser.findOneAndDelete({ discordId: user.id });

    if (!result) {
      return interaction.reply({
        content: `❌ ${user.tag} was not verified.`,
        flags: 64
      });
    }

    try {
      const member = await interaction.guild.members.fetch(user.id);
      if (verifiedRoleId && member.roles.cache.has(verifiedRoleId)) {
        await member.roles.remove(verifiedRoleId);
      }
    } catch (err) {
      console.warn(`⚠️ Could not remove verified role from ${user.tag}:`, err.message);
    }

    await interaction.reply({
      content: `✅ Verification for ${user.tag} has been deleted.`,
      flags: 64
    });
  }
};