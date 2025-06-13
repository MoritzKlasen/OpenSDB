const {
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
  ButtonStyle,
  ChannelType,
} = require('discord.js');

const ServerSettings = require('../database/models/ServerSettings');
const VerifiedUser   = require('../database/models/VerifiedUser');

module.exports = async (client, interaction) => {
  /* ╭─────────────────────────────╮
     │ 1) Slash-Commands ausführen │
     ╰─────────────────────────────╯ */
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

  /* ╭─────────────────────────────╮
     │ 2) Button-Interaktionen     │
     ╰─────────────────────────────╯ */
  if (interaction.isButton()) {
    const [action, userId, bannedWordRaw] = interaction.customId.split('_');
    const bannedWord = bannedWordRaw?.replace(/-/g, ' ') || 'unbekanntes Wort';

    /* ===== Tickets =================================================== */
    if (action === 'ticket') {
      // customId-Format: ticket_<type>_<catId>
      const ticketType = userId;                       // "support" | "verify"
      const catId      = bannedWordRaw;                // hier 3. Segment = category-ID

      const settings = await ServerSettings.findOne() || {};
      const {
        teamRoleId,
        supportRoleId,
        verifyRoleId,
      } = settings;

      const roleId = ticketType === 'support'
        ? (supportRoleId || teamRoleId)
        : (verifyRoleId  || teamRoleId);

      const parentId = catId || null;                  // ← vom Button mit­gegeben

      const channelName = `${ticketType}-${interaction.user.username}`.toLowerCase();

      const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentId ?? undefined,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone, deny:  ['ViewChannel'] },
          { id: interaction.user.id,              allow: ['ViewChannel','SendMessages','ReadMessageHistory'] },
          ...(roleId ? [{
            id: roleId,
            allow: ['ViewChannel','SendMessages','ReadMessageHistory'],
          }] : []),
        ],
      });

      await channel.send(
        `👋 **${interaction.user}**, dein ${ticketType === 'support' ? 'Support' : 'Verifizierungs'}-Ticket ist eröffnet. Ein Team-Mitglied meldet sich gleich!`,
      );

      return interaction.reply({ content: `✅ Ticket erstellt: ${channel}`, flags: 64 });
    }


    /* ===== Verwarnung ("warn_…") ===================================== */
    if (action === 'warn') {
      try {
        const target   = await client.users.fetch(userId);
        const verified = await VerifiedUser.findOne({ discordId: userId });

        if (!verified) {
          return interaction.reply({ content: '❌ Benutzer ist nicht verifiziert.', flags: 64 });
        }

        verified.warnings.push({
          reason:    `Verwarnung wegen verbotenem Wort: "${bannedWord}"`,
          issuedBy:  interaction.user.id,
          date:      new Date(),
        });
        await verified.save();

        try { await target.send(`⚠️ Du wurdest wegen des Wortes "${bannedWord}" verwarnt.`); }
        catch (err) { console.warn('DM an User fehlgeschlagen:', err); }

        return interaction.reply({ content: `✅ ${target.tag} wurde verwarnt.`, flags: 64 });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: '❌ Fehler beim Verwarnen.', flags: 64 });
      }
    }

    /* ===== Kommentar-Modal ("comment_…") ============================== */
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
              .setRequired(true),
          ),
        );

      return interaction.showModal(modal);
    }
  }

  /* ╭─────────────────────────────╮
     │ 3) Modal-Submit (Comment)   │
     ╰─────────────────────────────╯ */
  if (
    interaction.type === InteractionType.ModalSubmit &&
    interaction.customId.startsWith('commentmodal_')
  ) {
    const userId      = interaction.customId.split('_')[1];
    const commentText = interaction.fields.getTextInputValue('comment');

    const result = await VerifiedUser.findOneAndUpdate(
      { discordId: userId },
      { comment: commentText },
      { upsert: false },
    );

    if (result) {
      return interaction.reply({ content: '✅ Kommentar gespeichert.', flags: 0 });
    }
    return interaction.reply({ content: '⚠️ Kein verifizierter Benutzer gefunden.', flags: 64 });
  }
};
