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
      await interaction.reply({ content: '⚠️ Fehler bei der Ausführung!', flags: 64 });
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
            .setTitle(`📨 ${ticketType === 'support' ? 'Support-' : 'Verifizierungs-'}Ticket eröffnet`)
            .setDescription(
              `👋 **${interaction.user}**, willkommen im Ticket!\n\n` +
              `Nur du und das Serverteam haben Zugriff auf diesen Kanal.\n` +
              `${ticketType === 'support'
                ? 'Bitte schildere dein Anliegen so genau wie möglich.'
                : 'Bitte sende hier ein Bild deiner EDU-Card oder einen Verifizierungsnachweis.'}\n\n` +
              `🔒 *Hinweis: Nachrichten in diesem Kanal können bis zu 30 Tage gespeichert werden.*`
            )
            .setColor(ticketType === 'support' ? 'Blurple' : 'Green')
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('close_ticket')
              .setLabel('🔒 Ticket schließen')
              .setStyle(ButtonStyle.Danger)
          )
        ]
      });

      return interaction.reply({
        content: `✅ Ticket erfolgreich erstellt: ${channel}`,
        flags: 64
      });
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('📁 Ticket geschlossen')
            .setDescription(`Dieses Ticket wurde von ${interaction.user} geschlossen.\nDanke für deine Anfrage!`)
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
        content: '✅ Ticket geschlossen und Kanal gesperrt.',
        flags: 64
      });
    }

    if (action === 'warn') {
      try {
        const target   = await client.users.fetch(userId);
        const verified = await VerifiedUser.findOne({ discordId: userId });
        if (!verified) {
          return interaction.reply({ content: '❌ Benutzer ist nicht verifiziert.', flags: 64 });
        }
        verified.warnings.push({
          reason:   `Verwarnung wegen verbotenem Wort: "${bannedWord}"`,
          issuedBy: interaction.user.id,
          date:     new Date()
        });
        await verified.save();
        try { await target.send(`⚠️ Du wurdest wegen des Wortes "${bannedWord}" verwarnt.`); }
        catch {}
        return interaction.reply({ content: `✅ ${target.tag} wurde verwarnt.`, flags: 0 });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: '❌ Fehler beim Verwarnen.', flags: 64 });
      }
    }

    if (action === 'comment') {
      const modal = new ModalBuilder()
        .setCustomId(`commentmodal_${userId}`)
        .setTitle('Kommentar zum Vorfall')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('comment')
              .setLabel('Kommentartext')
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
      return interaction.reply({ content: '✅ Kommentar gespeichert.', flags: 0 });
    }
    return interaction.reply({ content: '❌ Kein verifizierter Benutzer gefunden.', flags: 64 });
  }
};
