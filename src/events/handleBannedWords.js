const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const BannedWord = require('../database/models/BannedWord');
const ServerSettings = require('../database/models/ServerSettings');
const { t } = require('../utils/i18n');
const { logger } = require('../utils/logger');

// Banned words are cached so we don't hit the DB on every message. Changes made
// via /word invalidate the cache directly; changes from the web UI apply after the TTL.
const CACHE_TTL_MS = 30_000;
const MAX_MESSAGE_PREVIEW = 1000;
let cache = { loadedAt: 0, entries: [] };

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches whole words only, so "ass" no longer matches "class".
// A "*" acts as a wildcard for letters/digits, e.g. "scheiß*" also matches "scheißegal".
function compileBannedWord(word) {
  if (!word.replace(/\*/g, '').trim()) return null;
  const pattern = word.split('*').map(escapeRegex).join('[\\p{L}\\p{N}]*');
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'iu');
}

async function getBannedWords() {
  if (Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.entries;

  const words = await BannedWord.find().lean();
  const entries = [];
  for (const { word } of words) {
    const regex = compileBannedWord(word.toLowerCase());
    if (regex) entries.push({ word: word.toLowerCase(), regex });
  }
  cache = { loadedAt: Date.now(), entries };
  return entries;
}

function invalidateBannedWordsCache() {
  cache.loadedAt = 0;
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

module.exports = async function handleBannedWords(client, message) {
  if (message.author.bot) return;
  if (!message.content) return;

  const bannedWords = await getBannedWords();
  const match = bannedWords.find(entry => entry.regex.test(message.content));
  if (!match) return;

  const banned = match.word;
  const settings = await ServerSettings.findOne({ guildId: message.guildId });
  if (!settings?.adminChannelId) return;

  try {
    const adminChannel = await client.channels.fetch(settings.adminChannelId);
    if (!adminChannel) return;

    const guildId = message.guildId;

    const embed = new EmbedBuilder()
      .setTitle(await t(guildId, 'bannedWords.detected'))
      .setDescription(`**${await t(guildId, 'bannedWords.user')}:** ${message.author.tag}\n**${await t(guildId, 'bannedWords.channel')}:** <#${message.channel.id}>\n**${await t(guildId, 'bannedWords.message')}:** ${truncate(message.content, MAX_MESSAGE_PREVIEW)}`)
      .addFields({ name: await t(guildId, 'bannedWords.word'), value: `\`${banned}\`` })
      .setColor('Red')
      .setTimestamp();

    // The word is read back from the embed field when the button is clicked;
    // putting it into the customId breaks on "_" and on words that exceed the 100-char limit.
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`warn_${message.author.id}`)
        .setLabel(await t(guildId, 'bannedWords.warn'))
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(`comment_${message.author.id}`)
        .setLabel(await t(guildId, 'bannedWords.comment'))
        .setStyle(ButtonStyle.Secondary)
    );

    await adminChannel.send({
      embeds: [embed],
      components: [row]
    });
  } catch (err) {
    logger.warn('Failed to send banned word alert to admin channel', {
      guildId: message.guildId,
      bannedWord: banned,
      error: err.message,
    });
  }
};

module.exports.invalidateBannedWordsCache = invalidateBannedWordsCache;
