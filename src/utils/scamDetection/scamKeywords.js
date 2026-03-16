/**
 * Multilingual scam detection keywords
 * Loads keywords from locale files for better maintainability
 * Supports English + server-configured language
 * Easy to extend with new languages by editing locale JSON files
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../logger');

const localeCache = {};

function loadKeywordsFromLocale(languageCode) {
  const normalizedCode = languageCode ? languageCode.toLowerCase().split('-')[0] : 'en';
  
  if (localeCache[normalizedCode]) {
    return localeCache[normalizedCode];
  }
  
  try {
    const localePath = path.join(__dirname, '..', '..', 'locales', `${normalizedCode}.json`);
    const localeData = JSON.parse(fs.readFileSync(localePath, 'utf8'));
    
    const keywords = localeData.scamKeywords || null;
    
    localeCache[normalizedCode] = keywords;
    
    return keywords;
  } catch (error) {
    logger.error('Failed to load scam keywords', { language: normalizedCode, error: error.message });
    return null;
  }
}

function getKeywordsForLanguage(languageCode) {
  const normalizedCode = languageCode ? languageCode.toLowerCase().split('-')[0] : 'en';
  const keywords = loadKeywordsFromLocale(normalizedCode);
  
  if (!keywords) {
    return loadKeywordsFromLocale('en') || { high: [], medium: [], singleWord: [] };
  }
  
  return keywords;
}

function getCombinedKeywords(serverLanguage) {
  const serverKeywords = getKeywordsForLanguage(serverLanguage);
  const englishKeywords = loadKeywordsFromLocale('en') || { high: [], medium: [], singleWord: [] };
  
  if (serverLanguage?.toLowerCase().startsWith('en')) {
    return serverKeywords;
  }
  
  return {
    high: [...new Set([...serverKeywords.high, ...englishKeywords.high])],
    medium: [...new Set([...serverKeywords.medium, ...englishKeywords.medium])],
    singleWord: [...new Set([...serverKeywords.singleWord, ...englishKeywords.singleWord])],
  };
}

module.exports = {
  getKeywordsForLanguage,
  getCombinedKeywords,
};
