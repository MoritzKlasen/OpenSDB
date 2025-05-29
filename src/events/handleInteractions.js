const {
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
  ButtonStyle,
} = require('discord.js');

const VerifiedUser = require('../database/models/VerifiedUser');

module.exports = async function handleInteractions(client, interaction) {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(err);
      await interaction.reply({
        content: '⚠️ Fehler bei der Ausführung!',
        flags: 64
      });
    }
  }

  if (interaction.isButton()) {
    const [action, userId, bannedWordRaw] = interaction.customId.split('_');
    const bannedWord = bannedWordRaw?.replace(/-/g, ' ') || 'unbekanntes Wort';

    if (action === 'warn') {
      try {
        const target = await client.users.fetch(userId);
        const verified = await VerifiedUser.findOne({ discordId: userId });

        if (!verified) {
          return interaction.reply({
            content: '❌ Benutzer ist nicht verifiziert.',
            flags: 64
          });
        }

        // Verwarnung speichern
        verified.warnings.push({
          reason: `Verwarnung wegen verbotenem Wort: "${bannedWord}"`,
          issuedBy: interaction.user.id,
          date: new Date()
        });


        await verified.save();

        // User benachrichtigen
        try {
          await target.send(`⚠️ Du wurdest wegen der Verwendung des verbotenen Wortes "${bannedWord}" verwarnt.`);
        } catch (err) {
          console.warn('⚠️ Konnte Benutzer nicht per DM warnen:', err);
        }

        await interaction.reply({
          content: `✅ ${target.tag} wurde verwarnt und die Verwarnung wurde gespeichert.`,
          flags: 0
        });
      } catch (err) {
        console.error(err);
        await interaction.reply({
          content: '❌ Es gab einen Fehler beim Verwarnen.',
          flags: 64
        });
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

      await interaction.showModal(modal);
    }
  }

  if (
    interaction.type === InteractionType.ModalSubmit &&
    interaction.customId.startsWith('commentmodal_')
  ) {
    const userId = interaction.customId.split('_')[1];
    const commentText = interaction.fields.getTextInputValue('comment');

    const result = await VerifiedUser.findOneAndUpdate(
      { discordId: userId },
      { comment: commentText },
      { upsert: false }
    );

    if (result) {
      await interaction.reply({ content: '✅ Kommentar gespeichert.', flags: 0 });
    } else {
      await interaction.reply({
        content: '⚠️ Kein verifizierter Benutzer mit dieser ID gefunden.',
        flags: 64
      });
    }
  }
};
