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
        ephemeral: true
      });
    }
  }

  if (interaction.isButton()) {
    const [action, userId] = interaction.customId.split('_');

    if (action === 'warn') {
      try {
        const target = await client.users.fetch(userId);
        await target.send('⚠️ Du wurdest wegen der Verwendung eines verbotenen Wortes verwarnt.');
        await interaction.reply({ content: '✅ Verwarnung gesendet.', ephemeral: true });
      } catch {
        await interaction.reply({ content: '❌ Konnte Verwarnung nicht senden.', ephemeral: true });
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
      await interaction.reply({ content: '✅ Kommentar gespeichert.', ephemeral: true });
    } else {
      await interaction.reply({
        content: '⚠️ Kein verifizierter Benutzer mit dieser ID gefunden.',
        ephemeral: true
      });
    }
  }
};
