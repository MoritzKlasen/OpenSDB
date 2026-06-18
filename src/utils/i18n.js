const fs = require("fs");
const path = require("path");

const ServerSettings = require("../database/models/ServerSettings");

const DEFAULT_LANG = "en";
const SUPPORTED = new Set(["de", "en", "es", "fr", "it", "tr", "zh"]);

const LOCALES = {
  en: JSON.parse(fs.readFileSync(path.join(__dirname, "..", "locales", "en.json"), "utf8")),
  de: JSON.parse(fs.readFileSync(path.join(__dirname, "..", "locales", "de.json"), "utf8")),
  es: JSON.parse(fs.readFileSync(path.join(__dirname, "..", "locales", "es.json"), "utf8")),
  fr: JSON.parse(fs.readFileSync(path.join(__dirname, "..", "locales", "fr.json"), "utf8")),
  it: JSON.parse(fs.readFileSync(path.join(__dirname, "..", "locales", "it.json"), "utf8")),
  tr: JSON.parse(fs.readFileSync(path.join(__dirname, "..", "locales", "tr.json"), "utf8")),
  zh: JSON.parse(fs.readFileSync(path.join(__dirname, "..", "locales", "zh.json"), "utf8"))
};

// Cache TTL: re-read from DB after 5 s so WebUI language changes propagate
// quickly to the bot without requiring a bot restart.
const CACHE_TTL_MS = 5_000;
const guildLangCache = new Map(); // Map<guildId, { lang: string, cachedAt: number }>

function getByPath(obj, dottedKey) {
  return dottedKey.split(".").reduce((acc, k) => (acc && acc[k] != null ? acc[k] : undefined), obj);
}

function applyPlaceholders(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : `{${name}}`));
}

async function getGuildLanguage(guildId) {
  if (!guildId) return DEFAULT_LANG;

  const entry = guildLangCache.get(guildId);
  if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) return entry.lang;

  const settings = await ServerSettings.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId, language: DEFAULT_LANG } },
    { new: true, upsert: true }
  ).lean();

  const lang = SUPPORTED.has(settings.language) ? settings.language : DEFAULT_LANG;
  guildLangCache.set(guildId, { lang, cachedAt: Date.now() });
  return lang;
}

function setGuildLanguageCache(guildId, lang) {
  if (!guildId) return;
  if (!SUPPORTED.has(lang)) return;
  guildLangCache.set(guildId, { lang, cachedAt: Date.now() });
}

async function t(guildId, key, vars) {
  const lang = await getGuildLanguage(guildId);

  let template = getByPath(LOCALES[lang], key);

  if (template == null) template = getByPath(LOCALES[DEFAULT_LANG], key);

  if (template == null) template = key;

  return applyPlaceholders(template, vars);
}

module.exports = {
  t,
  getGuildLanguage,
  setGuildLanguageCache,
  DEFAULT_LANG,
  SUPPORTED
};
