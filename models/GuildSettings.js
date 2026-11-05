// ============================================================
// 📄 models/GuildSettings.js
// بيحفظ إعدادات كل سيرفر (الرومات، الشيخ الحالي، الصوت، الأذكار...) في data/guild_settings.json
// ============================================================

const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

class GuildSettings {
  constructor() {
    this.filePath = path.join(__dirname, '../data/guild_settings.json');
    this.settings = new Map();
    fs.ensureDirSync(path.dirname(this.filePath));
    this.loadSettings();
  }

  // بتحمّل الإعدادات من الملف (ولو مش موجود بتعمله)
  loadSettings() {
    try {
      if (!fs.existsSync(this.filePath)) {
        logger.warn('Settings file not found, creating a new one');
        this.saveSettings();
        return;
      }

      const data = fs.readJsonSync(this.filePath);
      for (const [guildId, settings] of Object.entries(data)) {
        this.settings.set(guildId, settings);
      }
      logger.info(`✅ Loaded settings for ${this.settings.size} server(s)`);
    } catch (error) {
      logger.error('Failed to load settings:', error.message);
    }
  }

  // بتحفظ الإعدادات في الملف
  saveSettings() {
    try {
      const data = Object.fromEntries(this.settings);
      fs.writeJsonSync(this.filePath, data, { spaces: 2 });
    } catch (error) {
      logger.error('Failed to save settings:', error.message);
    }
  }

  get(guildId) {
    if (!this.settings.has(guildId)) {
      this.settings.set(guildId, this.getDefaultSettings());
      this.saveSettings();
    }
    return this.settings.get(guildId);
  }

  getSetting(guildId, key) {
    const settings = this.get(guildId);
    return settings[key] ?? null;
  }

  set(guildId, key, value) {
    const settings = this.get(guildId);
    settings[key] = value;
    this.settings.set(guildId, settings);
    this.saveSettings();
    return true;
  }

  setMany(guildId, newSettings) {
    const settings = this.get(guildId);
    for (const [key, value] of Object.entries(newSettings)) {
      settings[key] = value;
    }
    this.settings.set(guildId, settings);
    this.saveSettings();
    return true;
  }

  delete(guildId, key) {
    const settings = this.get(guildId);
    if (settings[key] !== undefined) {
      delete settings[key];
      this.settings.set(guildId, settings);
      this.saveSettings();
      return true;
    }
    return false;
  }

  deleteAll(guildId) {
    this.settings.delete(guildId);
    this.saveSettings();
    return true;
  }

  // الإعدادات الافتراضية لأي سيرفر جديد (الشيخ، مستوى الصوت، الدولة، الأذكار...)
  getDefaultSettings() {
    return {
      controlPanelChannelId: null,
      voiceChannelId: null,
      azkarChannelId: null,
      prayerChannelId: null,
      noticeChannelId: null,

      prayerMethod: 5,
      prayerCity: 'Cairo',
      prayerCountry: 'Egypt',

      volume: 0.8,
      autoPlay: true,

      azkarInterval: 30 * 60 * 1000,
      azkarEnabled: true,

      noticeEnabled: true,
      noticeMinDelay: 6 * 60 * 60 * 1000,
      noticeMaxDelay: 14 * 60 * 60 * 1000,

      // ✅ إعدادات أمر /prayer
      adhanEnabled: true,
      adhanMentionRoleId: null,

      defaultReciter: null,
      currentSurah: 1,

      lastUpdate: Date.now()
    };
  }

  // بترجّع إعدادات السيرفر للافتراضي
  reset(guildId) {
    this.settings.set(guildId, this.getDefaultSettings());
    this.saveSettings();
    return true;
  }

  getAllGuilds() {
    return Array.from(this.settings.keys());
  }

  getAll() {
    return Object.fromEntries(this.settings);
  }
}

module.exports = new GuildSettings();